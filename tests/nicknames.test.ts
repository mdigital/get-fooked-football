import { describe, it, expect } from 'vitest';
import {
  normalizeNickname,
  gatherNicknames,
  tallyNicknameVotes,
  type NicknameAuditRow,
} from '@/lib/nicknames';

function set(detail: string | null, userId: number | null, targetUserId: number | null = null): NicknameAuditRow {
  return { kind: 'nickname.set', detail, userId, targetUserId };
}

describe('normalizeNickname', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeNickname('  Sheep   Lord ')).toBe('sheep lord');
    expect(normalizeNickname('SHEEP LORD')).toBe('sheep lord');
  });
});

describe('gatherNicknames', () => {
  it('dedupes case-insensitively and counts assignments', () => {
    const opts = gatherNicknames([
      set('Sheep Lord', 1, 2),
      set('sheep lord', 3, 4),
      set('SHEEP LORD', 5, 6),
    ]);
    expect(opts).toHaveLength(1);
    expect(opts[0].key).toBe('sheep lord');
    expect(opts[0].assignedCount).toBe(3);
  });

  it('picks the most-frequent casing as the label (lexicographic tiebreak)', () => {
    const opts = gatherNicknames([
      set('Clanker', 1, 9),
      set('CLANKER', 2, 9),
      set('CLANKER', 3, 9),
    ]);
    expect(opts[0].label).toBe('CLANKER');
  });

  it('collects distinct tagged users (target, or the actor for self-nicknames)', () => {
    const opts = gatherNicknames([
      set('Gaffer', 1, 2), // tagged user 2
      set('Gaffer', 3, null), // self-nickname → tagged user 3
      set('Gaffer', 4, 2), // 2 again (deduped)
    ]);
    expect(opts[0].taggedUserIds).toEqual([2, 3]);
  });

  it('ignores clears, nulls and blanks', () => {
    const opts = gatherNicknames([
      { kind: 'nickname.clear', detail: null, userId: 1, targetUserId: 2 },
      set(null, 1, 2),
      set('   ', 1, 2),
      set('Legend', 1, 2),
    ]);
    expect(opts.map((o) => o.key)).toEqual(['legend']);
  });

  it('orders by assignment count then label', () => {
    const opts = gatherNicknames([
      set('Alpha', 1, 2),
      set('Beta', 1, 3),
      set('Beta', 4, 5),
    ]);
    expect(opts.map((o) => o.label)).toEqual(['Beta', 'Alpha']);
  });
});

describe('tallyNicknameVotes', () => {
  const options = gatherNicknames([set('Alpha', 1, 2), set('Beta', 1, 3), set('Beta', 4, 5)]);

  it('counts thumbs by normalized key and ranks by votes', () => {
    const ranked = tallyNicknameVotes(options, [
      { nickname: 'alpha', userId: 10 },
      { nickname: 'alpha', userId: 11 },
      { nickname: 'beta', userId: 10 },
    ]);
    expect(ranked.map((r) => [r.label, r.votes])).toEqual([
      ['Alpha', 2],
      ['Beta', 1],
    ]);
  });

  it('breaks a vote tie by assignment count then label', () => {
    // Both 0 votes → Beta (assigned twice) outranks Alpha (once).
    const ranked = tallyNicknameVotes(options, []);
    expect(ranked.map((r) => r.label)).toEqual(['Beta', 'Alpha']);
  });

  it('ignores votes for keys that are not current options', () => {
    const ranked = tallyNicknameVotes(options, [{ nickname: 'ghost', userId: 1 }]);
    expect(ranked.every((r) => r.votes === 0)).toBe(true);
  });
});
