import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface AppContextType {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  selectedFacilityId: string;
  setSelectedFacilityId: (id: string) => void;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('sunrise-valley');

  // Auto-select first facility when user logs in or changes
  useEffect(() => {
    if (user?.memberFacilities && user.memberFacilities.length > 0) {
      setSelectedFacilityId(user.memberFacilities[0]);
    }
  }, [user?.id]);

  const toggleSidebar = () => setSidebarCollapsed(prev => !prev);

  return (
    <AppContext.Provider value={{
      sidebarCollapsed,
      toggleSidebar,
      selectedFacilityId,
      setSelectedFacilityId,
    }}>
      {children}
    </AppContext.Provider>
  );
}
