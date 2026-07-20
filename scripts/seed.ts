/**
 * Seed the database with the real 2026 World Cup draw:
 *   - 48 teams parsed from `scripts/data/fixtures.csv`
 *   - FIFA ranks joined from `scripts/data/rankings.csv`
 *   - All 104 fixtures (72 group + 32 knockout) at their real kick-off times
 *   - Starter prize list
 *
 * **Destructive**: wipes team_preferences, team_assignments, fixtures and teams
 * before reinserting so the draw/schedule always matches the CSVs. Prizes are
 * left alone if they're already present.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, schema } from '../src/db/client';
import {
  buildTeamSeeds,
  formatBracketLabel,
  parseFixtures,
  parseRankings,
} from '../src/lib/seed-data';

async function reseedTeamsAndFixtures() {
  const fixturesCsv = readFileSync(resolve(__dirname, 'data/fixtures.csv'), 'utf8');
  const rankingsCsv = readFileSync(resolve(__dirname, 'data/rankings.csv'), 'utf8');
  const fixtures = parseFixtures(fixturesCsv);
  const rankings = parseRankings(rankingsCsv);
  const teamSeeds = buildTeamSeeds(rankings, fixtures);

  // FK order: drop preferences + assignments + fixtures first, then teams.
  await db.delete(schema.teamPreferences);
  await db.delete(schema.teamAssignments);
  await db.delete(schema.fixtures);
  await db.delete(schema.teams);

  const inserted = await db
    .insert(schema.teams)
    .values(
      teamSeeds.map((t) => ({
        code: t.code,
        name: t.name,
        flag: t.flag,
        groupName: t.groupName,
        fifaRank: t.fifaRank,
        population: t.population,
        sheep: t.sheep,
        stats: {},
      })),
    )
    .returning({ id: schema.teams.id, code: schema.teams.code });

  const idByCode = new Map(inserted.map((r) => [r.code, r.id] as const));
  console.log(`Inserted ${inserted.length} teams.`);

  const fixtureRows: (typeof schema.fixtures.$inferInsert)[] = fixtures.map((f) => {
    const venue = f.city && f.city !== f.venue.replace(/ Stadium$/, '') ? `${f.venue} (${f.city})` : f.venue;
    return {
      stage: f.stage,
      groupName: f.groupName,
      venue,
      kickoff: f.kickoff,
      homeTeamId: f.homeCode ? idByCode.get(f.homeCode) ?? null : null,
      awayTeamId: f.awayCode ? idByCode.get(f.awayCode) ?? null : null,
      homeLabel: f.homeCode ? null : formatBracketLabel(f.homeRaw),
      awayLabel: f.awayCode ? null : formatBracketLabel(f.awayRaw),
      status: 'SCHEDULED',
    };
  });
  await db.insert(schema.fixtures).values(fixtureRows);
  console.log(`Inserted ${fixtureRows.length} fixtures.`);
}

async function ensurePrizes() {
  const existing = await db
    .select({ id: schema.prizes.id, pct: schema.prizes.pctOfPot, awarded: schema.prizes.awardedUserId })
    .from(schema.prizes);
  const needsReset = existing.length === 0 || existing.some((p) => Number(p.pct) === 0);
  if (!needsReset) {
    console.log(`Prizes already present (${existing.length}). Skipping.`);
    return;
  }
  if (existing.some((p) => p.awarded != null)) {
    console.log('Some prizes are already awarded — refusing to reset. Edit them manually.');
    return;
  }
  await db.delete(schema.prizes);
  await db.insert(schema.prizes).values([
    { name: 'The Big One',                 description: 'Overall tipping champion. Winner of the main league.',                                pctOfPot: '50.00', category: 'GRAND',   boardKey: 'overall',       sortOrder: 1 },
    { name: 'Best Group Stage',            description: 'Most points earned during the group stage only.',                                     pctOfPot: '8.00',  category: 'SPECIAL', boardKey: 'group_only',    sortOrder: 4 },
    { name: 'Best Knockout Stage',         description: 'Most points earned from the Round of 32 onwards.',                                    pctOfPot: '8.00',  category: 'SPECIAL', boardKey: 'ko_only',       sortOrder: 5 },
    { name: 'The Wool Cup',                description: 'Best score weighted by total sheep across your teams.',                               pctOfPot: '6.00',  category: 'BOARD',   boardKey: 'sheep',         sortOrder: 2 },
    { name: 'The People’s Trophy',         description: 'Best score weighted by total population across your teams.',                          pctOfPot: '6.00',  category: 'BOARD',   boardKey: 'population',    sortOrder: 3 },
    { name: 'The InSwap League',           description: 'Winner of the photo competition. Thumbs up + hot-or-not tiebreaker.',                 pctOfPot: '6.00',  category: 'INSWAP',                             sortOrder: 50 },
    { name: 'Tournament Top Scorer Owner', description: 'Whoever owns the team containing the Golden Boot winner.',                            pctOfPot: '4.00',  category: 'SPECIAL',                            sortOrder: 6 },
    { name: 'Cinderella Cup',              description: 'Owner of the lowest-ranked team that progresses furthest.',                           pctOfPot: '4.00',  category: 'SPECIAL',                            sortOrder: 7 },
    { name: 'The Bin Fire',                description: 'Owner of the team with the biggest goal difference deficit in the group stage.',      pctOfPot: '3.00',  category: 'SPECIAL',                            sortOrder: 8 },
    { name: 'The Wooden Spoon',            description: 'Lowest finisher in the main league. Bragging rights and a literal wooden spoon.',     pctOfPot: '3.00',  category: 'SPECIAL',                            sortOrder: 90 },
    { name: 'Underdog Cup',                description: 'Best score weighted by your teams’ average FIFA rank — worse draw, bigger boost.',    pctOfPot: '2.00',  category: 'BOARD',   boardKey: 'fifa_underdog', sortOrder: 9 },
  ]);
  console.log('Inserted prize list (percentages sum to 100).');
}

async function main() {
  await reseedTeamsAndFixtures();
  await ensurePrizes();
  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
