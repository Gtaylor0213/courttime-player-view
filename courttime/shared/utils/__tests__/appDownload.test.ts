import {
  APP_STORE_URL,
  PLAY_STORE_URL,
  detectDevicePlatform,
  isAppPromptSuppressed,
  storeUrlFor,
} from '../appDownload';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

describe('detectDevicePlatform', () => {
  it('detects iPhone and Android', () => {
    expect(detectDevicePlatform(IPHONE)).toBe('ios');
    expect(detectDevicePlatform(ANDROID)).toBe('android');
  });

  it('treats a touch-screen "Mac" as an iPad', () => {
    expect(detectDevicePlatform(IPAD_DESKTOP_MODE, 5)).toBe('ios');
    expect(detectDevicePlatform(IPAD_DESKTOP_MODE, 0)).toBe('desktop');
  });

  it('falls back to desktop', () => {
    expect(detectDevicePlatform(WINDOWS)).toBe('desktop');
    expect(detectDevicePlatform('')).toBe('desktop');
  });
});

describe('storeUrlFor', () => {
  it('maps each phone to its store', () => {
    expect(storeUrlFor('ios')).toBe(APP_STORE_URL);
    expect(storeUrlFor('android')).toBe(PLAY_STORE_URL);
    expect(storeUrlFor('desktop')).toBeNull();
  });
});

describe('isAppPromptSuppressed', () => {
  const now = 1_000_000;

  it('shows the prompt by default', () => {
    expect(isAppPromptSuppressed({ dismissed: false, snoozedUntil: null }, now)).toBe(false);
  });

  it('hides it while snoozed, then shows it again', () => {
    expect(isAppPromptSuppressed({ dismissed: false, snoozedUntil: now + 1 }, now)).toBe(true);
    expect(isAppPromptSuppressed({ dismissed: false, snoozedUntil: now }, now)).toBe(false);
  });

  it('hides it for good once dismissed', () => {
    expect(isAppPromptSuppressed({ dismissed: true, snoozedUntil: null }, now)).toBe(true);
  });
});
