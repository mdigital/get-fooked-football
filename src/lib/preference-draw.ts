/**
 * Preference-aware draw.
 *
 * Goals (in order):
 *   1. Every player gets exactly one "top seed" — a team in the top N by
 *      Polymarket price (where N = player count). No one gets stuck with all
 *      no-hopers.
 *   2. Where possible, honour each player's 3 preferences.
 *   3. The remaining (non-top, non-preferred) teams are distributed so each
 *      player's total Polymarket price is as close to even as we can manage.
 *   4. Anything that can't be assigned (the math remainder) goes into the
 *      leftover pool, used for side prizes.
 *
 * Pure: takes plain data + a seeded RNG; no DB. Easy to test.
 */

export type DrawTeam = { id: number; polymarketPrice: number | string };
export type DrawPlayer = { id: number; preferences: number[] };
export type DrawAssignment = { teamId: number; userId: number | null; isLeftover: boolean; isTopSeed: boolean };

export type DrawResult = {
  assignments: DrawAssignment[];
  teamsPerPlayer: number;
  leftover: number;
  perPlayerOdds: Record<number, number>;
};

function priceOf(t: DrawTeam): number {
  return typeof t.polymarketPrice === 'number' ? t.polymarketPrice : Number(t.polymarketPrice);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function planPreferenceDraw(opts: {
  teams: DrawTeam[];
  players: DrawPlayer[];
  rng: () => number;
}): DrawResult {
  const { teams, players, rng } = opts;
  if (players.length === 0) throw new Error('No players registered');
  if (teams.length === 0) throw new Error('No teams to draw');

  const teamsPerPlayer = Math.floor(teams.length / players.length);
  if (teamsPerPlayer === 0) {
    // More players than teams — everything goes leftover.
    return {
      assignments: teams.map((t) => ({ teamId: t.id, userId: null, isLeftover: true, isTopSeed: false })),
      teamsPerPlayer: 0,
      leftover: teams.length,
      perPlayerOdds: Object.fromEntries(players.map((p) => [p.id, 0])),
    };
  }

  // 1. Sort teams desc by polymarket price. Top N = seed tier.
  const sortedByPrice = teams.slice().sort((a, b) => priceOf(b) - priceOf(a));
  const N = players.length;
  const topSeeds = new Set(sortedByPrice.slice(0, N).map((t) => t.id));
  const poolTeams = sortedByPrice.slice(N); // descending price

  // Working state
  const teamOwner = new Map<number, number | null>();
  const owned = new Map<number, number[]>(); // userId -> teamIds
  const oddsByPlayer = new Map<number, number>();
  for (const p of players) {
    owned.set(p.id, []);
    oddsByPlayer.set(p.id, 0);
  }
  const teamById = new Map(teams.map((t) => [t.id, t]));

  function assign(teamId: number, userId: number) {
    teamOwner.set(teamId, userId);
    owned.get(userId)!.push(teamId);
    oddsByPlayer.set(userId, (oddsByPlayer.get(userId) ?? 0) + priceOf(teamById.get(teamId)!));
  }

  // 2. Top-seed matching. Iterate players in fixed id order so behaviour is
  //    predictable. Each player gets their highest-ranked preference that is
  //    (a) a top seed and (b) still unclaimed. Players with no usable top-seed
  //    preference get a top seed at random in step 3.
  for (const p of players) {
    for (const wantedId of p.preferences) {
      if (!topSeeds.has(wantedId)) continue;
      if (teamOwner.has(wantedId)) continue;
      assign(wantedId, p.id);
      break;
    }
  }

  // 3. Random top-seed assignment for players who didn't snag a preferred one.
  const remainingTopSeeds = shuffle(
    sortedByPrice.slice(0, N).filter((t) => !teamOwner.has(t.id)),
    rng,
  );
  for (const p of players) {
    if (owned.get(p.id)!.some((tid) => topSeeds.has(tid))) continue;
    const next = remainingTopSeeds.pop();
    if (!next) break; // shouldn't happen by construction
    assign(next.id, p.id);
  }

  // 4. Remaining preferences from the pool.
  const poolSet = new Set(poolTeams.map((t) => t.id));
  for (const p of players) {
    for (const wantedId of p.preferences) {
      if (!poolSet.has(wantedId)) continue;
      if (teamOwner.has(wantedId)) continue;
      if (owned.get(p.id)!.length >= teamsPerPlayer) break;
      assign(wantedId, p.id);
    }
  }

  // 5. Balanced fill — for each remaining pool team (desc by price), give it
  //    to the player who (a) still has open slots and (b) has the lowest
  //    cumulative odds so far. Going desc by price means high-value teams
  //    head to the players who need lifting; the remaining low-value teams
  //    naturally even things out.
  const remainingPool = poolTeams.filter((t) => !teamOwner.has(t.id));
  // Stable secondary sort: random tie-breaker per team using the RNG, so
  // identically-priced teams don't always land with the same player.
  const tiebreaker = new Map(remainingPool.map((t) => [t.id, rng()] as const));
  remainingPool.sort((a, b) => {
    const dp = priceOf(b) - priceOf(a);
    if (dp !== 0) return dp;
    return (tiebreaker.get(a.id) ?? 0) - (tiebreaker.get(b.id) ?? 0);
  });

  for (const team of remainingPool) {
    // Find a player with the fewest odds and an open slot.
    let bestPlayer: number | null = null;
    let bestOdds = Infinity;
    for (const p of players) {
      if (owned.get(p.id)!.length >= teamsPerPlayer) continue;
      const o = oddsByPlayer.get(p.id) ?? 0;
      if (o < bestOdds) {
        bestOdds = o;
        bestPlayer = p.id;
      }
    }
    if (bestPlayer == null) break; // everyone is full
    assign(team.id, bestPlayer);
  }

  // 6. Whatever's left → leftover pool.
  const assignments: DrawAssignment[] = teams.map((t) => {
    const owner = teamOwner.get(t.id);
    if (owner == null) {
      return { teamId: t.id, userId: null, isLeftover: true, isTopSeed: topSeeds.has(t.id) };
    }
    return { teamId: t.id, userId: owner, isLeftover: false, isTopSeed: topSeeds.has(t.id) };
  });

  const perPlayerOdds: Record<number, number> = {};
  for (const [uid, odds] of oddsByPlayer) perPlayerOdds[uid] = Math.round(odds * 10000) / 10000;

  return {
    assignments,
    teamsPerPlayer,
    leftover: assignments.filter((a) => a.isLeftover).length,
    perPlayerOdds,
  };
}
