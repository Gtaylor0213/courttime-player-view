/**
 * useOfflineApi
 * Hook that wraps API calls with offline cache fallback and action queuing.
 *
 * Usage:
 *   const { fetchWithCache, isOffline } = useOfflineApi();
 *   const data = await fetchWithCache('bookings', `/api/bookings/upcoming/${userId}`);
 */

import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { api, ApiResponse } from '../api/client';
import { getCachedData, setCachedData, queueAction, getActionQueue, removeActionFromQueue } from '../utils/offlineCache';

export function useOfflineApi() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  /**
   * Fetch data with cache fallback.
   * - Online: fetch from API, cache the result, return it
   * - Offline: return cached data (or null if no cache)
   */
  const fetchWithCache = useCallback(async <T = any>(
    cacheKey: string,
    endpoint: string,
  ): Promise<{ data: T | null; fromCache: boolean; error?: string }> => {
    // Try API first
    if (!isOffline) {
      const res = await api.get<T>(endpoint);
      if (res.success && res.data) {
        await setCachedData(cacheKey, res.data);
        return { data: res.data as T, fromCache: false };
      }

      // API failed but might be a network error — try cache
      if (res.error?.includes('Network error')) {
        setIsOffline(true);
        const cached = await getCachedData<T>(cacheKey);
        if (cached) return { data: cached, fromCache: true };
        return { data: null, fromCache: true, error: 'No cached data available' };
      }

      return { data: null, fromCache: false, error: res.error };
    }

    // Offline — use cache
    const cached = await getCachedData<T>(cacheKey);
    if (cached) return { data: cached, fromCache: true };
    return { data: null, fromCache: true, error: 'You are offline and no cached data is available' };
  }, [isOffline]);

  /**
   * Post/delete with offline queue fallback.
   * - Online: execute immediately
   * - Offline: queue for later execution
   */
  const postWithQueue = useCallback(async (
    endpoint: string,
    body?: any,
    method: 'POST' | 'DELETE' | 'PATCH' = 'POST',
  ): Promise<ApiResponse> => {
    if (!isOffline) {
      if (method === 'DELETE') return api.delete(endpoint);
      if (method === 'PATCH') return api.patch(endpoint, body);
      return api.post(endpoint, body);
    }

    // Queue for later
    await queueAction({ endpoint, method, body });
    return {
      success: true,
      message: 'Action queued — will be sent when you are back online.',
    };
  }, [isOffline]);

  /**
   * Process any queued actions (call when coming back online).
   */
  const processQueue = useCallback(async (): Promise<number> => {
    const queue = await getActionQueue();
    if (queue.length === 0) return 0;

    let processed = 0;
    for (const action of queue) {
      try {
        if (action.method === 'DELETE') {
          await api.delete(action.endpoint);
        } else if (action.method === 'PATCH') {
          await api.patch(action.endpoint, action.body);
        } else {
          await api.post(action.endpoint, action.body);
        }
        await removeActionFromQueue(action.id);
        processed++;
      } catch {
        // Leave in queue for next retry
        break;
      }
    }
    return processed;
  }, []);

  // Auto-process queue when coming back online
  useEffect(() => {
    if (!isOffline) {
      processQueue();
    }
  }, [isOffline, processQueue]);

  return { isOffline, fetchWithCache, postWithQueue, processQueue };
}
