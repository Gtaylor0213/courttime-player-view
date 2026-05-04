/**
 * Authentication Context
 * Manages user session with JWT token + secure storage
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, setToken, getToken, removeToken, cacheUser, getCachedUser, clearCache } from '../api/client';
import type { PendingTermsAcceptance } from '../api/client';
import { registerForPushNotifications, unregisterPushNotifications } from '../utils/pushNotifications';
import type { User } from '../types/database';

interface AuthUser extends User {
  memberFacilities?: string[];
  adminFacilities?: string[];
  skillLevel?: string;
  bio?: string;
  ustaRating?: string;
  profileImageUrl?: string;
}

interface FacilityInfo {
  id: string;
  name: string;
  logoUrl?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  facilityId: string | null;
  facilities: FacilityInfo[];
  setFacilityId: (id: string) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => Promise<void>;
  pendingTermsAcceptances: PendingTermsAcceptance[];
  acceptTermsAndContinue: (facilityId: string) => Promise<boolean>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);
const FACILITY_STORAGE_KEY = 'selectedFacilityId';
const LEGACY_FACILITY_STORAGE_KEY = 'courttime_facility';

async function saveFacilityId(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(FACILITY_STORAGE_KEY, id);
    localStorage.setItem(LEGACY_FACILITY_STORAGE_KEY, id);
    return;
  }
  await SecureStore.setItemAsync(FACILITY_STORAGE_KEY, id);
  await SecureStore.setItemAsync(LEGACY_FACILITY_STORAGE_KEY, id);
}

async function loadFacilityId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(FACILITY_STORAGE_KEY) || localStorage.getItem(LEGACY_FACILITY_STORAGE_KEY);
  }
  return (
    (await SecureStore.getItemAsync(FACILITY_STORAGE_KEY)) ||
    (await SecureStore.getItemAsync(LEGACY_FACILITY_STORAGE_KEY))
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<FacilityInfo[]>([]);
  const [pendingTermsAcceptances, setPendingTermsAcceptances] = useState<PendingTermsAcceptance[]>([]);
  const pushTokenRef = useRef<string | null>(null);

  // Check for existing session on app launch
  useEffect(() => {
    checkAuth();
  }, []);

  // Register push notifications when user changes.
  useEffect(() => {
    if (!state.user) {
      setFacilities([]);
      setSelectedFacilityId(null);
      return;
    }

    // Register for push notifications (fire-and-forget)
    registerForPushNotifications(state.user.id).then(token => {
      pushTokenRef.current = token;
    });
  }, [state.user?.id]);

  async function hydrateFacilitiesForUser(user: AuthUser): Promise<string | null> {
    const memberFacilities = user.memberFacilities || [];
    const adminFacilities = user.adminFacilities || [];
    const allIds = Array.from(new Set([...memberFacilities, ...adminFacilities]));

    const saved = await loadFacilityId();
    const resolvedSelectedFacilityId =
      (saved && allIds.includes(saved) ? saved : null) ||
      memberFacilities[0] ||
      adminFacilities[0] ||
      null;

    console.log('[auth] facility hydrate', {
      userId: user.id,
      memberFacilities,
      adminFacilities,
      savedFacilityId: saved,
      resolvedSelectedFacilityId,
    });

    if (allIds.length === 0) {
      setFacilities([]);
      setSelectedFacilityId(null);
      return null;
    }

    const results = await Promise.all(allIds.map(id => api.get(`/api/facilities/${id}`)));
    const infos: FacilityInfo[] = [];
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.success && res.data) {
        const fac = res.data.facility || res.data;
        infos.push({
          id: allIds[i],
          name: fac.name || allIds[i],
          logoUrl: fac.logoUrl || fac.logo_url || fac.logo || undefined,
        });
      } else {
        infos.push({ id: allIds[i], name: allIds[i] });
      }
    }
    setFacilities(infos);
    setSelectedFacilityId(resolvedSelectedFacilityId);
    if (resolvedSelectedFacilityId) {
      await saveFacilityId(resolvedSelectedFacilityId);
    }
    return resolvedSelectedFacilityId;
  }

  async function loadTermsStatus(currentUser: AuthUser | null) {
    if (!currentUser || currentUser.userType === 'admin') {
      setPendingTermsAcceptances([]);
      return;
    }
    try {
      const res = await api.get('/api/auth/terms/status');
      if (res.success && res.data?.pendingAcceptances) {
        setPendingTermsAcceptances(res.data.pendingAcceptances);
      } else {
        setPendingTermsAcceptances([]);
      }
    } catch {
      setPendingTermsAcceptances([]);
    }
  }

  async function checkAuth() {
    try {
      const token = await getToken();
      if (!token) {
        setState({ user: null, isLoading: false, isAuthenticated: false });
        return;
      }

      // Validate token with server and get fresh user data
      const result = await api.get('/api/auth/me');
      if (result.success && result.data?.user) {
        const freshUser = result.data.user;
        await cacheUser(freshUser);
        await hydrateFacilitiesForUser(freshUser);
        setState({ user: freshUser, isLoading: false, isAuthenticated: true });
        await loadTermsStatus(freshUser);
      } else {
        // Token invalid/expired — try cached user as fallback, otherwise logout
        const cached = await getCachedUser();
        if (cached && result.error === 'Network error. Please check your connection.') {
          // Offline — use cached data
          await hydrateFacilitiesForUser(cached);
          setState({ user: cached, isLoading: false, isAuthenticated: true });
        } else {
          // Token expired or invalid
          await clearCache();
          setState({ user: null, isLoading: false, isAuthenticated: false });
        }
      }
    } catch {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }

  async function login(email: string, password: string) {
    const result = await api.post('/api/auth/login', { email, password });

    if (result.success && result.data) {
      const { user, token } = result.data;
      if (token) {
        await setToken(token);
      }
      if (user) {
        console.log('[auth] login payload', {
          userId: user.id,
          email: user.email,
          memberFacilities: user.memberFacilities || [],
          adminFacilities: user.adminFacilities || [],
        });
        await cacheUser(user);
        const resolvedSelectedFacilityId = await hydrateFacilitiesForUser(user);
        console.log('[auth] login resolved facility', {
          userId: user.id,
          resolvedSelectedFacilityId,
        });
        setState({ user, isLoading: false, isAuthenticated: true });
        await loadTermsStatus(user);
        return { success: true };
      }
    }

    return { success: false, error: result.data?.message || result.error || 'Login failed' };
  }

  async function register(data: RegisterData) {
    const result = await api.post('/api/auth/register', {
      ...data,
      fullName: `${data.firstName} ${data.lastName}`,
      userType: 'player',
    });

    if (result.success && result.data) {
      const { user, token } = result.data;
      if (token) {
        await setToken(token);
      }
      if (user) {
        await hydrateFacilitiesForUser(user);
        await cacheUser(user);
        setState({ user, isLoading: false, isAuthenticated: true });
        await loadTermsStatus(user);
        return { success: true };
      }
    }

    return { success: false, error: result.data?.message || result.error || 'Registration failed' };
  }

  async function acceptTermsAndContinue(facilityId: string): Promise<boolean> {
    const res = await api.post('/api/auth/terms/accept', { facilityId });
    if (!res.success) return false;
    await loadTermsStatus(state.user);
    return true;
  }

  async function logout() {
    // Unregister push token before clearing state
    if (state.user?.id) {
      await unregisterPushNotifications(state.user.id, pushTokenRef.current);
      pushTokenRef.current = null;
    }
    await clearCache();
    setPendingTermsAcceptances([]);
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }

  async function updateUser(updates: Partial<AuthUser>) {
    if (!state.user) return;
    const updatedUser = { ...state.user, ...updates };
    await cacheUser(updatedUser);
    setState(prev => ({ ...prev, user: updatedUser }));
  }

  function handleSetFacilityId(id: string) {
    setSelectedFacilityId(id);
    saveFacilityId(id);
  }

  return (
    <AuthContext.Provider value={{ ...state, facilityId: selectedFacilityId, facilities, setFacilityId: handleSetFacilityId, login, register, logout, updateUser, pendingTermsAcceptances, acceptTermsAndContinue }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
