/**
 * API Client for CourtTime Mobile
 * Mirrors the web app's API client with JWT token auth
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import { buildApiRequest, type ApiResponse as SharedApiResponse } from '../../../shared/api/core';

function inferDevApiBaseUrl(): string {
  // Android emulator uses 10.0.2.2 to reach the host machine's localhost
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001';
  }

  // Physical devices: "localhost" refers to the phone itself, not your dev machine.
  // Expo exposes the packager host in dev; reuse that LAN IP for the API server port.
  const hostUri =
    (Constants as any)?.expoGoConfig?.debuggerHost ||
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost;

  if (typeof hostUri === 'string' && hostUri.length > 0) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:3001`;
    }
  }

  // iOS simulator / web dev can reach localhost on the host
  return 'http://localhost:3001';
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || inferDevApiBaseUrl();
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
        : 'Unable to reach CourtTime right now. Please try again.',
});

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
