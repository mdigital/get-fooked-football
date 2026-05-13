import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { asc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { submitScoreEdit, getEditHistory } from '@/lib/score-edits';
import { saveUploadedImage } from '@/lib/uploads';
import { pointsForFixture } from '@/lib/scoring';
import { fmtNzDateTime, nzZoneAbbr } from '@/lib/format';
import PasteImageField from './_paste-image';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = {
  GROUP: 'Group',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-final',
  SF: 'Semi-final',
  '3RD': '3rd-place playoff',
  FINAL: 'Final',
};

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

async function updateScore(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const id = Number(formData.get('id'));
  const stage = String(formData.get('stage') ?? 'GROUP');
  try {
    await submitScoreEdit({
      fixtureId: id,
      userId: s.userId,
      stage,
      status: String(formData.get('status') ?? 'FINISHED'),
      homeScore: parseIntOrNull(formData.get('home')),
      awayScore: parseIntOrNull(formData.get('away')),
      homeScoreEt: parseIntOrNull(formData.get('home_et')),
      awayScoreEt: parseIntOrNull(formData.get('away_et')),
      homePens: parseIntOrNull(formData.get('home_pens')),
      awayPens: parseIntOrNull(formData.get('away_pens')),
      note: String(formData.get('note') ?? '').trim() || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed';
    redirect(`/match/${id}?err=${encodeURIComponent(msg)}`);
  }
  redirect(`/match/${id}`);
}

async function addEmojiSticker(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const id = Number(formData.get('fixture_id'));
  const content = String(formData.get('emoji') ?? '').trim();
  if (!content) redirect(`/match/${id}`);
  // Trim to one grapheme so people can't dump essays into stickers.
  const grapheme = Array.from(new Intl.Segmenter().segment(content))[0]?.segment ?? content.slice(0, 4);
  await db.insert(schema.matchStickers).values({
    fixtureId: id,
    userId: s.userId,
    kind: 'emoji',
    content: grapheme,
    posX: Math.floor(Math.random() * 80) + 10,
    posY: Math.floor(Math.random() * 70) + 10,
  });
  redirect(`/match/${id}`);
}

async function addImageSticker(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const id = Number(formData.get('fixture_id'));
  const file = formData.get('image') as File | null;
  if (!file || !file.size) redirect(`/match/${id}`);
  try {
    const filePath = await saveUploadedImage(file);
    await db.insert(schema.matchStickers).values({
      fixtureId: id,
      userId: s.userId,
      kind: 'image',
      filePath,
      posX: Math.floor(Math.random() * 70) + 15,
      posY: Math.floor(Math.random() * 60) + 20,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'failed';
    redirect(`/match/${id}?err=${encodeURIComponent(msg)}`);
  }
  redirect(`/match/${id}`);
}

async function removeSticker(formData: FormData) {
  'use server';
  const s = await getSession();
  if (!s.userId) redirect('/login');
  const stickerId = Number(formData.get('sticker_id'));
  const fixtureId = Number(formData.get('fixture_id'));
  const row = await db.select().from(schema.matchStickers).where(eq(schema.matchStickers.id, stickerId)).limit(1);
  if (!row[0]) redirect(`/match/${fixtureId}`);
  if (row[0].userId !== s.userId && !s.isAdmin) redirect(`/match/${fixtureId}`);
  await db.delete(schema.matchStickers).where(eq(schema.matchStickers.id, stickerId));
  redirect(`/match/${fixtureId}`);
}

const QUICK_EMOJI = ['🔥', '😂', '⚽', '🚀', '💀', '🤡', '🐑', '👑', '🥶', '🤯', '🇳🇿', '🇦🇷'];

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id: rawId } = await params;
  const { err } = await searchParams;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();
  const session = await getSession();

  const [fixture] = await db.select().from(schema.fixtures).where(eq(schema.fixtures.id, id)).limit(1);
  if (!fixture) notFound();
  const teams = await db.select().from(schema.teams);
  const teamById = new Map(teams.map((t) => [t.id, t] as const));
  const home = fixture.homeTeamId ? teamById.get(fixture.homeTeamId) : undefined;
  const away = fixture.awayTeamId ? teamById.get(fixture.awayTeamId) : undefined;

  const stickers = await db
    .select({
      id: schema.matchStickers.id,
      kind: schema.matchStickers.kind,
      content: schema.matchStickers.content,
      filePath: schema.matchStickers.filePath,
      posX: schema.matchStickers.posX,
      posY: schema.matchStickers.posY,
      userId: schema.matchStickers.userId,
      userName: schema.users.name,
    })
    .from(schema.matchStickers)
    .leftJoin(schema.users, eq(schema.users.id, schema.matchStickers.userId))
    .where(eq(schema.matchStickers.fixtureId, id))
    .orderBy(asc(schema.matchStickers.id));

  const history = await getEditHistory(id);
  const points = pointsForFixture(fixture);
  const knockout = fixture.stage !== 'GROUP';

  return (
    <div className="space-y-6">
      <div className="brutal-card">
        <Link href="/fixtures" className="text-sm font-bold underline">
          ← All fixtures
        </Link>
        <div className="mt-2 text-xs font-bold uppercase tracking-widest">
          {STAGE_LABEL[fixture.stage] ?? fixture.stage}
          {fixture.groupName ? ` · ${fixture.groupName}` : ''}
          {' · '}
          {fmtNzDateTime(fixture.kickoff)} {nzZoneAbbr(fixture.kickoff)}
        </div>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right text-2xl font-black">
            <div className="text-4xl">{home?.flag ?? '🏳️'}</div>
            <div>{home?.name ?? fixture.homeLabel ?? 'TBD'}</div>
          </div>
          <div className="text-center text-5xl font-black tabular-nums">
            {fixture.status === 'FINISHED' ? `${fixture.homeScore}–${fixture.awayScore}` : 'vs'}
            {fixture.homePens != null && fixture.awayPens != null && (
              <div className="text-base font-bold opacity-100">
                pens {fixture.homePens}–{fixture.awayPens}
              </div>
            )}
          </div>
          <div className="text-2xl font-black">
            <div className="text-4xl">{away?.flag ?? '🏳️'}</div>
            <div>{away?.name ?? fixture.awayLabel ?? 'TBD'}</div>
          </div>
        </div>

        {fixture.status === 'FINISHED' && (
          <div className="mt-4 flex justify-center gap-3 text-sm font-bold">
            <span className="brutal-pill">{home?.code ?? 'H'} +{points.home} pts</span>
            <span className="brutal-pill">{away?.code ?? 'A'} +{points.away} pts</span>
          </div>
        )}
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">Sticker board</h2>
        <p className="text-sm opacity-100">
          Slap reactions on this match. <strong>iPhone tip:</strong> long-press a sticker in Messages or Photos →
          “Copy”, then paste it here.
        </p>

        <StickerCanvas stickers={stickers} fixtureId={id} currentUserId={session.userId} isAdmin={!!session.isAdmin} />

        {session.userId ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <form action={addEmojiSticker} className="brutal-card-inner">
              <input type="hidden" name="fixture_id" value={id} />
              <div className="text-xs font-bold uppercase">Quick reactions</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {QUICK_EMOJI.map((e) => (
                  <button key={e} name="emoji" value={e} type="submit" className="brutal-emoji-btn">
                    {e}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input className="brutal-input flex-1" name="emoji" placeholder="…or your own emoji" maxLength={4} />
                <button className="brutal-btn-primary" type="submit">Add</button>
              </div>
            </form>

            <form action={addImageSticker} encType="multipart/form-data" className="brutal-card-inner">
              <input type="hidden" name="fixture_id" value={id} />
              <div className="text-xs font-bold uppercase">Image sticker</div>
              <p className="mt-1 text-xs opacity-100">
                Paste an image (works with iPhone Stickers App after copying) or pick a file. PNG/JPG/WEBP/GIF, 6MB max.
              </p>
              <PasteImageField />
              <button className="brutal-btn-primary mt-3 w-full" type="submit">Slap it on</button>
            </form>
          </div>
        ) : (
          <p className="mt-3 text-sm">
            <Link href="/login" className="underline">Sign in</Link> to drop stickers.
          </p>
        )}
        {err && <p className="mt-3 brutal-error">{err}</p>}
      </div>

      <div className="brutal-card">
        <h2 className="brutal-h2">Update the score</h2>
        <p className="text-sm opacity-100">
          Anyone in the league can post a result — but every edit is logged below, so don’t go full Fergie time.
        </p>
        {session.userId ? (
          <form action={updateScore} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto]">
            <input type="hidden" name="id" value={fixture.id} />
            <input type="hidden" name="stage" value={fixture.stage} />
            <div className="flex items-center gap-2">
              <label className="text-sm">{home?.name ?? 'Home'}</label>
              <input className="brutal-input w-16 text-center" name="home" defaultValue={fixture.homeScore ?? ''} inputMode="numeric" />
            </div>
            <div className="self-center text-2xl font-black">–</div>
            <div className="flex items-center gap-2">
              <input className="brutal-input w-16 text-center" name="away" defaultValue={fixture.awayScore ?? ''} inputMode="numeric" />
              <label className="text-sm">{away?.name ?? 'Away'}</label>
            </div>
            <select className="brutal-input" name="status" defaultValue={fixture.status}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="LIVE">Live</option>
              <option value="FINISHED">Finished</option>
            </select>
            {knockout && (
              <>
                <div className="col-span-full text-xs font-bold uppercase opacity-100">Extra time / penalties (if needed)</div>
                <div className="flex items-center gap-2">
                  <label className="text-sm">ET home</label>
                  <input className="brutal-input w-16 text-center" name="home_et" defaultValue={fixture.homeScoreEt ?? ''} inputMode="numeric" />
                </div>
                <div className="self-center">–</div>
                <div className="flex items-center gap-2">
                  <input className="brutal-input w-16 text-center" name="away_et" defaultValue={fixture.awayScoreEt ?? ''} inputMode="numeric" />
                  <label className="text-sm">ET away</label>
                </div>
                <div />
                <div className="flex items-center gap-2">
                  <label className="text-sm">Pens home</label>
                  <input className="brutal-input w-16 text-center" name="home_pens" defaultValue={fixture.homePens ?? ''} inputMode="numeric" />
                </div>
                <div className="self-center">–</div>
                <div className="flex items-center gap-2">
                  <input className="brutal-input w-16 text-center" name="away_pens" defaultValue={fixture.awayPens ?? ''} inputMode="numeric" />
                  <label className="text-sm">Pens away</label>
                </div>
                <div />
              </>
            )}
            <input className="brutal-input col-span-full" name="note" placeholder="Optional note (source, who told you, etc.)" maxLength={200} />
            <div className="col-span-full">
              <button className="brutal-btn-primary" type="submit">Save score</button>
            </div>
          </form>
        ) : (
          <p>
            <Link href="/login" className="underline">Sign in</Link> to post a result.
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="brutal-card">
          <h2 className="brutal-h2">Edit history</h2>
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={String(h.id)} className="flex flex-wrap items-center gap-3 border-b border-current/10 py-1 text-sm">
                <span className="font-bold">{String(h.user_name)}</span>
                <span className="font-mono">
                  {(h.home_score as number | null) ?? '?'}–{(h.away_score as number | null) ?? '?'}
                  {h.home_pens != null && h.away_pens != null ? ` (pens ${String(h.home_pens)}–${String(h.away_pens)})` : ''}
                </span>
                <span className="brutal-pill text-xs">{String(h.status)}</span>
                {h.note ? <span className="opacity-100">“{String(h.note)}”</span> : null}
                <span className="ml-auto text-xs">{fmtNzDateTime(String(h.created_at))} {nzZoneAbbr(String(h.created_at))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StickerCanvas({
  stickers,
  fixtureId,
  currentUserId,
  isAdmin,
}: {
  stickers: Array<{ id: number; kind: string; content: string | null; filePath: string | null; posX: number; posY: number; userId: number; userName: string | null }>;
  fixtureId: number;
  currentUserId: number | undefined;
  isAdmin: boolean;
}) {
  return (
    <div className="brutal-canvas relative mt-3 aspect-[2/1] w-full overflow-hidden">
      {stickers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm opacity-50">
          No stickers yet — be the first.
        </div>
      )}
      {stickers.map((s) => {
        const canDelete = currentUserId != null && (s.userId === currentUserId || isAdmin);
        return (
          <div
            key={s.id}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.posX}%`, top: `${s.posY}%` }}
            title={`from ${s.userName ?? 'someone'}`}
          >
            {s.kind === 'emoji' && <span className="select-none text-5xl drop-shadow-[3px_3px_0_#000]">{s.content}</span>}
            {s.kind === 'image' && s.filePath && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={s.filePath} alt="" className="h-20 w-20 border-[3px] border-black object-cover shadow-[4px_4px_0_#000]" />
            )}
            {canDelete && (
              <form action={removeSticker} className="absolute -right-3 -top-3 opacity-0 group-hover:opacity-100">
                <input type="hidden" name="sticker_id" value={s.id} />
                <input type="hidden" name="fixture_id" value={fixtureId} />
                <button className="rounded-full bg-black px-1.5 text-xs text-white" type="submit" aria-label="remove">×</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
