/**
 * API Client for CourtTime Mobile
 * Mirrors the web app's API client with JWT token auth
 */

import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { buildApiRequest, type ApiResponse as SharedApiResponse } from '../../../shared/api/core';
import { resolveApiBaseUrl } from './baseUrl';
import { APP_ENV, PRODUCTION_API_URL, stripTrailingSlashes } from '../config/runtime';

const API_PORT = process.env.EXPO_PUBLIC_API_PORT ?? '3001';

/** True when Metro is reachable only via a tunnel hostname (cannot reach your LAN API). */
function isTunnelMetroHost(hostUri: string): boolean {
  const host = hostUri.split(':')[0]?.toLowerCase() ?? '';
  return (
    host.includes('exp.direct') ||
    host.includes('expo.dev') ||
    host.includes('ngrok') ||
    host.includes('tunnel.') ||
    host.endsWith('.exp.host')
  );
}

function tryParseHostFromScriptUrl(): string | null {
  const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL as string | undefined;
  if (!scriptURL) return null;
  try {
    const withoutScheme = scriptURL.split('://').slice(1).join('://');
    const hostPort = withoutScheme.split('/')[0] || '';
    const host = hostPort.split(':')[0];
    if (!host) return null;
    if (host === 'localhost' || host === '127.0.0.1') return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * Dev-only LAN API URL: script host (helps some physical devices), Android emulator,
 * then Expo debugger / host URIs. Skips tunnel hosts so we fall through to production URL.
 */
function getDevLanApiBaseUrl(): string | null {
  if (APP_ENV !== 'development') return null;

  const fromScript = tryParseHostFromScriptUrl();
  if (fromScript && !isTunnelMetroHost(fromScript)) {
    return `http://${fromScript}:${API_PORT}`;
  }

  if (Platform.OS === 'android' && !Device.isDevice) {
    return `http://10.0.2.2:${API_PORT}`;
  }

  if (Platform.OS === 'ios' && !Device.isDevice) {
    return `http://localhost:${API_PORT}`;
  }

  const hostUri =
    (Constants as any)?.expoGoConfig?.debuggerHost ||
    Constants.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost;

  if (typeof hostUri === 'string' && hostUri.length > 0) {
    if (isTunnelMetroHost(hostUri)) return null;
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${API_PORT}`;
    }
  }

  return null;
}

const DEFAULT_LOCAL_API_URL =
  Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;

/**
 * 1. EXPO_PUBLIC_API_URL — explicit override (any mode).
 * 2. Development builds — LAN / simulator host (Expo Go on Wi-Fi; not tunnel).
 * 3. Preview / production builds — baked-in public API URL from app config.
 * 4. Development-only localhost / 10.0.2.2 fallback.
 */
const explicitUrl = process.env.EXPO_PUBLIC_API_URL;
export const API_BASE_URL = resolveApiBaseUrl({
  appEnv: APP_ENV,
  explicitUrl,
  devApiUrl: getDevLanApiBaseUrl(),
  productionApiUrl: PRODUCTION_API_URL,
  defaultLocalApiUrl: DEFAULT_LOCAL_API_URL,
});

if (__DEV__ && Platform.OS !== 'web') {
  const hostUri = Constants.expoConfig?.hostUri;
  const tunnel = hostUri ? isTunnelMetroHost(hostUri) : false;
  console.log(
    '[CourtTime] API_BASE_URL =',
    API_BASE_URL,
    tunnel ? '(tunnel -> production or explicit public override)' : ''
  );
}

const REQUEST_TIMEOUT_MS = 15000;

export type ApiErrorCategory =
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server'
  | 'timeout'
  | 'unknown';

export type ApiResponse<T = any> = SharedApiResponse<T, ApiErrorCategory>;

// ── Token storage (SecureStore on native, localStorage on web) ──

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem('courttime_token');
  }
  return SecureStore.getItemAsync('courttime_token');
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem('courttime_token', token);
    return;
  }
  await SecureStore.setItemAsync('courttime_token', token);
}

export async function removeToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem('courttime_token');
    return;
  }
  await SecureStore.deleteItemAsync('courttime_token');
}

// ── User cache (for offline fallback) ──

export async function cacheUser(user: any): Promise<void> {
  const json = JSON.stringify(user);
  if (Platform.OS === 'web') {
    localStorage.setItem('courttime_user', json);
    return;
  }
  await SecureStore.setItemAsync('courttime_user', json);
}

export async function getCachedUser(): Promise<any | null> {
  try {
    let json: string | null;
    if (Platform.OS === 'web') {
      json = localStorage.getItem('courttime_user');
    } else {
      json = await SecureStore.getItemAsync('courttime_user');
    }
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function clearCache(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem('courttime_token');
    localStorage.removeItem('courttime_user');
    return;
  }
  await SecureStore.deleteItemAsync('courttime_token');
  await SecureStore.deleteItemAsync('courttime_user');
}

// ── API request with auto-attached Bearer token ──

async function getOfflineAwareCategoryFromFetchError(error: unknown): Promise<ApiErrorCategory> {
  if ((error as any)?.name === 'AbortError') {
    return 'timeout';
  }
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    const looksNetworkRejected =
      msg.includes('network request failed') || msg.includes('failed to fetch');
    if (looksNetworkRejected) {
      const net = await NetInfo.fetch();
      if (net.isConnected === false) {
        return 'offline';
      }
    }
  }
  return 'unknown';
}

function categoryFromStatus(status: number): ApiErrorCategory {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  return 'unknown';
}

export const apiRequest = buildApiRequest<ApiErrorCategory>({
  baseUrl: API_BASE_URL,
  getToken,
  timeoutMs: REQUEST_TIMEOUT_MS,
  mapStatusToCategory: categoryFromStatus,
  mapErrorToCategory: getOfflineAwareCategoryFromFetchError,
  mapCategoryToMessage: (errorCategory) =>
    errorCategory === 'offline'
      ? 'You appear to be offline. Please check your connection.'
      : errorCategory === 'timeout'
        ? 'Request timed out. Please try again.'
        : `Unable to reach CourtTime right now (${API_BASE_URL}). Please try again.`,
});

export { userFacingApiMessage } from '../utils/apiUserMessages';

// ── Terms & Conditions ──

export interface PendingTermsAcceptance {
  facilityId: string;
  facilityName: string;
  currentVersionId: string;
  currentVersionNumber: number;
  contentHtml: string;
  publishedAt: string;
  acceptedVersionNumber: number | null;
  acceptedAt: string | null;
}

// Convenience methods
export const api = {
  get: <T = any>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: 'GET' }),

  post: <T = any>(endpoint: string, body: any) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: <T = any>(endpoint: string, body: any) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: <T = any>(endpoint: string, body: any) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T = any>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: 'DELETE' }),
};
