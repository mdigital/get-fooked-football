import { describe, it, expect } from 'vitest';
import { isAuthorizedCron } from '@/lib/cron-auth';

describe('isAuthorizedCron', () => {
  it('accepts a matching Bearer token', () => {
    expect(isAuthorizedCron('Bearer s3cr3t', 's3cr3t')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isAuthorizedCron('Bearer nope', 's3cr3t')).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    expect(isAuthorizedCron(null, 's3cr3t')).toBe(false);
    expect(isAuthorizedCron('', 's3cr3t')).toBe(false);
  });

  it('rejects when the secret is not configured (fail closed)', () => {
    expect(isAuthorizedCron('Bearer anything', undefined)).toBe(false);
    expect(isAuthorizedCron('Bearer anything', '')).toBe(false);
  });

  it('requires the Bearer scheme, not a bare token', () => {
    expect(isAuthorizedCron('s3cr3t', 's3cr3t')).toBe(false);
  });

  it('does not match on a length-mismatched token', () => {
    expect(isAuthorizedCron('Bearer s3cr3t-extra', 's3cr3t')).toBe(false);
  });
});
