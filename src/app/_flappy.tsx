"use client";

/* eslint-disable @next/next/no-img-element */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Computed once on the client. This module's components only ever mount
// inside the konami portal (which renders null on the server), so `window`
// is always defined here.
const IS_TOUCH_DEVICE =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

const W = 360;
const H = 540;
const GROUND = 40;
const GRAVITY = 1100; // px/s^2
const FLAP_V = -360; // px/s
const PIPE_SPEED = 130; // px/s
const PIPE_GAP = 130;
const PIPE_W = 50;
const PIPE_INTERVAL_MS = 1400;

const CGA_BG = "#000";
const CGA_FG = "#fff";
const CGA_CYAN = "#55ffff";
const CGA_MAGENTA = "#ff55ff";

type Pipe = { x: number; gapTop: number; cleared: boolean };

// Lazily-created, module-level so it survives the modal being closed and
// reopened. Browsers suspend new AudioContexts until a user gesture resumes
// them, so `getAudioCtx` is also called from `flap()` (a real pointer/key
// event handler) to unlock it before the first programmatic beep fires.
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** A single retro square-wave blip. */
function beep(freq: number, durationMs: number, delayMs = 0, gain = 0.06) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + delayMs / 1000;
  const t1 = t0 + durationMs / 1000;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

/** Two-note chime played every 10 seconds survived. */
function playMilestoneChime() {
  beep(880, 90);
  beep(1318.5, 120, 90);
}

// Reused <audio> element for the milestone sample so we don't allocate one
// per hit. Lazily created on first use (after a user gesture has unlocked
// audio via the first flap).
let yaySfx: HTMLAudioElement | null = null;
function playMilestoneYay() {
  if (typeof window === 'undefined') return;
  if (!yaySfx) yaySfx = new Audio('/yay.mp3');
  yaySfx.currentTime = 0;
  yaySfx.play().catch(() => {});
}

// From 100s on, every 10-second mark gets the "ahh" sample.
function isAhhMilestone(sec: number) {
  return sec >= 100 && sec % 10 === 0;
}

let ahhSfx: HTMLAudioElement | null = null;
function playMilestoneAhh() {
  if (typeof window === 'undefined') return;
  if (!ahhSfx) ahhSfx = new Audio('/ahh.mp3');
  ahhSfx.currentTime = 0;
  ahhSfx.play().catch(() => {});
}

/** Descending three-note "wah-wah" played when the bird dies. */
function playDeathSound() {
  beep(392, 110, 0); // G4
  beep(311.13, 110, 110); // D#4
  beep(207.65, 260, 220); // G#3
}

/** Four-note ascending fanfare for a new personal best. */
function playPersonalBestFanfare() {
  beep(523.25, 100, 0); // C5
  beep(659.25, 100, 100); // E5
  beep(783.99, 100, 200); // G5
  beep(1046.5, 240, 300); // C6
}

type BoardRow = {
  userId: number;
  displayName: string;
  avatarSrc: string;
  bestMs: number;
  pipesCleared: number;
};
type SaveResponse = {
  saved: { survivedMs: number; pipesCleared: number };
  myBestMs: number;
  myRank: number | null;
  myAvatarSrc: string | null;
  board: BoardRow[];
};

/**
 * Fullscreen-modal Flappy Bird clone in CGA colours. Mounted by <Konami/>
 * once the cheat sequence is entered. Crash POSTs to /api/flappy and the
 * game-over screen renders the returned top-10 board.
 */
