/**
 * API Client for CourtTime Mobile
 * Mirrors the web app's API client with JWT token auth
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

// Android emulator uses 10.0.2.2 to reach the host machine's localhost
// Web and iOS simulator can use localhost directly
const DEFAULT_API_URL = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001'
  : 'http://localhost:3001';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
const REQUEST_TIMEOUT_MS = 15000;

export type ApiErrorCategory =
  | 'offline'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server'
  | 'timeout'
  | 'unknown';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorMessage?: string;
  errorCategory?: ApiErrorCategory;
  message?: string;
  ruleViolations?: Array<{ ruleCode: string; ruleName: string; message: string; severity: string }>;
  warnings?: Array<{ ruleCode: string; ruleName: string; message: string }>;
  isPrimeTime?: boolean;
}

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

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

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

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const errorCategory = categoryFromStatus(response.status);
      const errorMessage = `Server error (${response.status}). Please try again.`;
      return {
        success: false,
        error: errorMessage,
        errorMessage,
        errorCategory,
      };
    }

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error || data.message || 'Request failed';
      const errorCategory = categoryFromStatus(response.status);
      return {
        success: false,
        error: errorMessage,
        errorMessage,
        errorCategory,
        ...(data.ruleViolations && { ruleViolations: data.ruleViolations }),
        ...(data.warnings && { warnings: data.warnings }),
        ...(data.isPrimeTime !== undefined && { isPrimeTime: data.isPrimeTime }),
      };
    }

    return {
      success: true,
      data,
      message: data.message,
    };
  } catch (error) {
    const errorCategory = await getOfflineAwareCategoryFromFetchError(error);
    const errorMessage =
      errorCategory === 'offline'
        ? 'You appear to be offline. Please check your connection.'
        : errorCategory === 'timeout'
          ? 'Request timed out. Please try again.'
          : 'Unable to reach CourtTime right now. Please try again.';
    return {
      success: false,
      error: errorMessage,
      errorMessage,
      errorCategory,
    };
  } finally {
    clearTimeout(timeout);
  }
}

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
