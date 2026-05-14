import { describe, it, expect } from 'vitest';
import { MAX_JAB_LEN, validateJabBody } from '@/lib/profile-jabs';

describe('validateJabBody', () => {
  it('accepts a normal jab', () => {
    expect(validateJabBody('worst takes in the chat group')).toEqual({
      ok: true,
      body: 'worst takes in the chat group',
    });
  });
  it('trims whitespace', () => {
    expect(validateJabBody('   you call that a tip?   ')).toEqual({
      ok: true,
      body: 'you call that a tip?',
    });
  });
  it('rejects empty + whitespace-only bodies', () => {
    expect(validateJabBody('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateJabBody('     ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateJabBody(null)).toEqual({ ok: false, reason: 'empty' });
    expect(validateJabBody(undefined)).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects bodies past the length cap', () => {
    expect(validateJabBody('x'.repeat(MAX_JAB_LEN + 1))).toEqual({ ok: false, reason: 'too-long' });
  });
  it('accepts exactly at the limit', () => {
    expect(validateJabBody('x'.repeat(MAX_JAB_LEN))).toEqual({
      ok: true,
      body: 'x'.repeat(MAX_JAB_LEN),
    });
  });
});
