import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const FACILITY_STORAGE_KEY = 'selectedFacilityId';
const LEGACY_FACILITY_STORAGE_KEY = 'courttime_facility';

function loadStoredFacilityId(): string | null {
  try {
    return localStorage.getItem(FACILITY_STORAGE_KEY) || localStorage.getItem(LEGACY_FACILITY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStoredFacilityId(id: string): void {
  try {
    localStorage.setItem(FACILITY_STORAGE_KEY, id);
    localStorage.setItem(LEGACY_FACILITY_STORAGE_KEY, id);
  } catch {
    // ignore quota / private browsing errors
  }
}

function resolveFacilityId(
  allFacilityIds: string[],
  preferredId?: string | null
): string | null {
  if (allFacilityIds.length === 0) return null;
  const saved = preferredId ?? loadStoredFacilityId();
  if (saved && allFacilityIds.includes(saved)) return saved;
  return allFacilityIds[0];
}

interface AppContextType {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
  enabledFeatures: string[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [selectedFacilityId, setSelectedFacilityIdState] = useState<string>(
    () => loadStoredFacilityId() || 'sunrise-valley'
  );

  const setSelectedFacilityId = useCallback((id: string) => {
    setSelectedFacilityIdState(id);
    saveStoredFacilityId(id);
  }, []);

  // Restore last-selected facility on login/refresh; fall back to first available
  useEffect(() => {
    const allFacilityIds = Array.from(new Set([
      ...(user?.memberFacilities || []),
      ...(user?.adminFacilities || []),
    ]));
    const resolved = resolveFacilityId(allFacilityIds);
    if (!resolved) return;
    setSelectedFacilityIdState(resolved);
    saveStoredFacilityId(resolved);
  }, [user?.id]);

  // If facility list changes, keep selection when valid
  useEffect(() => {
    if (!user) return;
    const allFacilityIds = Array.from(new Set([
      ...(user.memberFacilities || []),
      ...(user.adminFacilities || []),
    ]));
    if (allFacilityIds.length === 0) return;
    if (allFacilityIds.includes(selectedFacilityId)) return;
    const resolved = resolveFacilityId(allFacilityIds);
    if (resolved) setSelectedFacilityId(resolved);
  }, [user, selectedFacilityId, setSelectedFacilityId]);

  // Deep links (e.g. membership request emails) can pin the active facility via ?facilityId=
  useEffect(() => {
    if (!user) return;
    const facilityIdFromUrl = new URLSearchParams(location.search).get('facilityId');
    if (!facilityIdFromUrl) return;
    const allFacilityIds = Array.from(new Set([
      ...(user.memberFacilities || []),
      ...(user.adminFacilities || []),
    ]));
    if (allFacilityIds.includes(facilityIdFromUrl)) {
      setSelectedFacilityId(facilityIdFromUrl);
    }
  }, [location.search, user, setSelectedFacilityId]);

  useEffect(() => {
    if (!selectedFacilityId) { setEnabledFeatures([]); return; }
    fetch(`/api/facilities/${selectedFacilityId}/feature-flags`)
      .then(r => r.json())
      .then(res => { if (res.success) setEnabledFeatures(res.data); })
      .catch(() => setEnabledFeatures([]));
  }, [selectedFacilityId]);

  const toggleSidebar = () => setSidebarCollapsed(prev => !prev);

  return (
    <AppContext.Provider value={{
      sidebarCollapsed,
      toggleSidebar,
      sidebarOpen,
      setSidebarOpen,
      selectedFacilityId,
      setSelectedFacilityId,
      enabledFeatures,
    }}>
      {children}
    </AppContext.Provider>
  );
}
