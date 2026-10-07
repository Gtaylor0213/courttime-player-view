import { describe, expect, it } from 'vitest';
import { normalizeCourtAddResponse } from '../core';

describe('normalizeCourtAddResponse', () => {
  it('flattens requiresPayment and checkoutUrl from nested API envelope', () => {
    const normalized = normalizeCourtAddResponse({
      success: true,
      data: {
        success: true,
        requiresPayment: true,
        data: {
          checkoutUrl: 'https://checkout.stripe.com/test',
          sessionId: 'cs_test_123',
          pendingId: 'pending-1',
        },
      },
    });

    expect(normalized.requiresPayment).toBe(true);
    expect(normalized.checkoutUrl).toBe('https://checkout.stripe.com/test');
    expect(normalized.sessionId).toBe('cs_test_123');
  });

  it('passes through immediate court creation responses', () => {
    const court = { id: 'court-1', name: 'Court 5' };
    const normalized = normalizeCourtAddResponse({
      success: true,
      data: {
        success: true,
        data: { court },
      },
    });

    expect(normalized.requiresPayment).toBe(false);
    expect(normalized.court).toEqual(court);
  });
});
