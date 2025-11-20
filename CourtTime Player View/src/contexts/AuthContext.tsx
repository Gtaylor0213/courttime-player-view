import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { authApi } from '../api/client';

// DEV MODE: Set to true to use mock data, false to use real database
const DEV_MODE = false;

export interface User {
  id: string;
  email: string;
  fullName: string;
  userType: 'player' | 'admin';
  memberFacilities?: string[]; // Array of facility IDs user belongs to
  profileImageUrl?: string; // Profile image (base64 or URL)
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
  bio?: string;
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
      // Initialize auth state - Supabase removed
      // TODO: Implement your authentication initialization logic here
      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);

      // DEV MODE: Auto-login without database
      if (DEV_MODE) {
        const mockUser: User = {
          id: 'dev-user-123',
          email: email,
          fullName: 'Development User',
          userType: 'player',
          memberFacilities: ['sunrise-valley', 'riverside'],
          preferences: {
            notifications: true,
            timezone: 'America/New_York'
          }
        };
        setUser(mockUser);
        setAccessToken('dev-token-123');
        toast.success('Logged in (Dev Mode)');
        return true;
      }

      // Real database login
      const result = await authApi.login(email, password);

      console.log('Login API result:', result);

      if (result.success && result.data) {
        // The API client wraps backend response: { success: true, data: { success: true, user: {...} } }
        const backendResponse = result.data as any;
        if (backendResponse.user) {
          setUser(backendResponse.user);
          setAccessToken('token-' + backendResponse.user.id);
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

      // DEV MODE: Auto-register without database
      if (DEV_MODE) {
        const mockUser: User = {
          id: 'dev-user-' + Date.now(),
          email: email,
          fullName: fullName,
          userType: userType || 'player',
          memberFacilities: ['sunrise-valley'],
          preferences: {
            notifications: true,
            timezone: 'America/New_York'
          }
        };
        setUser(mockUser);
        setAccessToken('dev-token-' + Date.now());
        toast.success('Registered successfully (Dev Mode)');
        return true;
      }

      // Real database registration
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
        bio: additionalData?.bio,
        notificationPreferences: additionalData?.notificationPreferences
      });

      if (result.success && result.data) {
        setUser(result.data.user);
        setAccessToken('token-' + result.data.user.id);
        toast.success('Registration successful!');
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
      // TODO: Implement your logout logic here
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
        setUser({ ...user, ...updates });
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