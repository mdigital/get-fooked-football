import { describe, it, expect } from 'vitest';
import { avatarFor, gravatarHash, gravatarUrl, GRAVATAR_BASE } from '@/lib/avatar';

describe('gravatarHash', () => {
  it('uses MD5 of trimmed lowercased email (per Gravatar spec)', () => {
    // Reference fixture from Gravatar docs: MyEmailAddress@example.com -> 0bc83cb571cd1c50ba6f3e8a78ef1346
    expect(gravatarHash('MyEmailAddress@example.com')).toBe('0bc83cb571cd1c50ba6f3e8a78ef1346');
  });
  it('is case- and whitespace-insensitive', () => {
    const a = gravatarHash('foo@bar.com');
    expect(gravatarHash('  FOO@bar.com  ')).toBe(a);
    expect(gravatarHash('Foo@Bar.Com')).toBe(a);
  });
});

describe('gravatarUrl', () => {
  it('includes the hash, size and retro default fallback', () => {
    const url = gravatarUrl('foo@bar.com', 128);
    expect(url.startsWith(GRAVATAR_BASE)).toBe(true);
    expect(url).toContain(gravatarHash('foo@bar.com'));
    expect(url).toContain('s=128');
    expect(url).toContain('d=retro');
  });
  it('defaults size to 80', () => {
    expect(gravatarUrl('foo@bar.com')).toContain('s=80');
  });
});

describe('avatarFor', () => {
  it('prefers a non-empty avatarUrl', () => {
    expect(avatarFor({ email: 'a@b.com', avatarUrl: '/uploads/me.png' })).toBe('/uploads/me.png');
  });
  it('falls back to Gravatar when avatarUrl is null/undefined/blank', () => {
    expect(avatarFor({ email: 'a@b.com' })).toBe(gravatarUrl('a@b.com'));
    expect(avatarFor({ email: 'a@b.com', avatarUrl: null })).toBe(gravatarUrl('a@b.com'));
    expect(avatarFor({ email: 'a@b.com', avatarUrl: '   ' })).toBe(gravatarUrl('a@b.com'));
  });
  it('forwards size through to Gravatar', () => {
    expect(avatarFor({ email: 'a@b.com' }, 200)).toContain('s=200');
  });
});
