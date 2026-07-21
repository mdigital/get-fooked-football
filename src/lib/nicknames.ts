/**
 * Pure helpers for the nickname voting page.
 *
 * Nicknames aren't a table — they're harvested from the audit log. Every
 * `nickname.set` event's `detail` is the raw nickname string (see
 * setNicknameAction). We dedupe those case-insensitively into vote options and
 * tally thumbs against a normalized key so casing drift never splits the vote.
 */

/** Canonical vote key: trimmed, internal whitespace collapsed, lowercased. */
export function normalizeNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type NicknameAuditRow = {
  kind: string;
  detail: string | null;
  userId: number | null;
  targetUserId: number | null;
};

export type NicknameOption = {
  /** Normalized key used for votes. */
  key: string;
  /** Prettiest representative casing to show. */
  label: string;
  /** How many times this nickname was assigned (popularity, for tie-breaks). */
  assignedCount: number;
  /** Distinct users who were ever tagged with it. */
  taggedUserIds: number[];
};

/**
 * Collapse `nickname.set` audit rows into distinct vote options. The tagged
 * user for a row is `targetUserId ?? userId` (a self-nickname has no target).
 * The display label is the most-used original casing (ties → lexicographic).
 */
export function gatherNicknames(rows: ReadonlyArray<NicknameAuditRow>): NicknameOption[] {
  const byKey = new Map<
    string,
    { labels: Map<string, number>; total: number; tagged: Set<number> }
  >();

  for (const r of rows) {
    if (r.kind !== 'nickname.set') continue;
    const raw = (r.detail ?? '').trim();
    if (!raw) continue;
    const key = normalizeNickname(raw);
    if (!key) continue;
    const entry = byKey.get(key) ?? { labels: new Map<string, number>(), total: 0, tagged: new Set<number>() };
    entry.labels.set(raw, (entry.labels.get(raw) ?? 0) + 1);
    entry.total += 1;
    const tagged = r.targetUserId ?? r.userId;
    if (tagged != null) entry.tagged.add(tagged);
    byKey.set(key, entry);
  }

  const out: NicknameOption[] = [];
  for (const [key, entry] of byKey) {
    // Representative label: most frequent casing, lexicographic tiebreak.
    let label = '';
    let best = -1;
    for (const [lbl, n] of [...entry.labels].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (n > best) {
        best = n;
        label = lbl;
      }
    }
    out.push({ key, label, assignedCount: entry.total, taggedUserIds: [...entry.tagged].sort((a, b) => a - b) });
  }

  out.sort((a, b) => b.assignedCount - a.assignedCount || a.label.localeCompare(b.label));
  return out;
}

export type NicknameVoteInput = { nickname: string; userId: number };
export type RankedNickname = NicknameOption & { votes: number };

/**
 * Rank options by thumbs. Votes are counted by normalized key, so votes for a
 * key that isn't a current option (orphaned by a junk POST) are simply ignored.
 */
export function tallyNicknameVotes(
  options: ReadonlyArray<NicknameOption>,
  votes: ReadonlyArray<NicknameVoteInput>,
): RankedNickname[] {
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.nickname, (counts.get(v.nickname) ?? 0) + 1);
  const ranked = options.map((o) => ({ ...o, votes: counts.get(o.key) ?? 0 }));
  ranked.sort(
    (a, b) => b.votes - a.votes || b.assignedCount - a.assignedCount || a.label.localeCompare(b.label),
  );
  return ranked;
}