export function FlappyGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<{
    birdY: number;
    birdV: number;
    pipes: Pipe[];
    lastTimeMs: number;
    spawnTimerMs: number;
    startedAt: number;
    runtimeMs: number;
    pipesCleared: number;
    lastSoundSec: number;
    crashed: boolean;
  }>({
    birdY: H / 2,
    birdV: 0,
    pipes: [],
    lastTimeMs: 0,
    spawnTimerMs: 0,
    startedAt: 0,
    runtimeMs: 0,
    pipesCleared: 0,
    lastSoundSec: 0,
    crashed: false,
  });
  const [crashed, setCrashed] = useState(false);
  const [submitted, setSubmitted] = useState<SaveResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [canvasCss, setCanvasCss] = useState({ w: W, h: H });

  // Scale the canvas to fit short mobile viewports (the fixed 360x540
  // internal resolution is otherwise taller than many phone screens, which
  // forces a scroll to see the ground / HUD). Internal game coordinates are
  // untouched — this only changes the CSS box the canvas is painted into.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const recalc = () => {
      const rect = canvas.getBoundingClientRect();
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const viewportW = window.visualViewport?.width ?? window.innerWidth;
      const reserveBelow = 40; // hint line + breathing room
      const availableH = Math.max(200, viewportH - rect.top - reserveBelow);
      const availableW = Math.max(200, viewportW - 24);
      const ratio = W / H;
      let w = Math.min(W, availableW);
      let h = w / ratio;
      if (h > availableH) {
        h = availableH;
        w = h * ratio;
      }
      setCanvasCss({ w: Math.round(w), h: Math.round(h) });
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
    };
  }, []);

  /** Reset to a fresh game. */
  const reset = useCallback(() => {
    stateRef.current = {
      birdY: H / 2,
      birdV: 0,
      pipes: [],
      lastTimeMs: 0,
      spawnTimerMs: 0,
      startedAt: 0,
      runtimeMs: 0,
      pipesCleared: 0,
      lastSoundSec: 0,
      crashed: false,
    };
    setCrashed(false);
    setSubmitted(null);
    setSubmitError(null);
    setSubmitting(false);
    setIsNewBest(false);
  }, []);

  const flap = useCallback(() => {
    const s = stateRef.current;
    getAudioCtx(); // unlock audio on this real user gesture
    if (s.crashed) return;
    if (s.startedAt === 0) s.startedAt = performance.now();
    s.birdV = FLAP_V;
  }, []);

  /** Game loop, driven by requestAnimationFrame. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    const onFrame = (now: number) => {
      const s = stateRef.current;
      if (s.lastTimeMs === 0) s.lastTimeMs = now;
      const dt = Math.min(0.05, (now - s.lastTimeMs) / 1000);
      s.lastTimeMs = now;

      if (!s.crashed) {
        if (s.startedAt > 0) {
          s.runtimeMs = now - s.startedAt;

          // Milestone sounds are keyed off whole seconds survived. Fire once
          // each time the elapsed-seconds counter ticks up.
          const sec = Math.floor(s.runtimeMs / 1000);
          if (sec > s.lastSoundSec) {
            s.lastSoundSec = sec;
            if (isAhhMilestone(sec)) playMilestoneAhh();
            else if (sec % 25 === 0) playMilestoneYay();
            else if (sec % 10 === 0) playMilestoneChime();
            else beep(1046.5, 60);
          }

          s.birdV += GRAVITY * dt;
          s.birdY += s.birdV * dt;
          s.spawnTimerMs += dt * 1000;
          if (s.spawnTimerMs >= PIPE_INTERVAL_MS) {
            s.spawnTimerMs = 0;
            const gapTop =
              40 + Math.random() * (H - GROUND - 40 - PIPE_GAP - 40);
            s.pipes.push({ x: W + PIPE_W, gapTop, cleared: false });
          }
          for (const p of s.pipes) p.x -= PIPE_SPEED * dt;
          s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10);

          // Collision detection.
          const bx1 = 70;
          const bx2 = 70 + 24;
          const by1 = s.birdY - 12;
          const by2 = s.birdY + 12;
          if (by2 >= H - GROUND || by1 <= 0) {
            crash();
          } else {
            for (const p of s.pipes) {
              if (p.x + PIPE_W < bx1) {
                if (!p.cleared) {
                  p.cleared = true;
                  s.pipesCleared += 1;
                }
                continue;
              }
              if (p.x > bx2) continue;
              if (by1 < p.gapTop || by2 > p.gapTop + PIPE_GAP) {
                crash();
                break;
              }
            }
          }
        }
      }

      draw(ctx, s);
      raf = requestAnimationFrame(onFrame);
    };

    function crash() {
      const s = stateRef.current;
      if (s.crashed) return;
      s.crashed = true;
      setCrashed(true);
      playDeathSound();
      submitRun(s.runtimeMs, s.pipesCleared);
    }

    raf = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitRun = useCallback(
    async (survivedMs: number, pipesCleared: number) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const r = await fetch("/api/flappy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            survivedMs: Math.round(survivedMs),
            pipesCleared,
          }),
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as SaveResponse;
        setSubmitted(data);
        if (
          data.saved.survivedMs > 0 &&
          data.saved.survivedMs === data.myBestMs
        ) {
          playPersonalBestFanfare();
          setIsNewBest(true);
        }
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "failed");
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  // Input — flap on space / click / arrow up. Restart on space when crashed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === " " || e.key === "ArrowUp") {
        e.preventDefault();
        if (stateRef.current.crashed) reset();
        else flap();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flap, onClose, reset]);

  return (
    <div className="flex flex-col items-center gap-3 max-w-md mx-auto">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="border-[3px] border-cga-magenta shadow-cga"
        style={{
          width: canvasCss.w,
          height: canvasCss.h,
          imageRendering: "pixelated",
          touchAction: "none",
          WebkitTapHighlightColor: "transparent",
          WebkitTouchCallout: "none",
          userSelect: "none",
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          if (stateRef.current.crashed) reset();
          else flap();
        }}
      />
      <div className="text-xs uppercase font-bold opacity-100 text-cga-white">
        {IS_TOUCH_DEVICE
          ? "tap to flap · ✕ to close"
          : "space / click / ↑ to flap · esc to close"}
      </div>
      {crashed && (
        <GameOverPanel
          survivedMs={stateRef.current.runtimeMs}
          pipes={stateRef.current.pipesCleared}
          submitting={submitting}
          submitError={submitError}
          submitted={submitted}
          isNewBest={isNewBest}
          onRetry={reset}
        />
      )}
    </div>
  );
}

function GameOverPanel({
  survivedMs,
  pipes,
  submitting,
  submitError,
  submitted,
  isNewBest,
  onRetry,
}: {
  survivedMs: number;
  pipes: number;
  submitting: boolean;
  submitError: string | null;
  submitted: SaveResponse | null;
  isNewBest: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="w-full border-[3px] border-cga-cyan p-3 text-cga-white">
      <div className="text-lg font-bold uppercase">Game over</div>
      <div className="mt-1 text-sm">
        you lasted <strong>{formatMs(survivedMs)}</strong> · {pipes} pipe
        {pipes === 1 ? "" : "s"} cleared
      </div>
      {submitting && <div className="mt-2 text-xs opacity-100">saving…</div>}
      {submitError && (
        <div className="mt-2 text-xs text-cga-magenta">
          save failed: {submitError}
        </div>
      )}
      {isNewBest && (
        <div className="mt-2 flex flex-col items-center gap-1 border-[2px] border-cga-magenta p-2">
          <img
            src={submitted?.myAvatarSrc ?? "/flappy-high-score.png"}
            alt="New high score!"
            className="max-h-32 w-auto border-[2px] border-cga-magenta"
            style={{ objectFit: "cover" }}
          />
          <div className="text-xs font-bold uppercase text-cga-magenta">
            new high score!
          </div>
        </div>
      )}
      {submitted && (
        <div className="mt-2 text-xs">
          personal best <strong>{formatMs(submitted.myBestMs)}</strong>
          {submitted.myRank ? <> · rank #{submitted.myRank}</> : null}
        </div>
      )}
      {submitted && submitted.board.length > 0 && (
        <ol className="mt-3 space-y-1 text-sm">
          {submitted.board.map((row, i) => (
            <li
              key={row.userId}
              className="flex items-center gap-2 border-[2px] border-cga-white/60 px-2 py-1"
            >
              <span className="w-5 text-right tabular-nums">{i + 1}.</span>
              <img
                src={row.avatarSrc}
                alt={`${row.displayName}'s avatar`}
                width={20}
                height={20}
                className="border-[2px] border-current"
                style={{ width: 20, height: 20, objectFit: "cover" }}
              />
              <span className="min-w-0 flex-1 truncate">{row.displayName}</span>
              <span className="tabular-nums">{formatMs(row.bestMs)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="brutal-btn-primary text-xs"
        >
          Play again{IS_TOUCH_DEVICE ? "" : " (space)"}
        </button>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const safe = Number.isFinite(ms) && ms >= 0 ? ms : 0;
  return `${(safe / 1000).toFixed(2)}s`;
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: {
    birdY: number;
    pipes: Pipe[];
    startedAt: number;
    runtimeMs: number;
    pipesCleared: number;
    crashed: boolean;
  },
) {
  // Sky
  ctx.fillStyle = CGA_BG;
  ctx.fillRect(0, 0, W, H);

  // Subtle scanlines
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  // Pipes
  ctx.fillStyle = CGA_CYAN;
  for (const p of s.pipes) {
    ctx.fillRect(Math.round(p.x), 0, PIPE_W, Math.round(p.gapTop));
    ctx.fillRect(
      Math.round(p.x),
      Math.round(p.gapTop + PIPE_GAP),
      PIPE_W,
      H - GROUND - (p.gapTop + PIPE_GAP),
    );
  }

  // Ground
  ctx.fillStyle = CGA_FG;
  ctx.fillRect(0, H - GROUND, W, GROUND);
  ctx.fillStyle = CGA_BG;
  for (let x = 0; x < W; x += 12) ctx.fillRect(x, H - GROUND + 6, 6, 4);

  // Bird (magenta square with a black eye)
  ctx.fillStyle = CGA_MAGENTA;
  ctx.fillRect(70, Math.round(s.birdY) - 12, 24, 24);
  ctx.fillStyle = CGA_BG;
  ctx.fillRect(70 + 16, Math.round(s.birdY) - 8, 4, 4);

  // HUD
  ctx.fillStyle = CGA_FG;
  ctx.font = "bold 14px ui-monospace, monospace";
  ctx.textBaseline = "top";
  ctx.fillText(formatMs(s.runtimeMs), 8, 8);
  ctx.textAlign = "right";
  ctx.fillText(`${s.pipesCleared} pipes`, W - 8, 8);
  ctx.textAlign = "left";

  if (s.startedAt === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = CGA_CYAN;
    ctx.font = "bold 18px ui-monospace, monospace";
    ctx.fillText(
      IS_TOUCH_DEVICE ? "tap to flap" : "press SPACE to flap",
      W / 2,
      H / 2 - 30,
    );
    ctx.fillStyle = CGA_FG;
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("clear pipes, dodge the floor", W / 2, H / 2);
    ctx.textAlign = "left";
  }
}
