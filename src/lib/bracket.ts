/**
 * Knockout-bracket resolution: pure logic for filling KO fixture slots from
 * group standings and earlier knockout results.
 *
 * Fixtures store display labels ("Group A — 2nd", "3rd: A/B/C/D/F",
 * "Winner M73") written by the seed. The M-numbers are FIFA's official match
 * numbers (73–104); since every label pair is unique we can identify each KO
 * fixture's FIFA number from its own labels and follow winner/loser
 * references without storing numbers in the schema.
 *
 * The DB-aware admin action is a thin wrapper over `planBracketUpdate`.
 */
import type { Fixture, Team } from '@/db/schema';
import { winnerSide } from './scoring';

export type ParsedLabel =
  | { kind: 'seed'; group: string; place: 1 | 2 }
  | { kind: 'third'; groups: string[] }
  | { kind: 'winner'; match: number }
  | { kind: 'loser'; match: number };

export function parseBracketLabel(label: string | null | undefined): ParsedLabel | null {
  if (!label) return null;
  let m = label.match(/^Group ([A-L]) — (1st|2nd)$/);
  if (m) return { kind: 'seed', group: m[1], place: m[2] === '1st' ? 1 : 2 };
  m = label.match(/^3rd: ([A-L](?:\/[A-L])+)$/);
  if (m) return { kind: 'third', groups: m[1].split('/') };
  m = label.match(/^Winner M(\d+)$/);
  if (m) return { kind: 'winner', match: Number(m[1]) };
  m = label.match(/^Loser M(\d+)$/);
  if (m) return { kind: 'loser', match: Number(m[1]) };
  return null;
}

/** FIFA's official match numbering, keyed by qualifier-label signature. */
const FIFA_MATCH_BY_SIGNATURE: Record<string, number> = {
  '2A|2B': 73, '1E|3ABCDF': 74, '1F|2C': 75, '1C|2F': 76,
  '1I|3CDFGH': 77, '2E|2I': 78, '1A|3CEFHI': 79, '1L|3EHIJK': 80,
  '1D|3BEFIJ': 81, '1G|3AEHIJ': 82, '2K|2L': 83, '1H|2J': 84,
  '1B|3EFGIJ': 85, '1J|2H': 86, '1K|3DEIJL': 87, '2D|2G': 88,
  'W74|W77': 89, 'W73|W75': 90, 'W76|W78': 91, 'W79|W80': 92,
  'W83|W84': 93, 'W81|W82': 94, 'W86|W88': 95, 'W85|W87': 96,
  'W89|W90': 97, 'W93|W94': 98, 'W91|W92': 99, 'W95|W96': 100,
  'W97|W98': 101, 'W99|W100': 102, 'RU101|RU102': 103, 'W101|W102': 104,
};

function labelSignature(parsed: ParsedLabel): string {
  switch (parsed.kind) {
    case 'seed': return `${parsed.place}${parsed.group}`;
    case 'third': return `3${parsed.groups.join('')}`;
    case 'winner': return `W${parsed.match}`;
    case 'loser': return `RU${parsed.match}`;
  }
}

/** The FIFA match number (73–104) of a KO fixture, derived from its labels. */
export function fifaMatchNumber(f: Pick<Fixture, 'homeLabel' | 'awayLabel'>): number | null {
  const home = parseBracketLabel(f.homeLabel);
  const away = parseBracketLabel(f.awayLabel);
  if (!home || !away) return null;
  return FIFA_MATCH_BY_SIGNATURE[`${labelSignature(home)}|${labelSignature(away)}`] ?? null;
}

