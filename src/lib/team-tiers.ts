/**
 * Sort teams into "favourites / mid-table / underdogs" for the preference-
 * picker dropdowns. Polymarket price wins when any team has it set, otherwise
 * we fall back to FIFA rank (lower rank number = better team).
 *
 * Pure — no DB, no React.
 */

export type TierableTeam = {
  id: number;
  polymarketPrice: number | string;
  fifaRank: number;
};

export type TierBreakdown<T extends TierableTeam> = {
  ranked: T[];
  favourites: T[];
  midtable: T[];
  underdogs: T[];
  /** True when Polymarket has been synced (at least one team has a non-zero price). */
  havePrices: boolean;
};

const FAV_COUNT = 8;
const MID_COUNT = 16;

export function buildTeamTiers<T extends TierableTeam>(teams: ReadonlyArray<T>): TierBreakdown<T> {
  const havePrices = teams.some((t) => Number(t.polymarketPrice) > 0);
  const ranked = [...teams].sort((a, b) => {
    if (havePrices) return Number(b.polymarketPrice) - Number(a.polymarketPrice);
    // Lower FIFA rank = stronger team. Default any missing values to 999
    // so they sink to the underdogs tier rather than leading the table.
    const ra = Number.isFinite(a.fifaRank) ? a.fifaRank : 999;
    const rb = Number.isFinite(b.fifaRank) ? b.fifaRank : 999;
    return ra - rb;
  });
  return {
    ranked,
    favourites: ranked.slice(0, FAV_COUNT),
    midtable: ranked.slice(FAV_COUNT, FAV_COUNT + MID_COUNT),
    underdogs: ranked.slice(FAV_COUNT + MID_COUNT),
    havePrices,
  };
}
