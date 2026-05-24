import React, { createContext, useContext } from 'react';
import { useRegistrationForm, type RegistrationContextValue } from './useRegistrationForm';

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const value = useRegistrationForm();
  return (
    <RegistrationContext.Provider value={value}>
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration(): RegistrationContextValue {
  const ctx = useContext(RegistrationContext);
  if (!ctx) {
    throw new Error('useRegistration must be used within RegistrationProvider');
  }
  return ctx;
}
