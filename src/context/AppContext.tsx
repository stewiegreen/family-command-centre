// src/context/AppContext.tsx
//
// Composition root + backward-compatible facade. The original 1,000-line
// AppContext was split into:
//   - AuthContext.tsx       — Firebase connection + identity only
//   - FamilyDataContext.tsx — family data, sync engine, invites, messages,
//                             PIN gates, per-member UI prefs
//
// AppProvider just nests them. useApp() merges both into the same shape the
// old single context exposed, so none of the ~28 existing components that
// call useApp() need to change. New code can call useAuth() / useFamilyData()
// directly for a narrower dependency.

import type { ReactNode } from 'react';
import { AuthProvider, useAuth, type AuthContextValue } from './AuthContext';
import { FamilyDataProvider, useFamilyData, type FamilyDataContextValue } from './FamilyDataContext';

export { useAuth } from './AuthContext';
export { useFamilyData } from './FamilyDataContext';

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FamilyDataProvider>{children}</FamilyDataProvider>
    </AuthProvider>
  );
}

/**
 * Combined shape matching the original AppContextValue, for components that
 * haven't migrated to the split hooks yet.
 */
export type AppContextValue = Omit<AuthContextValue, 'cloudConnectError'> &
  Omit<FamilyDataContextValue, 'cloudError'> & {
    /** Connect error (from Auth) or sync error (from FamilyData), whichever is set. */
    cloudError: string | null;
  };

export function useApp(): AppContextValue {
  const auth = useAuth();
  const family = useFamilyData();
  return {
    ...auth,
    ...family,
    cloudError: family.cloudError ?? auth.cloudConnectError,
  };
}
