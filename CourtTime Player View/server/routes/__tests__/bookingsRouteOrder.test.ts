import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Express matches routes in registration order. `GET /open` (the fill-a-spot
 * browse endpoint) must be registered before `GET /:bookingId`, or "open" gets
 * swallowed as a booking id and the route is unreachable. Caught during manual
 * verification of the padel feature flag before this test existed.
 *
 * Asserted against the source rather than the router stack so the check stays
 * honest even if the handlers are later refactored onto sub-routers.
 */
describe('bookings route ordering', () => {
  const source = readFileSync(join(__dirname, '..', 'bookings.ts'), 'utf8');

  it('registers the literal GET /open before GET /:bookingId', () => {
    const openAt = source.indexOf("router.get('/open'");
    const paramAt = source.indexOf("router.get('/:bookingId'");

    expect(openAt).toBeGreaterThan(-1);
    expect(paramAt).toBeGreaterThan(-1);
    expect(openAt).toBeLessThan(paramAt);
  });

  it('has no other literal path shadowed by a same-prefix parameterised route', () => {
    // (method, path) in registration order
    const routes = [...source.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => ({
      method: m[1],
      path: m[2],
    }));

    for (let i = 0; i < routes.length; i++) {
      const earlier = routes[i];
      const earlierSegments = earlier.path.split('/');

      for (let j = i + 1; j < routes.length; j++) {
        const later = routes[j];
        if (later.method !== earlier.method) continue;
        const laterSegments = later.path.split('/');
        if (laterSegments.length !== earlierSegments.length) continue;

        // The later route is unreachable if every segment is either identical or
        // covered by a parameter in the earlier one.
        const shadowed = laterSegments.every((seg, k) => {
          const prev = earlierSegments[k];
          return prev === seg || prev.startsWith(':');
        });

        expect(
          shadowed,
          `${later.method.toUpperCase()} ${later.path} is unreachable — ` +
            `${earlier.method.toUpperCase()} ${earlier.path} is registered first and matches it`
        ).toBe(false);
      }
    }
  });
});
