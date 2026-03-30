/**
 * Authentication Context
 * Manages user session with JWT token + secure storage
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
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

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  facilityId: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check for existing session on app launch
  useEffect(() => {
    checkAuth();
  }, []);

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

  const facilityId = state.user?.memberFacilities?.[0] || null;

  return (
    <AuthContext.Provider value={{ ...state, facilityId, login, register, logout }}>
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
