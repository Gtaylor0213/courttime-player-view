import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { api } from '../src/api/client';
import {
  buildHittingPartnerCreateBody,
  partnerPostFailureUi,
  isPartnerPostFormValid,
} from '../src/utils/communityPartnerPostForm';

describe('Community create partner post', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a valid POST body with userId, facilityId, description, playStyle array, availability, expiresInDays as number', () => {
    const body = buildHittingPartnerCreateBody('user-1', 'fac-1', {
      description: '1234567890 looking for rallies',
      availability: 'Weeknights after 6pm',
      playStyles: ['Singles', 'Baseline'],
      expiresInDays: 30,
    });
    expect(body).toEqual({
      userId: 'user-1',
      facilityId: 'fac-1',
      description: '1234567890 looking for rallies',
      availability: 'Weeknights after 6pm',
      playStyle: ['Singles', 'Baseline'],
      expiresInDays: 30,
    });
    expect(typeof body.expiresInDays).toBe('number');
    expect(Array.isArray(body.playStyle)).toBe(true);
  });

  it('rejects invalid forms before POST', () => {
    expect(
      isPartnerPostFormValid({
        description: 'short',
        availability: 'ok',
        playStyles: ['Singles'],
        expiresInDays: 30,
      })
    ).toBe(false);
    expect(
      isPartnerPostFormValid({
        description: '1234567890 enough',
        availability: '',
        playStyles: ['Singles'],
        expiresInDays: 30,
      })
    ).toBe(false);
    expect(
      isPartnerPostFormValid({
        description: '1234567890 enough',
        availability: 'Sat am',
        playStyles: [],
        expiresInDays: 30,
      })
    ).toBe(false);
  });

  it('POST /api/hitting-partner receives numeric expiresInDays and playStyle array', async () => {
    const postSpy = jest.spyOn(api, 'post').mockResolvedValue({ success: true, data: { postId: 'p1' } });
    const input = {
      description: '1234567890 need a partner',
      availability: 'Weekends',
      playStyles: ['Doubles'],
      expiresInDays: 14,
    };
    const body = buildHittingPartnerCreateBody('u-99', 'f-88', input);
    await api.post('/api/hitting-partner', body);
    expect(postSpy).toHaveBeenCalledWith(
      '/api/hitting-partner',
      expect.objectContaining({
        userId: 'u-99',
        facilityId: 'f-88',
        description: input.description,
        availability: input.availability,
        playStyle: ['Doubles'],
        expiresInDays: 14,
      })
    );
    postSpy.mockRestore();
  });

  it('422-style API response surfaces server error, not literal Network error', () => {
    const res = {
      success: false as const,
      error: 'Description is required',
      errorMessage: 'Description is required',
      errorCategory: 'unknown' as const,
    };
    const ui = partnerPostFailureUi(res);
    expect(ui.mode).toBe('toast');
    if (ui.mode === 'toast') {
      expect(ui.message).toBe('Description is required');
      expect(ui.message.toLowerCase()).not.toContain('network error');
    }
  });

  it('offline category yields silent UI so the screen can rely on OfflineBanner instead of an error toast', () => {
    const res = {
      success: false as const,
      error: 'You appear to be offline. Please check your connection.',
      errorCategory: 'offline' as const,
    };
    expect(partnerPostFailureUi(res).mode).toBe('silent');
    expect(res.error.toLowerCase()).not.toContain('network error');
  });
});
