import { db, schema } from '@/db/client';
import { eq, sql } from 'drizzle-orm';

export type ScoreInput = {
  stage: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  homeScoreEt?: number | null;
  awayScoreEt?: number | null;
  homePens?: number | null;
  awayPens?: number | null;
};

const KNOWN_STATUSES = new Set(['SCHEDULED', 'LIVE', 'FINISHED']);
const KNOWN_STAGES = new Set(['GROUP', 'R32', 'R16', 'QF', 'SF', '3RD', 'FINAL']);
const MAX_PLAUSIBLE_GOALS = 20;
const MAX_PLAUSIBLE_PENS = 15;

function check(name: string, value: unknown, opts: { allowNull?: boolean; max: number }) {
  if (value == null) {
    if (!opts.allowNull) throw new Error(`${name} is required`);
    return;
  }
  if (typeof value !== 'number') throw new Error(`${name} must be a number`);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  if (value < 0) throw new Error(`${name} cannot be negative`);
  if (value > opts.max) throw new Error(`${name} is not plausible (max ${opts.max})`);
}

/**
 * Pure validation for a proposed score edit. Throws with a human-readable message on failure.
 */
export function validateScoreEdit(input: ScoreInput): void {
  if (!KNOWN_STATUSES.has(input.status)) throw new Error(`Unknown status: ${input.status}`);
  if (!KNOWN_STAGES.has(input.stage)) throw new Error(`Unknown stage: ${input.stage}`);

  const finished = input.status === 'FINISHED';
  check('homeScore', input.homeScore, { allowNull: !finished, max: MAX_PLAUSIBLE_GOALS });
  check('awayScore', input.awayScore, { allowNull: !finished, max: MAX_PLAUSIBLE_GOALS });
  check('homeScoreEt', input.homeScoreEt, { allowNull: true, max: MAX_PLAUSIBLE_GOALS });
  check('awayScoreEt', input.awayScoreEt, { allowNull: true, max: MAX_PLAUSIBLE_GOALS });
  check('homePens', input.homePens, { allowNull: true, max: MAX_PLAUSIBLE_PENS });
  check('awayPens', input.awayPens, { allowNull: true, max: MAX_PLAUSIBLE_PENS });

  // KO matches drawn even after ET need penalty scores.
  if (finished && input.stage !== 'GROUP') {
    const drewIn90 = input.homeScore === input.awayScore;
    const etDrawn =
      drewIn90 &&
      (input.homeScoreEt ?? input.homeScore ?? 0) === (input.awayScoreEt ?? input.awayScore ?? 0);
    if (etDrawn) {
      if (input.homePens == null || input.awayPens == null) {
        throw new Error('Knockout match still drawn — enter penalty scores.');
      }
      if (input.homePens === input.awayPens) {
        throw new Error('Penalty scores cannot be equal.');
      }
    }
  }
}

export async function submitScoreEdit(opts: {
  fixtureId: number;
  /** Human editor's user id. Omit (with editorName) for an automated agent. */
  userId?: number | null;
  /** Non-human editor label, e.g. "clanker". Mutually exclusive with userId. */
  editorName?: string | null;
  stage: string;
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  homeScoreEt?: number | null;
  awayScoreEt?: number | null;
  homePens?: number | null;
  awayPens?: number | null;
  note?: string | null;
}) {
  validateScoreEdit(opts);
  if (opts.userId == null && !opts.editorName) {
    throw new Error('submitScoreEdit needs either a userId or an editorName');
  }
  await db.transaction(async (tx) => {
    await tx
      .update(schema.fixtures)
      .set({
        homeScore: opts.homeScore ?? null,
        awayScore: opts.awayScore ?? null,
        homeScoreEt: opts.homeScoreEt ?? null,
        awayScoreEt: opts.awayScoreEt ?? null,
        homePens: opts.homePens ?? null,
        awayPens: opts.awayPens ?? null,
        status: opts.status,
      })
      .where(eq(schema.fixtures.id, opts.fixtureId));
    await tx.insert(schema.scoreEdits).values({
      fixtureId: opts.fixtureId,
      userId: opts.userId ?? null,
      editorName: opts.userId == null ? opts.editorName ?? null : null,
      homeScore: opts.homeScore ?? null,
      awayScore: opts.awayScore ?? null,
      homePens: opts.homePens ?? null,
      awayPens: opts.awayPens ?? null,
      status: opts.status,
      note: opts.note ?? null,
    });
  });
}

export async function getEditHistory(fixtureId: number) {
  const result = await db.execute(sql`
    select e.id, e.user_id, coalesce(u.name, e.editor_name) as user_name, e.home_score, e.away_score,
           e.home_pens, e.away_pens, e.status, e.note, e.created_at
    from score_edits e left join users u on u.id = e.user_id
    where e.fixture_id = ${fixtureId}
    order by e.created_at desc
  `);
  return result.rows.map((r) => r as Record<string, unknown>);
}
