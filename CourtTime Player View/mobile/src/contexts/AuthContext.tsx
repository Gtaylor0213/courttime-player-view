/**
 * Authentication Context
 * Manages user session with JWT token + secure storage
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, setToken, getToken, removeToken, cacheUser, getCachedUser, clearCache } from '../api/client';
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
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function saveFacilityId(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem('courttime_facility', id);
    return;
  }
  await SecureStore.setItemAsync('courttime_facility', id);
}

async function loadFacilityId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem('courttime_facility');
  }
  return SecureStore.getItemAsync('courttime_facility');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<FacilityInfo[]>([]);

  // Check for existing session on app launch
  useEffect(() => {
    checkAuth();
  }, []);

  // Fetch facility names and restore selected facility when user changes
  useEffect(() => {
    if (!state.user) {
      setFacilities([]);
      setSelectedFacilityId(null);
      return;
    }

    const allIds = Array.from(new Set([
      ...(state.user.memberFacilities || []),
      ...(state.user.adminFacilities || []),
    ]));

    if (allIds.length === 0) {
      setFacilities([]);
      setSelectedFacilityId(null);
      return;
    }

    // Fetch facility names
    Promise.all(allIds.map(id => api.get(`/api/facilities/${id}`))).then(async (results) => {
      const infos: FacilityInfo[] = [];
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.success && res.data) {
          const fac = res.data.facility || res.data;
          infos.push({ id: allIds[i], name: fac.name || allIds[i] });
        } else {
          infos.push({ id: allIds[i], name: allIds[i] });
        }
      }
      setFacilities(infos);

      // Restore previously selected facility, or default to first
      const saved = await loadFacilityId();
      if (saved && allIds.includes(saved)) {
        setSelectedFacilityId(saved);
      } else {
        setSelectedFacilityId(allIds[0]);
      }
    });
  }, [state.user?.id]);

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
        setState({ user: freshUser, isLoading: false, isAuthenticated: true });
      } else {
        // Token invalid/expired — try cached user as fallback, otherwise logout
        const cached = await getCachedUser();
        if (cached && result.error === 'Network error. Please check your connection.') {
          // Offline — use cached data
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
        await cacheUser(user);
        setState({ user, isLoading: false, isAuthenticated: true });
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
        await cacheUser(user);
        setState({ user, isLoading: false, isAuthenticated: true });
        return { success: true };
      }
    }

    return { success: false, error: result.data?.message || result.error || 'Registration failed' };
  }

  async function logout() {
    await clearCache();
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
    <AuthContext.Provider value={{ ...state, facilityId: selectedFacilityId, facilities, setFacilityId: handleSetFacilityId, login, register, logout, updateUser }}>
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
