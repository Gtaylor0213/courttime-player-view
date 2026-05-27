import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.stubEnv('RESEND_API_KEY', 're_test_key');
vi.stubEnv('APP_URL', 'https://app.courttime.test');

global.fetch = fetchMock as typeof fetch;

import {
  buildMemberSetupInviteHtml,
  consumeSetupToken,
  generateSetupToken,
  normalizeWhitelistEmail,
  validateSetupToken,
} from '../memberSetupInviteService';

describe('memberSetupInviteService', () => {
  beforeEach(() => {
    queryMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  describe('normalizeWhitelistEmail', () => {
    it('lowercases and trims email', () => {
      expect(normalizeWhitelistEmail('  Player@Club.COM  ')).toBe('player@club.com');
    });

    it('returns null for empty values', () => {
      expect(normalizeWhitelistEmail('')).toBeNull();
      expect(normalizeWhitelistEmail(undefined)).toBeNull();
    });
  });

  describe('generateSetupToken', () => {
    it('returns a 64-character hex string', () => {
      const token = generateSetupToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('buildMemberSetupInviteHtml', () => {
    it('includes create-account and existing-account links', () => {
      const html = buildMemberSetupInviteHtml(
        'player@club.com',
        'Sunset Tennis',
        'https://app.courttime.test/register?setupToken=abc',
        'https://app.courttime.test/login?setupToken=abc'
      );
      expect(html).toContain('Sunset Tennis');
      expect(html).toContain('player@club.com');
      expect(html).toContain('Create your account');
      expect(html).toContain('Log in with an existing account');
      expect(html).toContain('https://app.courttime.test/register?setupToken=abc');
      expect(html).toContain('https://app.courttime.test/login?setupToken=abc');
    });
  });

  describe('validateSetupToken', () => {
    it('returns invite details for a valid token', async () => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            email: 'player@club.com',
            address: '123 Main St',
            lastName: 'Smith',
            facilityId: 'fac-1',
            facilityName: 'Sunset Tennis',
            expiresAt,
            acceptedAt: null,
          },
        ],
      });

      const result = await validateSetupToken('valid-token');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.email).toBe('player@club.com');
        expect(result.facilityId).toBe('fac-1');
        expect(result.facilityName).toBe('Sunset Tennis');
      }
    });

    it('rejects expired tokens', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            email: 'player@club.com',
            address: '123 Main St',
            lastName: '',
            facilityId: 'fac-1',
            facilityName: 'Sunset Tennis',
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
            acceptedAt: null,
          },
        ],
      });

      const result = await validateSetupToken('expired-token');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('expired');
      }
    });

    it('rejects already accepted tokens', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            email: 'player@club.com',
            address: '123 Main St',
            lastName: '',
            facilityId: 'fac-1',
            facilityName: 'Sunset Tennis',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            acceptedAt: new Date().toISOString(),
          },
        ],
      });

      const result = await validateSetupToken('used-token');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('already been used');
      }
    });
  });

  describe('consumeSetupToken', () => {
    it('returns true when a row is updated', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'wl-1' }] });
      const consumed = await consumeSetupToken('token-1', 'user-1');
      expect(consumed).toBe(true);
    });

    it('returns false when no row matches', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });
      const consumed = await consumeSetupToken('token-1', 'user-1');
      expect(consumed).toBe(false);
    });
  });
});
