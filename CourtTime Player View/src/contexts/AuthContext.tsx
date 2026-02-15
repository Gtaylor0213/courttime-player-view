import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { authApi } from '../api/client';

function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  userType: 'player' | 'admin';
  memberFacilities?: string[]; // Array of facility IDs user belongs to
  adminFacilities?: string[]; // Array of facility IDs user is admin of
  profileImageUrl?: string; // Profile image (base64 or URL)
  skillLevel?: string;
  ustaRating?: string; // USTA/NTRP rating (e.g., "3.0", "3.5", "4.0", etc.)
  bio?: string;
  preferences?: {
    notifications: boolean;
    timezone: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface RegistrationData {
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  skillLevel?: string;
  ustaRating?: string;
  bio?: string;
  profilePicture?: string;
  notificationPreferences?: {
    emailBookingConfirmations?: boolean;
    smsReminders?: boolean;
    promotionalEmails?: boolean;
    weeklyDigest?: boolean;
    maintenanceUpdates?: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string, userType?: 'player' | 'admin', additionalData?: RegistrationData) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<boolean>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Initialize auth state
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Check for saved session in localStorage
      const savedUser = localStorage.getItem('auth_user');
      const savedToken = localStorage.getItem('auth_token');

      if (savedUser && savedToken) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setAccessToken(savedToken);

          // Refresh user data from API to get latest memberships
          const result = await authApi.getMe(parsedUser.id);
          if (result.success && result.data?.user) {
            const refreshedUser = result.data.user;
            setUser(refreshedUser);
            // Update localStorage with fresh data
            localStorage.setItem('auth_user', JSON.stringify(refreshedUser));
            console.log('Session restored and refreshed from API');
          } else {
            // Fall back to cached user if API fails
            setUser(parsedUser);
            console.log('Session restored from localStorage (API refresh failed)');
          }
        } catch (parseError) {
          console.error('Failed to parse saved user:', parseError);
          // Clear invalid data
          localStorage.removeItem('auth_user');
          localStorage.removeItem('auth_token');
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);

      const result = await authApi.login(email, password);

      if (result.success && result.data) {
        const backendResponse = result.data as any;
        if (backendResponse.user) {
          const token = generateSessionToken();
          setUser(backendResponse.user);
          setAccessToken(token);
          localStorage.setItem('auth_user', JSON.stringify(backendResponse.user));
          localStorage.setItem('auth_token', token);
          toast.success('Logged in successfully');
          return true;
        }
      }

      toast.error(result.error || 'Login failed');
      return false;
    } catch (error: any) {
      console.error('Login failed:', error);
      toast.error(error.message || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
    userType?: 'player' | 'admin',
    additionalData?: RegistrationData
  ): Promise<boolean> => {
    try {
      setLoading(true);

      const result = await authApi.register({
        email,
        password,
        fullName,
        userType: userType || 'player',
        phone: additionalData?.phone,
        streetAddress: additionalData?.streetAddress,
        city: additionalData?.city,
        state: additionalData?.state,
        zipCode: additionalData?.zipCode,
        skillLevel: additionalData?.skillLevel,
        ustaRating: additionalData?.ustaRating,
        bio: additionalData?.bio,
        profilePicture: additionalData?.profilePicture,
        notificationPreferences: additionalData?.notificationPreferences
      });

      if (result.success && result.data && result.data.user) {
        const registeredUser = result.data.user;
        const token = generateSessionToken();
        setUser(registeredUser);
        setAccessToken(token);
        localStorage.setItem('auth_user', JSON.stringify(registeredUser));
        localStorage.setItem('auth_token', token);
        return true;
      } else {
        toast.error(result.error || 'Registration failed');
        return false;
      }
    } catch (error: any) {
      console.error('Registration failed:', error);
      toast.error(error.message || 'Registration failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Clear localStorage
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');

      // Clear sessionStorage (including quick reserve popup flag)
      sessionStorage.removeItem('quick_reserve_shown');

      setUser(null);
      setAccessToken(null);
      toast.success('Logged out successfully');
    } catch (error: any) {
      console.error('Logout failed:', error);
      toast.error('Logout failed');
    }
  };

  const updateProfile = async (updates: Partial<User>): Promise<boolean> => {
    if (!accessToken) return false;

    try {
      // TODO: Implement your profile update logic here
      if (user) {
        const updatedUser = { ...user, ...updates };
        setUser(updatedUser);
        // Update localStorage
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        toast.success('Profile updated successfully');
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Profile update failed:', error);
      toast.error(error.message || 'Profile update failed');
      return false;
    }
  };

  const getAccessToken = (): string | null => {
    return accessToken;
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    getAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}