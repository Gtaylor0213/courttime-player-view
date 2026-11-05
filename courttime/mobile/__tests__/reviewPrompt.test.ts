const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore.set(k, v);
    }),
  },
}));

const mockRequestReview = jest.fn(async () => true);
jest.mock('../src/utils/nativeStoreReview', () => ({
  requestNativeStoreReview: () => mockRequestReview(),
}));

import {
  FIRST_USED_KEY,
  LAST_ASKED_KEY,
  REVIEW_PROMPT_MIN_DAYS,
  REVIEW_PROMPT_REPEAT_DAYS,
  isEligibleForReviewPrompt,
  maybeAskForReview,
  recordFirstAppUse,
  storeReviewUrl,
} from '../src/utils/reviewPrompt';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 6);

beforeEach(() => {
  mockStore.clear();
  mockRequestReview.mockClear();
  mockRequestReview.mockResolvedValue(true);
});

describe('isEligibleForReviewPrompt', () => {
  it('waits 14 days from first use', () => {
    expect(isEligibleForReviewPrompt({ firstUsedAt: null, lastAskedAt: null, now: T0 })).toBe(false);
    expect(isEligibleForReviewPrompt({ firstUsedAt: T0, lastAskedAt: null, now: T0 + 13.9 * DAY })).toBe(false);
    expect(isEligibleForReviewPrompt({ firstUsedAt: T0, lastAskedAt: null, now: T0 + REVIEW_PROMPT_MIN_DAYS * DAY })).toBe(true);
  });

  it('does not ask again for 120 days', () => {
    const asked = T0 + 20 * DAY;
    expect(isEligibleForReviewPrompt({ firstUsedAt: T0, lastAskedAt: asked, now: asked + 119 * DAY })).toBe(false);
    expect(
      isEligibleForReviewPrompt({ firstUsedAt: T0, lastAskedAt: asked, now: asked + REVIEW_PROMPT_REPEAT_DAYS * DAY })
    ).toBe(true);
  });
});

describe('maybeAskForReview', () => {
  it('keeps only the first launch time', async () => {
    await recordFirstAppUse(T0);
    await recordFirstAppUse(T0 + 5 * DAY);
    expect(mockStore.get(FIRST_USED_KEY)).toBe(String(T0));
  });

  it('does nothing before day 14', async () => {
    await recordFirstAppUse(T0);
    expect(await maybeAskForReview(T0 + 3 * DAY)).toBe(false);
    expect(mockRequestReview).not.toHaveBeenCalled();
  });

  it('asks once after day 14 and remembers it', async () => {
    await recordFirstAppUse(T0);
    expect(await maybeAskForReview(T0 + 15 * DAY)).toBe(true);
    expect(mockStore.get(LAST_ASKED_KEY)).toBe(String(T0 + 15 * DAY));
    expect(await maybeAskForReview(T0 + 16 * DAY)).toBe(false);
    expect(mockRequestReview).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting when the build has no review sheet', async () => {
    mockRequestReview.mockResolvedValue(false);
    await recordFirstAppUse(T0);
    expect(await maybeAskForReview(T0 + 15 * DAY)).toBe(false);
    expect(mockStore.has(LAST_ASKED_KEY)).toBe(false);
  });

  it('never throws', async () => {
    mockRequestReview.mockRejectedValue(new Error('boom'));
    await recordFirstAppUse(T0);
    await expect(maybeAskForReview(T0 + 15 * DAY)).resolves.toBe(false);
  });
});

it('opens the right mockStore review page', () => {
  expect(storeReviewUrl('ios')).toBe('https://apps.apple.com/app/id6826902090?action=write-review');
  expect(storeReviewUrl('android')).toContain('id=com.courttime.player');
  expect(storeReviewUrl('web')).toBeNull();
});
