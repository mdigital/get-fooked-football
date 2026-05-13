/**
 * Seed the database with:
 *   - 48 World Cup 2026 teams (placeholder draw — admin can adjust)
 *   - All 72 group-stage fixtures across the 12 groups
 *   - Placeholder knockout-round fixtures (teams TBD until group stage finishes)
 *   - Starter prize list
 *
 * Idempotent: re-running won't duplicate rows.
 */
import { db, schema } from '../src/db/client';
import { eq, sql } from 'drizzle-orm';

type Seed = {
  code: string;
  name: string;
  flag: string;
  group: string;
  fifaRank: number;
  population: number; // people
  sheep: number; // head of sheep
};

// Population (latest UN-ish estimates) and sheep (FAOSTAT-style figures, rounded).
// Admin can edit any of these via the admin panel; numbers are approximations.
const TEAMS: Seed[] = [
  // Group A
  { code: 'MEX', name: 'Mexico', flag: '🇲🇽', group: 'A', fifaRank: 13, population: 129_000_000, sheep: 8_700_000 },
  { code: 'POL', name: 'Poland', flag: '🇵🇱', group: 'A', fifaRank: 34, population: 36_800_000, sheep: 270_000 },
  { code: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦', group: 'A', fifaRank: 56, population: 36_400_000, sheep: 18_000_000 },
  { code: 'GHA', name: 'Ghana', flag: '🇬🇭', group: 'A', fifaRank: 64, population: 34_100_000, sheep: 4_700_000 },
  // Group B
  { code: 'USA', name: 'United States', flag: '🇺🇸', group: 'B', fifaRank: 16, population: 334_900_000, sheep: 5_000_000 },
  { code: 'WAL', name: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', group: 'B', fifaRank: 30, population: 3_100_000, sheep: 9_700_000 },
  { code: 'IRN', name: 'Iran', flag: '🇮🇷', group: 'B', fifaRank: 21, population: 88_500_000, sheep: 41_300_000 },
  { code: 'SEN', name: 'Senegal', flag: '🇸🇳', group: 'B', fifaRank: 19, population: 17_900_000, sheep: 7_800_000 },
  // Group C
  { code: 'ARG', name: 'Argentina', flag: '🇦🇷', group: 'C', fifaRank: 1, population: 45_800_000, sheep: 14_400_000 },
  { code: 'DEN', name: 'Denmark', flag: '🇩🇰', group: 'C', fifaRank: 19, population: 5_900_000, sheep: 142_000 },
  { code: 'TUN', name: 'Tunisia', flag: '🇹🇳', group: 'C', fifaRank: 41, population: 12_500_000, sheep: 6_900_000 },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', group: 'C', fifaRank: 27, population: 26_400_000, sheep: 70_500_000 },
  // Group D
  { code: 'FRA', name: 'France', flag: '🇫🇷', group: 'D', fifaRank: 2, population: 68_300_000, sheep: 6_800_000 },
  { code: 'IRL', name: 'Republic of Ireland', flag: '🇮🇪', group: 'D', fifaRank: 60, population: 5_100_000, sheep: 5_300_000 },
  { code: 'CMR', name: 'Cameroon', flag: '🇨🇲', group: 'D', fifaRank: 42, population: 28_600_000, sheep: 3_500_000 },
  { code: 'CRC', name: 'Costa Rica', flag: '🇨🇷', group: 'D', fifaRank: 50, population: 5_200_000, sheep: 0 },
  // Group E
  { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'E', fifaRank: 4, population: 57_100_000, sheep: 22_800_000 },
  { code: 'CRO', name: 'Croatia', flag: '🇭🇷', group: 'E', fifaRank: 10, population: 3_900_000, sheep: 700_000 },
  { code: 'JAM', name: 'Jamaica', flag: '🇯🇲', group: 'E', fifaRank: 55, population: 2_800_000, sheep: 1_000 },
  { code: 'JPN', name: 'Japan', flag: '🇯🇵', group: 'E', fifaRank: 18, population: 124_500_000, sheep: 12_000 },
  // Group F
  { code: 'BRA', name: 'Brazil', flag: '🇧🇷', group: 'F', fifaRank: 5, population: 216_400_000, sheep: 17_100_000 },
  { code: 'SUI', name: 'Switzerland', flag: '🇨🇭', group: 'F', fifaRank: 17, population: 8_800_000, sheep: 350_000 },
  { code: 'EGY', name: 'Egypt', flag: '🇪🇬', group: 'F', fifaRank: 35, population: 112_700_000, sheep: 5_500_000 },
  { code: 'PAN', name: 'Panama', flag: '🇵🇦', group: 'F', fifaRank: 39, population: 4_500_000, sheep: 0 },
  // Group G
  { code: 'BEL', name: 'Belgium', flag: '🇧🇪', group: 'G', fifaRank: 3, population: 11_700_000, sheep: 138_000 },
  { code: 'ECU', name: 'Ecuador', flag: '🇪🇨', group: 'G', fifaRank: 31, population: 17_900_000, sheep: 1_100_000 },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', group: 'G', fifaRank: 95, population: 5_200_000, sheep: 25_300_000 },
  { code: 'ALG', name: 'Algeria', flag: '🇩🇿', group: 'G', fifaRank: 36, population: 45_400_000, sheep: 28_400_000 },
  // Group H
  { code: 'POR', name: 'Portugal', flag: '🇵🇹', group: 'H', fifaRank: 6, population: 10_300_000, sheep: 1_900_000 },
  { code: 'KOR', name: 'South Korea', flag: '🇰🇷', group: 'H', fifaRank: 22, population: 51_700_000, sheep: 0 },
  { code: 'NGA', name: 'Nigeria', flag: '🇳🇬', group: 'H', fifaRank: 40, population: 223_800_000, sheep: 47_200_000 },
  { code: 'URU', name: 'Uruguay', flag: '🇺🇾', group: 'H', fifaRank: 11, population: 3_400_000, sheep: 6_600_000 },
  // Group I
  { code: 'NED', name: 'Netherlands', flag: '🇳🇱', group: 'I', fifaRank: 7, population: 17_600_000, sheep: 800_000 },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', group: 'I', fifaRank: 49, population: 40_100_000, sheep: 825_000 },
  { code: 'CIV', name: "Côte d'Ivoire", flag: '🇨🇮', group: 'I', fifaRank: 38, population: 28_200_000, sheep: 2_500_000 },
  { code: 'UZB', name: 'Uzbekistan', flag: '🇺🇿', group: 'I', fifaRank: 68, population: 35_300_000, sheep: 18_400_000 },
  // Group J
  { code: 'GER', name: 'Germany', flag: '🇩🇪', group: 'J', fifaRank: 16, population: 83_300_000, sheep: 1_500_000 },
  { code: 'COL', name: 'Colombia', flag: '🇨🇴', group: 'J', fifaRank: 14, population: 52_100_000, sheep: 1_700_000 },
  { code: 'MAR', name: 'Morocco', flag: '🇲🇦', group: 'J', fifaRank: 12, population: 37_700_000, sheep: 21_800_000 },
  { code: 'IRQ', name: 'Iraq', flag: '🇮🇶', group: 'J', fifaRank: 58, population: 45_500_000, sheep: 9_100_000 },
  // Group K
  { code: 'ITA', name: 'Italy', flag: '🇮🇹', group: 'K', fifaRank: 9, population: 58_800_000, sheep: 6_600_000 },
  { code: 'QAT', name: 'Qatar', flag: '🇶🇦', group: 'K', fifaRank: 37, population: 2_700_000, sheep: 250_000 },
  { code: 'SRB', name: 'Serbia', flag: '🇷🇸', group: 'K', fifaRank: 33, population: 6_700_000, sheep: 1_600_000 },
  { code: 'COD', name: 'DR Congo', flag: '🇨🇩', group: 'K', fifaRank: 57, population: 102_300_000, sheep: 1_100_000 },
  // Group L
  { code: 'ESP', name: 'Spain', flag: '🇪🇸', group: 'L', fifaRank: 8, population: 48_400_000, sheep: 14_100_000 },
  { code: 'TUR', name: 'Türkiye', flag: '🇹🇷', group: 'L', fifaRank: 25, population: 85_300_000, sheep: 44_700_000 },
  { code: 'PAR', name: 'Paraguay', flag: '🇵🇾', group: 'L', fifaRank: 53, population: 6_800_000, sheep: 360_000 },
  { code: 'UKR', name: 'Ukraine', flag: '🇺🇦', group: 'L', fifaRank: 24, population: 36_700_000, sheep: 800_000 },
];

// Round-robin pairing pattern for 4 teams (positions 1..4 in each group)
const GROUP_ROUNDS: Array<[number, number][]> = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [3, 1],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

// Real WC '26 runs June 11 – July 19 2026. We slot 4 group matches per day from June 11–27,
// then KO rounds spaced out through July.
const GROUP_DAYS_START = new Date(Date.UTC(2026, 5, 11, 18, 0, 0)); // 11 Jun 2026 18:00 UTC

function dayOffset(d: Date, days: number, hour: number) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  out.setUTCHours(hour, 0, 0, 0);
  return out;
}

async function ensureTeams() {
  const existing = await db.select({ code: schema.teams.code }).from(schema.teams);
  const have = new Set(existing.map((r) => r.code));
  const toInsert = TEAMS.filter((t) => !have.has(t.code)).map((t) => ({
    code: t.code,
    name: t.name,
    flag: t.flag,
    groupName: t.group,
    fifaRank: t.fifaRank,
    population: t.population,
    sheep: t.sheep,
    stats: {},
  }));
  if (toInsert.length) {
    await db.insert(schema.teams).values(toInsert);
    console.log(`Inserted ${toInsert.length} teams.`);
  } else {
    console.log('All 48 teams already present.');
  }
}

async function ensureGroupFixtures() {
  const allTeams = await db.select().from(schema.teams);
  const byGroup = new Map<string, typeof allTeams>();
  for (const t of allTeams) {
    const arr = byGroup.get(t.groupName) ?? [];
    arr.push(t);
    byGroup.set(t.groupName, arr);
  }

  const existing = await db.select({ id: schema.fixtures.id }).from(schema.fixtures).where(eq(schema.fixtures.stage, 'GROUP'));
  if (existing.length > 0) {
    console.log(`Group fixtures already present (${existing.length}). Skipping.`);
    return;
  }

  // 12 groups, 3 rounds per group, 2 matches per round = 72 matches.
  // We schedule round 1 across days 0–5 (2 groups/day), round 2 across days 5–10, round 3 across days 10–14.
  const rows: (typeof schema.fixtures.$inferInsert)[] = [];
  const groupOrder = Array.from(byGroup.keys()).sort();
  for (let r = 0; r < 3; r++) {
    groupOrder.forEach((g, gIdx) => {
      const teams = byGroup.get(g)!;
      const dayBase = r * 5 + Math.floor(gIdx / 2);
      const hourSlots = [16, 19, 22, 1]; // four kick-offs spread across the day (UTC)
      GROUP_ROUNDS[r].forEach(([a, b], matchIdx) => {
        const hour = hourSlots[(gIdx % 2) * 2 + matchIdx];
        rows.push({
          stage: 'GROUP',
          groupName: g,
          homeTeamId: teams[a].id,
          awayTeamId: teams[b].id,
          kickoff: dayOffset(GROUP_DAYS_START, dayBase, hour),
          status: 'SCHEDULED',
        });
      });
    });
  }
  await db.insert(schema.fixtures).values(rows);
  console.log(`Inserted ${rows.length} group fixtures.`);
}

async function ensureKnockoutFixtures() {
  const existing = await db.select({ id: schema.fixtures.id }).from(schema.fixtures).where(sql`${schema.fixtures.stage} <> 'GROUP'`);
  if (existing.length > 0) {
    console.log(`KO fixtures already present (${existing.length}). Skipping.`);
    return;
  }
  // Generic placeholder bracket – admin will fill team IDs once group stage finishes.
  // 16 R32, 8 R16, 4 QF, 2 SF, 1 3rd-place, 1 Final.
  const rows: (typeof schema.fixtures.$inferInsert)[] = [];
  const start = new Date(Date.UTC(2026, 5, 28, 16, 0, 0));
  for (let i = 0; i < 16; i++) {
    rows.push({
      stage: 'R32',
      kickoff: dayOffset(start, Math.floor(i / 4), 16 + (i % 4) * 2),
      homeLabel: `R32 #${i + 1} (home)`,
      awayLabel: `R32 #${i + 1} (away)`,
      status: 'SCHEDULED',
    });
  }
  const r16Start = dayOffset(start, 6, 16);
  for (let i = 0; i < 8; i++) {
    rows.push({
      stage: 'R16',
      kickoff: dayOffset(r16Start, Math.floor(i / 2), 16 + (i % 2) * 4),
      homeLabel: `R16 #${i + 1} (home)`,
      awayLabel: `R16 #${i + 1} (away)`,
      status: 'SCHEDULED',
    });
  }
  const qfStart = dayOffset(start, 12, 16);
  for (let i = 0; i < 4; i++) {
    rows.push({
      stage: 'QF',
      kickoff: dayOffset(qfStart, Math.floor(i / 2), 16 + (i % 2) * 4),
      homeLabel: `QF #${i + 1} (home)`,
      awayLabel: `QF #${i + 1} (away)`,
      status: 'SCHEDULED',
    });
  }
  rows.push({ stage: 'SF', kickoff: dayOffset(start, 16, 20), homeLabel: 'SF1 home', awayLabel: 'SF1 away', status: 'SCHEDULED' });
  rows.push({ stage: 'SF', kickoff: dayOffset(start, 17, 20), homeLabel: 'SF2 home', awayLabel: 'SF2 away', status: 'SCHEDULED' });
  rows.push({ stage: '3RD', kickoff: dayOffset(start, 20, 16), homeLabel: 'SF1 loser', awayLabel: 'SF2 loser', status: 'SCHEDULED' });
  rows.push({ stage: 'FINAL', kickoff: dayOffset(start, 21, 19), homeLabel: 'SF1 winner', awayLabel: 'SF2 winner', status: 'SCHEDULED' });
  await db.insert(schema.fixtures).values(rows);
  console.log(`Inserted ${rows.length} knockout placeholders.`);
}

async function ensurePrizes() {
  const existing = await db.select({ id: schema.prizes.id }).from(schema.prizes);
  if (existing.length > 0) {
    console.log(`Prizes already present (${existing.length}). Skipping.`);
    return;
  }
  await db.insert(schema.prizes).values([
    { name: 'The Big One', description: 'Overall tipping champion. Winner of the main league.', amountNzd: 400, category: 'GRAND', boardKey: 'overall', sortOrder: 1 },
    { name: 'The Wool Cup', description: 'Best score weighted by total sheep across your teams. Baa-rilliant.', amountNzd: 60, category: 'BOARD', boardKey: 'sheep', sortOrder: 2 },
    { name: 'The People’s Trophy', description: 'Best score weighted by total population across your teams. Rooting for the masses.', amountNzd: 60, category: 'BOARD', boardKey: 'population', sortOrder: 3 },
    { name: 'The Wooden Spoon', description: 'Lowest finisher in the main league. Comes with bragging rights and a literal wooden spoon.', amountNzd: 20, category: 'SPECIAL', sortOrder: 90 },
    { name: 'Best Group Stage', description: 'Most points earned during the group stage only.', amountNzd: 40, category: 'SPECIAL', sortOrder: 4 },
    { name: 'Best Knockout Stage', description: 'Most points earned from the Round of 32 onwards.', amountNzd: 40, category: 'SPECIAL', sortOrder: 5 },
    { name: 'Tournament Top Scorer Owner', description: 'Whoever owns the team containing the Golden Boot winner.', amountNzd: 30, category: 'SPECIAL', sortOrder: 6 },
    { name: 'Cinderella Cup', description: 'Owner of the lowest-ranked team that progresses furthest.', amountNzd: 30, category: 'SPECIAL', sortOrder: 7 },
    { name: 'The Bin Fire', description: 'Owner of the team with the biggest goal difference deficit in the group stage.', amountNzd: 15, category: 'SPECIAL', sortOrder: 8 },
    { name: 'The InSwap League', description: 'Winner of the photo competition, decided by thumbs up votes and hot-or-not tiebreaker.', amountNzd: 50, category: 'INSWAP', sortOrder: 50 },
  ]);
  console.log('Inserted starter prize list.');
}

async function main() {
  await ensureTeams();
  await ensureGroupFixtures();
  await ensureKnockoutFixtures();
  await ensurePrizes();
  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
