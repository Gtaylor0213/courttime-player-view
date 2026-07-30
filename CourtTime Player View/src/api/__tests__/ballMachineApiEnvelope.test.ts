import { describe, expect, it } from 'vitest';
import { unwrapApiPayload } from '../../../shared/api/core';

/**
 * Regression guard for the /api/ball-machine envelope.
 *
 * Every ball-machine route replies `{ success, data: {...} }`, and buildApiRequest
 * stores the *entire* response body as `.data`. That puts the real payload at
 * `res.data.data`, so a component reading `res.data.passes` got `undefined` and
 * `passes.filter(...)` threw "undefined is not an object". ballMachineApi unwraps
 * once so callers can read `res.data.<field>` directly.
 */

/** What buildApiRequest returns for a 200: the whole JSON body under `.data`. */
function asClientResponse(responseBody: unknown) {
  return { success: true, data: responseBody };
}

/** The unwrap ballMachineApi applies. */
function unwrapped(res: { success: boolean; data: unknown }) {
  return { ...res, data: unwrapApiPayload<any>(res.data) };
}

describe('ballMachineApi envelope', () => {
  it('exposes status collections as arrays, not undefined', () => {
    // Verbatim body from GET /api/ball-machine/status/:facilityId
    const raw = asClientResponse({
      success: true,
      data: {
        machineCount: 1,
        instructions: null,
        hasAccessCode: false,
        products: [],
        activePass: null,
        passes: [],
        hourlyFromCents: 2000,
      },
    });

    // Without unwrapping, this is the crash.
    expect((raw.data as any).passes).toBeUndefined();

    const res = unwrapped(raw);
    expect(Array.isArray(res.data.passes)).toBe(true);
    expect(Array.isArray(res.data.products)).toBe(true);
    expect(res.data.hourlyFromCents).toBe(2000);
    expect(res.data.machineCount).toBe(1);
  });

  it('exposes the access code directly', () => {
    const res = unwrapped(
      asClientResponse({
        success: true,
        data: { accessCode: '4821', instructions: null, activePass: null },
      })
    );
    expect(res.data.accessCode).toBe('4821');
  });

  it('exposes the pass-holder list as a top-level array', () => {
    const res = unwrapped(
      asClientResponse({
        success: true,
        data: [{ id: 'pass-1', fullName: 'Ada', status: 'active' }],
      })
    );
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data).toHaveLength(1);
  });

  it('exposes the checkout url used to redirect to Stripe', () => {
    const res = unwrapped(
      asClientResponse({
        success: true,
        data: { url: 'https://checkout.stripe.com/c/pay/cs_test_123' },
      })
    );
    expect(res.data.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
  });
});