export interface StandingRow {
  teamId: number;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

type RankByTeam = Map<number, number>;

function emptyRow(teamId: number, group: string): StandingRow {
  return { teamId, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

function tally(rows: Map<number, StandingRow>, fixtures: Fixture[]) {
  for (const f of fixtures) {
    if (f.status !== 'FINISHED' || f.homeTeamId == null || f.awayTeamId == null) continue;
    const h = rows.get(f.homeTeamId);
    const a = rows.get(f.awayTeamId);
    if (!h || !a) continue;
    const hs = f.homeScore ?? 0;
    const as = f.awayScore ?? 0;
    h.played += 1; a.played += 1;
    h.gf += hs; h.ga += as;
    a.gf += as; a.ga += hs;
    if (hs > as) { h.won += 1; a.lost += 1; h.points += 3; }
    else if (as > hs) { a.won += 1; h.lost += 1; a.points += 3; }
    else { h.drawn += 1; a.drawn += 1; h.points += 1; a.points += 1; }
    h.gd = h.gf - h.ga;
    a.gd = a.gf - a.ga;
  }
}

const byRecord = (a: StandingRow, b: StandingRow) => b.points - a.points || b.gd - a.gd || b.gf - a.gf;

/**
 * FIFA group ordering: points, overall GD, overall GF; teams still level are
 * re-ranked by head-to-head points/GD/GF among themselves; remaining ties
 * fall back to FIFA rank (we don't track fair-play points), then team id.
 */
function sortGroup(rows: StandingRow[], groupFixtures: Fixture[], rankByTeam: RankByTeam): StandingRow[] {
  const fallback = (a: StandingRow, b: StandingRow) =>
    (rankByTeam.get(a.teamId) ?? 999) - (rankByTeam.get(b.teamId) ?? 999) || a.teamId - b.teamId;

  const sorted = rows.slice().sort((a, b) => byRecord(a, b) || fallback(a, b));

  // Re-rank each maximal run of teams level on points/GD/GF by their
  // head-to-head mini-table.
  const out: StandingRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && byRecord(sorted[i], sorted[j]) === 0) j++;
    const run = sorted.slice(i, j);
    if (run.length > 1) {
      const ids = new Set(run.map((r) => r.teamId));
      const mini = new Map(run.map((r) => [r.teamId, emptyRow(r.teamId, r.group)] as const));
      tally(mini, groupFixtures.filter((f) =>
        f.homeTeamId != null && f.awayTeamId != null && ids.has(f.homeTeamId) && ids.has(f.awayTeamId),
      ));
      run.sort((a, b) => byRecord(mini.get(a.teamId)!, mini.get(b.teamId)!) || fallback(a, b));
    }
    out.push(...run);
    i = j;
  }
  return out;
}

/** Per-group standings from finished GROUP fixtures, fully ordered. */
export function computeGroupStandings(fixtures: Fixture[], teams: Team[]): Map<string, StandingRow[]> {
  const rankByTeam: RankByTeam = new Map(teams.map((t) => [t.id, t.fifaRank] as const));
  const rows = new Map<number, StandingRow>(teams.map((t) => [t.id, emptyRow(t.id, t.groupName)] as const));
  const groupFixtures = fixtures.filter((f) => f.stage === 'GROUP');
  tally(rows, groupFixtures);

  const byGroup = new Map<string, StandingRow[]>();
  for (const row of rows.values()) {
    const arr = byGroup.get(row.group) ?? [];
    arr.push(row);
    byGroup.set(row.group, arr);
  }
  const out = new Map<string, StandingRow[]>();
  for (const [group, arr] of [...byGroup.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    out.set(group, sortGroup(arr, groupFixtures.filter((f) => groupOf(f, rows) === group), rankByTeam));
  }
  return out;
}

function groupOf(f: Fixture, rows: Map<number, StandingRow>): string | null {
  if (f.groupName) return f.groupName;
  return (f.homeTeamId != null && rows.get(f.homeTeamId)?.group) || null;
}

/** Third-placed teams of complete groups, ranked by points/GD/GF. */
export function rankThirdPlaces(standings: Map<string, StandingRow[]>): StandingRow[] {
  const thirds: StandingRow[] = [];
  for (const rows of standings.values()) {
    if (rows.length === 4 && rows.every((r) => r.played === 3)) thirds.push(rows[2]);
  }
  return thirds.sort((a, b) => byRecord(a, b) || a.teamId - b.teamId);
}

export interface SlotFill {
  fixtureId: number;
  side: 'home' | 'away';
  teamId: number;
  label: string;
}

export interface SlotChoice {
  fixtureId: number;
  side: 'home' | 'away';
  label: string;
  candidateTeamIds: number[];
}

/**
 * Compute every KO slot that can be filled from current results.
 *
 * - Group winners/runners-up fill once their group is complete.
 * - Winner/Loser references fill once the referenced match is FINISHED.
 * - Best-eight third-place slots fill only when ALL groups are complete;
 *   slots whose allocation FIFA leaves ambiguous come back as `choices`
 *   (candidate thirds satisfying the slot's group constraint) for the admin
 *   to confirm against the published bracket.
 */
export function planBracketUpdate(fixtures: Fixture[], teams: Team[]): { fills: SlotFill[]; choices: SlotChoice[] } {
  const fills: SlotFill[] = [];
  const choices: SlotChoice[] = [];

  const standings = computeGroupStandings(fixtures, teams);
  const isComplete = (group: string) => {
    const rows = standings.get(group);
    return !!rows && rows.length === 4 && rows.every((r) => r.played === 3);
  };
  const allGroupsComplete = [...standings.keys()].every(isComplete);

  const ko = fixtures.filter((f) => f.stage !== 'GROUP');
  const byMatchNumber = new Map<number, Fixture>();
  for (const f of ko) {
    const n = fifaMatchNumber(f);
    if (n != null) byMatchNumber.set(n, f);
  }

  // Thirds already placed anywhere in the R32 round are off the table.
  const placedInR32 = new Set(
    ko.filter((f) => f.stage === 'R32').flatMap((f) => [f.homeTeamId, f.awayTeamId]).filter((x): x is number => x != null),
  );
  const qualifiedThirds = allGroupsComplete
    ? rankThirdPlaces(standings).slice(0, 8).filter((t) => !placedInR32.has(t.teamId))
    : [];

  type ThirdSlot = { fixture: Fixture; side: 'home' | 'away'; label: string; groups: string[] };
  const thirdSlots: ThirdSlot[] = [];

  for (const f of ko) {
    for (const side of ['home', 'away'] as const) {
      if ((side === 'home' ? f.homeTeamId : f.awayTeamId) != null) continue;
      const label = side === 'home' ? f.homeLabel : f.awayLabel;
      const parsed = parseBracketLabel(label);
      if (!parsed) continue;

      if (parsed.kind === 'seed') {
        if (!isComplete(parsed.group)) continue;
        const row = standings.get(parsed.group)![parsed.place - 1];
        fills.push({ fixtureId: f.id, side, teamId: row.teamId, label: label! });
      } else if (parsed.kind === 'winner' || parsed.kind === 'loser') {
        const src = byMatchNumber.get(parsed.match);
        if (!src || src.status !== 'FINISHED' || src.homeTeamId == null || src.awayTeamId == null) continue;
        const w = winnerSide(src);
        if (w === 'draw') continue;
        const winnerId = w === 'home' ? src.homeTeamId : src.awayTeamId;
        const loserId = w === 'home' ? src.awayTeamId : src.homeTeamId;
        fills.push({ fixtureId: f.id, side, teamId: parsed.kind === 'winner' ? winnerId : loserId, label: label! });
      } else if (parsed.kind === 'third' && allGroupsComplete) {
        thirdSlots.push({ fixture: f, side, label: label!, groups: parsed.groups });
      }
    }
  }

  // Constraint-propagate the third-place allocation: fill slots that are
  // forced (one candidate left, or a third that fits only one slot), repeat
  // to fixpoint, and surface the rest as admin choices.
  const pool = new Map(qualifiedThirds.map((t) => [t.teamId, t] as const));
  const candidatesFor = (slot: ThirdSlot) =>
    [...pool.values()].filter((t) => slot.groups.includes(t.group)).map((t) => t.teamId);
  const open = [...thirdSlots];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = open.length - 1; i >= 0; i--) {
      const slot = open[i];
      const cands = candidatesFor(slot);
      const forced =
        cands.length === 1
          ? cands[0]
          : cands.find((id) => {
              const t = pool.get(id)!;
              return open.every((s) => s === slot || !s.groups.includes(t.group));
            });
      if (forced != null) {
        fills.push({ fixtureId: slot.fixture.id, side: slot.side, teamId: forced, label: slot.label });
        pool.delete(forced);
        open.splice(i, 1);
        progressed = true;
      }
    }
  }
  for (const slot of open) {
    choices.push({
      fixtureId: slot.fixture.id,
      side: slot.side,
      label: slot.label,
      candidateTeamIds: candidatesFor(slot),
    });
  }

  fills.sort((a, b) => a.fixtureId - b.fixtureId || (a.side === 'home' ? 0 : 1) - (b.side === 'home' ? 0 : 1));
  return { fills, choices };
}
