/**
 * API Client for CourtTime Mobile
 * Mirrors the web app's API client, adapted for React Native
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Default to your Render deployment URL
// Override with EXPO_PUBLIC_API_URL env var for development
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  ruleViolations?: Array<{ ruleCode: string; ruleName: string; message: string; severity: string }>;
  warnings?: Array<{ ruleCode: string; ruleName: string; message: string }>;
  isPrimeTime?: boolean;
}

// Token storage that works on both native (SecureStore) and web (localStorage)
export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem('auth_token');
  }
  return SecureStore.getItemAsync('auth_token');
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem('auth_token', token);
    return;
  }
  await SecureStore.setItemAsync('auth_token', token);
}

export async function removeToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem('auth_token');
    return;
  }
  await SecureStore.deleteItemAsync('auth_token');
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const authHeaders = await getAuthHeaders();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: `Server error (${response.status}). Please try again.`,
      };
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Request failed',
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
    return {
      success: false,
      error: 'Network error. Please check your connection.',
    };
  }
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

  delete: <T = any>(endpoint: string) =>
    apiRequest<T>(endpoint, { method: 'DELETE' }),
};
