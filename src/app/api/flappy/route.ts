import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { desc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { avatarFor } from '@/lib/avatar';
import { rankPersonalBests, type FlappyScoreRow } from '@/lib/flappy';

export const dynamic = 'force-dynamic';

const TOP_N = 10;
const MAX_SURVIVED_MS = 1000 * 60 * 60; // 1h sanity cap

/** Fetch + shape the top-N personal-bests board. */
async function fetchBoard() {
  const rows = await db
    .select({
      userId: schema.flappyScores.userId,
      survivedMs: schema.flappyScores.survivedMs,
      pipesCleared: schema.flappyScores.pipesCleared,
      createdAt: schema.flappyScores.createdAt,
      userIdJ: schema.users.id,
      userName: schema.users.name,
      userNickname: schema.users.nickname,
      userEmail: schema.users.email,
      userAvatar: schema.users.avatarUrl,
    })
    .from(schema.flappyScores)
    .leftJoin(schema.users, eq(schema.users.id, schema.flappyScores.userId))
    .orderBy(desc(schema.flappyScores.survivedMs))
    .limit(500);

  const shaped: FlappyScoreRow[] = rows
    .filter((r) => r.userName != null)
    .map((r) => ({
      userId: r.userId,
      survivedMs: r.survivedMs,
      pipesCleared: r.pipesCleared,
      createdAt: r.createdAt,
      user: {
        id: r.userIdJ!,
        name: r.userName!,
        nickname: r.userNickname,
        email: r.userEmail,
        avatarUrl: r.userAvatar,
      },
    }));

  const board = rankPersonalBests(shaped).slice(0, TOP_N);
  return board.map((b) => ({
    userId: b.userId,
    displayName: b.displayName,
    avatarSrc: avatarFor({ email: b.email, avatarUrl: b.avatarUrl }, 48),
    bestMs: b.bestMs,
    pipesCleared: b.pipesCleared,
  }));
}

/** Public read — anyone with the easter-egg URL can fetch the board. */
export async function GET() {
  try {
    return NextResponse.json({ board: await fetchBoard() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 500 },
    );
  }
}

/** Record a finished run for the signed-in user, then return the new board. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: { survivedMs?: unknown; pipesCleared?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const survivedMs = Math.max(0, Math.min(MAX_SURVIVED_MS, Math.round(Number(body.survivedMs) || 0)));
  const pipesCleared = Math.max(0, Math.round(Number(body.pipesCleared) || 0));

  try {
    await db.insert(schema.flappyScores).values({
      userId: session.userId!,
      survivedMs,
      pipesCleared,
    });
    const board = await fetchBoard();
    // Personal best from board (or the just-saved row).
    const me = board.find((b) => b.userId === session.userId);
    const rank = me ? board.findIndex((b) => b.userId === session.userId) + 1 : null;

    // Resolve the signed-in user's own avatar (they may not be in the top-N
    // board, so look them up directly).
    const [meUser] = await db
      .select({ email: schema.users.email, avatarUrl: schema.users.avatarUrl })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId!))
      .limit(1);
    const myAvatarSrc = meUser
      ? avatarFor({ email: meUser.email, avatarUrl: meUser.avatarUrl }, 128)
      : null;

    return NextResponse.json({
      saved: { survivedMs, pipesCleared },
      myBestMs: me?.bestMs ?? survivedMs,
      myRank: rank,
      myAvatarSrc,
      board,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed' },
      { status: 500 },
    );
  }
}
