import { describe, expect, it } from '@jest/globals';
import { isLoopbackOrPrivateApiUrl, resolveApiBaseUrl } from '../src/api/baseUrl';

describe('resolveApiBaseUrl', () => {
  const productionApiUrl = 'https://www.courttimeapp.com';
  const defaultLocalApiUrl = 'http://localhost:3001';

  it('prefers a local override during development', () => {
    expect(
      resolveApiBaseUrl({
        appEnv: 'development',
        explicitUrl: 'http://192.168.1.15:3001/',
        devApiUrl: 'http://localhost:3001',
        productionApiUrl,
        defaultLocalApiUrl,
      })
    ).toBe('http://192.168.1.15:3001');
  });

  it('uses the baked-in production API when development is running through a tunnel', () => {
    expect(
      resolveApiBaseUrl({
        appEnv: 'development',
        explicitUrl: null,
        devApiUrl: null,
        productionApiUrl,
        defaultLocalApiUrl,
      })
    ).toBe(productionApiUrl);
  });

  it('ignores loopback overrides in preview and production builds', () => {
    expect(
      resolveApiBaseUrl({
        appEnv: 'preview',
        explicitUrl: 'http://10.0.2.2:3001',
        devApiUrl: 'http://localhost:3001',
        productionApiUrl,
        defaultLocalApiUrl,
      })
    ).toBe(productionApiUrl);
  });
});

describe('isLoopbackOrPrivateApiUrl', () => {
  it('flags local-only API hosts', () => {
    expect(isLoopbackOrPrivateApiUrl('http://localhost:3001')).toBe(true);
    expect(isLoopbackOrPrivateApiUrl('http://10.0.2.2:3001')).toBe(true);
    expect(isLoopbackOrPrivateApiUrl('https://www.courttimeapp.com')).toBe(false);
  });
});
