import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { extractPaths, normalizePath, pathsMatch, readAllowlist } from '../check-api-parity.mjs';

describe('check-api-parity', () => {
  it('normalises template segments, query strings and glued suffixes', () => {
    expect(normalizePath('/api/bookings/${id}/participants?x=1')).toBe('/api/bookings/:id/participants');
    expect(normalizePath('/api/rules/definitions${qs}')).toBe('/api/rules/definitions');
    expect(normalizePath('/api/strikes/user/${userId}${qs}')).toBe('/api/strikes/user/:id');
    expect(normalizePath('/api/households/${id}/bookings${qs}')).toBe('/api/households/:id/bookings');
    expect(normalizePath('/api/rules/facility/:facilityId/:ruleCode')).toBe('/api/rules/facility/:id/:id');
  });
  it('extracts api literals from source and skips bare roots', () => {
    const src = "api.get(`/api/x/${a}`); fetch('/api'); apiRequest('/api/y/z?q=1'); const t = `/api/${anything}`;";
    expect([...extractPaths(src)].sort()).toEqual(['/api/x/:id', '/api/y/z']);
  });
  it('matches wildcard segments on either side', () => {
    expect(pathsMatch('/api/pro-shop/admin/assign/cash/:id', '/api/pro-shop/admin/assign/:id/:id')).toBe(true);
    expect(pathsMatch('/api/a/b', '/api/a/b/c')).toBe(false);
  });
  it('reads only first-column paths from the allowlist table', () => {
    const md = '# Doc\n\n## Web-only API paths\n\nIntro mentions `/api/...`.\n\n| Path | Why |\n|---|---|\n| `/api/a`, `/api/b/*` | mobile uses `/api/c` |\n\n## Next\n\n| `/api/z` | no |\n';
    expect(readAllowlist(md)).toEqual(['/api/a', '/api/b/*']);
  });
});
