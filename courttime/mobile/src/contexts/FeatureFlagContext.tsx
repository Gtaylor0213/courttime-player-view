/**
 * Feature Flag Context
 *
 * Per-facility feature flags, the same ones the server enforces and the web
 * client gates its nav on. Mobile previously had no notion of them at all, so
 * any flagged feature added here would show for facilities that never enabled
 * it.
 *
 * Source of truth for the keys is `shared/constants/featureFlags.ts` — import
 * `FEATURE_FLAGS` from there rather than writing the strings out again.
 *
 * Resolution order, in priority:
 *   1. A successful fetch for the selected facility.
 *   2. The last known good set for that facility, from cache — including when
 *      it has gone stale. A member offline should not lose their club's
 *      features.
 *   3. Nothing enabled. **Flags fail closed:** if we have never successfully
 *      read this facility's flags, every flagged feature stays hidden. Showing
 *      a feature a facility has not enabled is worse than hiding one it has,
 *      because the server will reject the calls behind it anyway.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { api } from '../api/client';
import { unwrapApiPayload } from '../../../shared/api/core';
import type { FeatureFlagKey } from '../../../shared/constants/featureFlags';
import { getStaleCachedData, setCachedData } from '../utils/offlineCache';
import { useAuth } from './AuthContext';

interface FeatureFlagContextValue {
  /** Feature keys enabled for the selected facility. Empty when unknown. */
  enabledFeatures: string[];
  /** Whether one specific flag is on. Prefer this over reading the array. */
  isFeatureEnabled: (key: FeatureFlagKey) => boolean;
  /**
   * False until the first resolution attempt for the current facility settles.
   * Gate flagged entry points on this to avoid showing then yanking them.
   */
  flagsLoaded: boolean;
  /** True when the current set came from cache rather than a live fetch. */
  flagsFromCache: boolean;
  refreshFlags: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

export function featureFlagCacheKey(facilityId: string): string {
  return `feature_flags_${facilityId}`;
}

/** Keep only well-formed keys — a malformed payload should not enable anything. */
export function parseFeatureFlagsResponse(responseData: unknown): string[] | null {
  const payload = unwrapApiPayload<unknown>(responseData);
  if (!Array.isArray(payload)) return null;
  return payload.filter((key): key is string => typeof key === 'string' && key.length > 0);
}

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { facilityId, isAuthenticated } = useAuth();
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [flagsFromCache, setFlagsFromCache] = useState(false);

  /**
   * The facility a resolution was started for. A slow response for the
   * previous facility must not overwrite the flags of the one now selected.
   */
  const resolvingFacilityRef = useRef<string | null>(null);

  const resolveFlags = useCallback(
    async (targetFacilityId: string | null, { showCachedFirst }: { showCachedFirst: boolean }) => {
      resolvingFacilityRef.current = targetFacilityId;
      const isStillCurrent = () => resolvingFacilityRef.current === targetFacilityId;

      if (!targetFacilityId) {
        setEnabledFeatures([]);
        setFlagsFromCache(false);
        setFlagsLoaded(true);
        return;
      }

      const cacheKey = featureFlagCacheKey(targetFacilityId);

      // Paint the last known good set immediately on a facility switch, so the
      // tab bar does not flicker while the fetch is in flight.
      if (showCachedFirst) {
        const cached = await getStaleCachedData<string[]>(cacheKey);
        if (cached && isStillCurrent()) {
          setEnabledFeatures(cached);
          setFlagsFromCache(true);
          setFlagsLoaded(true);
        }
      }

      const res = await api.get(`/api/facilities/${targetFacilityId}/feature-flags`);
      if (!isStillCurrent()) return;

      const parsed = res.success ? parseFeatureFlagsResponse(res.data) : null;

      if (parsed) {
        setEnabledFeatures(parsed);
        setFlagsFromCache(false);
        setFlagsLoaded(true);
        await setCachedData(cacheKey, parsed);
        return;
      }

      // Fetch failed or returned something unusable: fall back to the last
      // known good set, and to nothing at all if there isn't one.
      const cached = await getStaleCachedData<string[]>(cacheKey);
      if (!isStillCurrent()) return;
      setEnabledFeatures(cached ?? []);
      setFlagsFromCache(cached != null);
      setFlagsLoaded(true);
    },
    []
  );

  const refreshFlags = useCallback(async () => {
    await resolveFlags(facilityId ?? null, { showCachedFirst: false });
  }, [facilityId, resolveFlags]);

  // Resolve on login and on every facility switch.
  useEffect(() => {
    if (!isAuthenticated) {
      resolvingFacilityRef.current = null;
      setEnabledFeatures([]);
      setFlagsFromCache(false);
      setFlagsLoaded(false);
      return;
    }
    setFlagsLoaded(false);
    void resolveFlags(facilityId ?? null, { showCachedFirst: true });
  }, [facilityId, isAuthenticated, resolveFlags]);

  // An admin can enable a feature while the member has the app backgrounded.
  useEffect(() => {
    if (!isAuthenticated) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshFlags();
    });
    return () => subscription.remove();
  }, [isAuthenticated, refreshFlags]);

  const isFeatureEnabled = useCallback(
    (key: FeatureFlagKey) => enabledFeatures.includes(key),
    [enabledFeatures]
  );

  const value: FeatureFlagContextValue = {
    enabledFeatures,
    isFeatureEnabled,
    flagsLoaded,
    flagsFromCache,
    refreshFlags,
  };

  return <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>;
}

export function useFeatureFlags(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) {
    throw new Error('useFeatureFlags must be used within FeatureFlagProvider');
  }
  return ctx;
}
