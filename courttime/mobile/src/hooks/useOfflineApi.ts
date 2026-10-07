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
import { api, API_BASE_URL, ApiErrorCategory, ApiResponse } from '../api/client';
import { getCachedDataWithMeta, setCachedData, queueAction, getActionQueue, removeActionFromQueue } from '../utils/offlineCache';

type ConnectivityBannerState = 'offline' | 'backend_unreachable' | 'online';

export function useOfflineApi() {
  const [isOffline, setIsOffline] = useState(false);
  const [bannerState, setBannerState] = useState<ConnectivityBannerState>('online');
  const [lastCachedAt, setLastCachedAt] = useState<number | null>(null);

  const healthUrl = `${API_BASE_URL.replace(/\/$/, '')}/health`;

  useEffect(() => {
    NetInfo.configure({
      reachabilityUrl: healthUrl,
    });
    NetInfo.fetch().then(state => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
      setBannerState(offline ? 'offline' : 'online');
    });

    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = state.isConnected === false;
      setIsOffline(offline);
      setBannerState(prev => (offline ? 'offline' : prev === 'offline' ? 'online' : prev));
    });
    return () => unsubscribe();
  }, [healthUrl]);

  /**
   * Fetch data with cache fallback.
   * - Online: fetch from API, cache the result, return it
   * - Offline: return cached data (or null if no cache)
   */
  const fetchWithCache = useCallback(async <T = any>(
    cacheKey: string,
    endpoint: string,
  ): Promise<{ data: T | null; fromCache: boolean; error?: string; errorCategory?: ApiErrorCategory; cachedAt?: number }> => {
    // Try API first
    if (!isOffline) {
      const res = await api.get<T>(endpoint);
      if (res.success && res.data) {
        await setCachedData(cacheKey, res.data);
        setBannerState('online');
        setLastCachedAt(null);
        return { data: res.data as T, fromCache: false };
      }

      // API failed due to offline — try cache
      if (res.errorCategory === 'offline') {
        setIsOffline(true);
        setBannerState('offline');
        const cached = await getCachedDataWithMeta<T>(cacheKey);
        if (cached) {
          setLastCachedAt(cached.cachedAt);
          return { data: cached.data, fromCache: true, cachedAt: cached.cachedAt };
        }
        return { data: null, fromCache: true, error: 'No cached data available', errorCategory: 'offline' };
      }

      if (res.errorCategory === 'timeout' || res.errorCategory === 'server' || res.errorCategory === 'unknown') {
        setBannerState('backend_unreachable');
        const cached = await getCachedDataWithMeta<T>(cacheKey);
        if (cached) {
          setLastCachedAt(cached.cachedAt);
          return {
            data: cached.data,
            fromCache: true,
            cachedAt: cached.cachedAt,
            errorCategory: res.errorCategory,
            error: res.errorMessage || res.error,
          };
        }
        return {
          data: null,
          fromCache: false,
          error: res.errorMessage || res.error,
          errorCategory: res.errorCategory,
        };
      }

      return { data: null, fromCache: false, error: res.errorMessage || res.error, errorCategory: res.errorCategory };
    }

    // Offline — use cache
    const cached = await getCachedDataWithMeta<T>(cacheKey);
    if (cached) {
      setBannerState('offline');
      setLastCachedAt(cached.cachedAt);
      return { data: cached.data, fromCache: true, cachedAt: cached.cachedAt };
    }
    return { data: null, fromCache: true, error: 'You are offline and no cached data is available', errorCategory: 'offline' };
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

  const retryConnectivity = useCallback(async () => {
    const state = await NetInfo.fetch();
    const offline = state.isConnected === false;
    setIsOffline(offline);
    setBannerState(offline ? 'offline' : 'online');
  }, []);

  return { isOffline, bannerState, lastCachedAt, fetchWithCache, postWithQueue, processQueue, retryConnectivity };
}
