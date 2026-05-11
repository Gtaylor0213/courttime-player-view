import { stripTrailingSlashes, type AppEnvironment } from '../config/runtime';

type ResolveApiBaseUrlInput = {
  appEnv: AppEnvironment;
  explicitUrl?: string | null;
  devApiUrl?: string | null;
  productionApiUrl: string;
  defaultLocalApiUrl: string;
};

function normalizeUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.trim().length > 0 ? stripTrailingSlashes(url.trim()) : null;
}

export function isLoopbackOrPrivateApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl({
  appEnv,
  explicitUrl,
  devApiUrl,
  productionApiUrl,
  defaultLocalApiUrl,
}: ResolveApiBaseUrlInput): string {
  const normalizedExplicitUrl = normalizeUrl(explicitUrl);
  const normalizedDevApiUrl = normalizeUrl(devApiUrl);
  const normalizedProductionApiUrl = normalizeUrl(productionApiUrl);
  const normalizedDefaultLocalApiUrl = normalizeUrl(defaultLocalApiUrl);

  if (appEnv === 'development') {
    return (
      normalizedExplicitUrl ||
      normalizedDevApiUrl ||
      normalizedProductionApiUrl ||
      normalizedDefaultLocalApiUrl ||
      defaultLocalApiUrl
    );
  }

  if (normalizedExplicitUrl && !isLoopbackOrPrivateApiUrl(normalizedExplicitUrl)) {
    return normalizedExplicitUrl;
  }

  return normalizedProductionApiUrl || normalizedDefaultLocalApiUrl || defaultLocalApiUrl;
}
