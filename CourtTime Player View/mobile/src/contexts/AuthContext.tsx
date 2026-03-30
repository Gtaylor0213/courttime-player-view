/**
 * Authentication Context
 * Manages user session with secure token storage
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, removeToken, getToken } from '../api/client';
import type { User } from '../types/database';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
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

      const result = await api.get('/api/auth/me');
      if (result.success && result.data) {
        setState({ user: result.data, isLoading: false, isAuthenticated: true });
      } else {
        await removeToken();
        setState({ user: null, isLoading: false, isAuthenticated: false });
      }
    } catch {
      setState({ user: null, isLoading: false, isAuthenticated: false });
    }
  }

  async function login(email: string, password: string) {
    const result = await api.post('/api/auth/login', { email, password });

    if (result.success && result.data) {
      await setToken(result.data.token);
      setState({ user: result.data.user, isLoading: false, isAuthenticated: true });
      return { success: true };
    }

    return { success: false, error: result.error || 'Login failed' };
  }

  async function register(data: RegisterData) {
    const result = await api.post('/api/auth/register', {
      ...data,
      userType: 'player', // Mobile app only registers players
    });

    if (result.success && result.data) {
      await setToken(result.data.token);
      setState({ user: result.data.user, isLoading: false, isAuthenticated: true });
      return { success: true };
    }

    return { success: false, error: result.error || 'Registration failed' };
  }

  async function logout() {
    await removeToken();
    setState({ user: null, isLoading: false, isAuthenticated: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
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
