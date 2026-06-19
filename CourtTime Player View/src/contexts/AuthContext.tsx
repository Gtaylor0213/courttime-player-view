import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner@2.0.3';
import { authApi, resetSessionExpiryNotification } from '../api/client';
import { isSessionAuthError } from '../../shared/utils/sessionAuth';
import type { TermsAttachment } from '../api/client';
import type { AuthResponseShape, AuthUserShape } from '../../shared/types';

export interface User extends Omit<AuthUserShape, 'memberFacilities' | 'adminFacilities'> {
  id: string;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  userType: 'player' | 'admin';
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  memberFacilities: string[]; // Array of facility IDs user belongs to
  adminFacilities: string[]; // Array of facility IDs user is admin of
  viewOnlyFacilities?: string[]; // Array of facility IDs where user is view-only (cannot book)
  suspendedFacilities?: Array<{ facilityId: string; facilityName: string; suspendedUntil?: string | null }>;
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
  selectedFacilities?: string[];
  setupToken?: string;
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
  termsLoading: boolean;
  pendingTermsAcceptances: PendingTermsAcceptance[];
  login: (email: string, password: string, setupToken?: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string, userType?: 'player' | 'admin', additionalData?: RegistrationData) => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<boolean>;
  refreshTermsStatus: () => Promise<void>;
  acceptTermsAndContinue: (facilityId: string) => Promise<boolean>;
  getAccessToken: () => string | null;
}

export interface PendingTermsAcceptance {
  facilityId: string;
  facilityName: string;
  currentVersionId: string;
  currentVersionNumber: number;
  contentHtml: string;
  attachments: TermsAttachment[];
  requiredReviewSeconds: number;
  publishedAt: string;
  acceptedVersionNumber: number | null;
  acceptedAt: string | null;
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
  const [termsLoading, setTermsLoading] = useState(false);
  const [pendingTermsAcceptances, setPendingTermsAcceptances] = useState<PendingTermsAcceptance[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const clearStoredSession = () => {
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_token');
    setUser(null);
    setAccessToken(null);
    setPendingTermsAcceptances([]);
  };

  // Initialize auth state
  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const refreshOnFocus = () => {
      void loadTermsStatus(user);
    };

    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [user?.id]);

  useEffect(() => {
    const onSessionExpired = () => {
      clearStoredSession();
      toast.error('Your session expired. Please log in again.');
    };
    window.addEventListener('auth-session-expired', onSessionExpired);
    return () => window.removeEventListener('auth-session-expired', onSessionExpired);
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
          const result = await authApi.getMe();
          if (result.success && result.data?.user) {
            const refreshedUser = result.data.user;
            setUser(refreshedUser);
            // Update localStorage with fresh data
            localStorage.setItem('auth_user', JSON.stringify(refreshedUser));
            await loadTermsStatus(refreshedUser, { blockUi: true });
          } else if (isSessionAuthError(result.error)) {
            clearStoredSession();
          } else {
            // Fall back to cached user if API fails (e.g. network)
            setUser(parsedUser);
            await loadTermsStatus(parsedUser, { blockUi: true });
          }
        } catch (parseError) {
          console.error('Failed to parse saved user:', parseError);
          clearStoredSession();
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      setLoading(false);
    }
  };

  const loadTermsStatus = async (
    currentUser: User | null,
    options?: { blockUi?: boolean }
  ) => {
    if (!currentUser) {
      setPendingTermsAcceptances([]);
      return;
    }

    const blockUi = options?.blockUi ?? false;

    try {
      if (blockUi) setTermsLoading(true);
      const response = await authApi.getTermsStatus();
      if (response.success) {
        const payload = response.data as { pendingAcceptances?: PendingTermsAcceptance[] } | undefined;
        setPendingTermsAcceptances(payload?.pendingAcceptances ?? []);
      } else {
        setPendingTermsAcceptances([]);
      }
    } catch (error) {
      console.error('Failed to load terms status:', error);
      setPendingTermsAcceptances([]);
    } finally {
      if (blockUi) setTermsLoading(false);
    }
  };

  const login = async (email: string, password: string, setupToken?: string): Promise<boolean> => {
    try {
      setLoading(true);

      const result = await authApi.login(email, password, setupToken);

      if (result.success && result.data) {
        const backendResponse = result.data as AuthResponseShape;
        if (backendResponse.user && backendResponse.token) {
          setUser(backendResponse.user);
          setAccessToken(backendResponse.token);
          localStorage.setItem('auth_user', JSON.stringify(backendResponse.user));
          localStorage.setItem('auth_token', backendResponse.token);
          resetSessionExpiryNotification();
          await loadTermsStatus(backendResponse.user, { blockUi: true });
          toast.success(setupToken ? 'Logged in and joined facility' : 'Logged in successfully');
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
        selectedFacilities: additionalData?.selectedFacilities,
        setupToken: additionalData?.setupToken,
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
        const token = result.data.token;
        setUser(registeredUser);
        setAccessToken(token);
        localStorage.setItem('auth_user', JSON.stringify(registeredUser));
        localStorage.setItem('auth_token', token);
        resetSessionExpiryNotification();
        await loadTermsStatus(registeredUser, { blockUi: true });
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
      setPendingTermsAcceptances([]);
      toast.success('Logged out successfully');
    } catch (error: any) {
      console.error('Logout failed:', error);
      toast.error('Logout failed');
    }
  };

  const updateProfile = async (updates: Partial<User>): Promise<boolean> => {
    if (!accessToken) return false;

    try {
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

  const refreshTermsStatus = useCallback(async () => {
    await loadTermsStatus(user);
  }, [user?.id, user?.userType]);

  const acceptTermsAndContinue = async (facilityId: string): Promise<boolean> => {
    try {
      const response = await authApi.acceptTerms(facilityId);
      if (!response.success) {
        toast.error(response.error || 'Failed to accept Terms & Conditions');
        return false;
      }

      setPendingTermsAcceptances((prev) => prev.filter((item) => item.facilityId !== facilityId));
      await loadTermsStatus(user);
      toast.success('Terms & Conditions accepted');
      return true;
    } catch (error: any) {
      console.error('Failed to accept terms:', error);
      toast.error(error.message || 'Failed to accept Terms & Conditions');
      return false;
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    termsLoading,
    pendingTermsAcceptances,
    login,
    register,
    logout,
    updateProfile,
    refreshTermsStatus,
    acceptTermsAndContinue,
    getAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}