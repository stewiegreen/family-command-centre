// src/context/AuthContext.tsx
//
// Owns Firebase *connection* and *identity* only: is a cloud config present,
// is it valid, who (if anyone) is signed in. It knows nothing about family
// data, invites, messages, or PIN gates — that's FamilyDataContext, which
// consumes this context and reacts to authUser/authReady changes.
//
// Split out of the original monolithic AppContext. See FamilyDataContext.tsx
// for the sync engine, and AppContext.tsx for the backward-compatible
// combined useApp() hook used by existing pages.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import type { FirebaseConfig } from '../types';
import { loadCloudConfig, saveCloudConfig } from '../lib/storage';
import { PROFILE_OVERRIDE_KEY } from '../lib/actingMember';
import {
  createUserWithEmailAndPassword,
  fbSignOut,
  getFirebaseAuth,
  initFirebase,
  onAuthStateChanged,
  resetFirebase,
  signInWithEmailAndPassword,
} from '../lib/firebase';

export interface AuthContextValue {
  /** Signed-in Firebase user, or null if signed out / no cloud configured. */
  authUser: User | null;
  /** True once the initial auth check has resolved (avoids a signed-out flash). */
  authReady: boolean;
  /** True once a Firebase app is initialized from a valid config. */
  cloudReady: boolean;
  /** Set when a config fails to initialize. Distinct from family-sync errors. */
  cloudConnectError: string | null;
  /** Save + initialize a new Firebase config (e.g. pasted in Settings). */
  connectCloud: (cfg: FirebaseConfig) => Promise<boolean>;
  /** Sign out (if signed in), clear the saved config, and tear down the Firebase app. */
  disconnectFirebase: () => Promise<void>;
  /** Create a Firebase Auth user. Throws if cloud isn't connected. */
  createAccount: (email: string, password: string) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  loadCloudConfig: typeof loadCloudConfig;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudConnectError, setCloudConnectError] = useState<string | null>(null);
  const unsubAuthRef = useRef<(() => void) | null>(null);

  const attachAuthListener = useCallback(() => {
    if (unsubAuthRef.current) return;
    unsubAuthRef.current = onAuthStateChanged((user) => {
      // Real Firebase user changed — drop pseudo profile override from the
      // previous session (moved verbatim from the old combined effect).
      try {
        sessionStorage.removeItem(PROFILE_OVERRIDE_KEY);
      } catch {
        /* ignore */
      }
      setAuthUser(user);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const cfg = loadCloudConfig();
      if (!cfg) {
        setAuthReady(true);
        return;
      }
      const ok = await initFirebase(cfg);
      if (cancelled) return;
      if (!ok) {
        setCloudConnectError('Could not connect to Firebase. Check your config in Settings.');
        setAuthReady(true);
        return;
      }
      setCloudReady(true);
      attachAuthListener();
    };
    void boot();
    return () => {
      cancelled = true;
      if (unsubAuthRef.current) unsubAuthRef.current();
    };
  }, [attachAuthListener]);

  const connectCloud = useCallback(
    async (cfg: FirebaseConfig) => {
      saveCloudConfig(cfg);
      const ok = await initFirebase(cfg);
      if (!ok) {
        setCloudConnectError('Invalid Firebase config');
        setCloudReady(false);
        return false;
      }
      setCloudReady(true);
      setCloudConnectError(null);
      attachAuthListener();
      return true;
    },
    [attachAuthListener],
  );

  const disconnectFirebase = useCallback(async () => {
    if (getFirebaseAuth()) {
      try {
        await fbSignOut();
      } catch {
        /* ignore */
      }
    }
    saveCloudConfig(null);
    resetFirebase();
    // Tear down the auth listener so a later reconnect can attach a fresh one
    // and we don't keep firing setState on an unmounted/disconnected tree.
    if (unsubAuthRef.current) {
      unsubAuthRef.current();
      unsubAuthRef.current = null;
    }
    setAuthUser(null);
    setCloudReady(false);
    setCloudConnectError(null);
  }, []);

  const createAccount = useCallback(async (email: string, password: string) => {
    if (!getFirebaseAuth()) throw new Error('Cloud not connected');
    const cred = await createUserWithEmailAndPassword(email.trim(), password);
    return cred.user;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!getFirebaseAuth()) throw new Error('Cloud not connected');
    const cred = await signInWithEmailAndPassword(email.trim(), password);
    return cred.user;
  }, []);

  const signOut = useCallback(async () => {
    if (getFirebaseAuth()) await fbSignOut();
    setAuthUser(null);
  }, []);

  const value: AuthContextValue = {
    authUser,
    authReady,
    cloudReady,
    cloudConnectError,
    connectCloud,
    disconnectFirebase,
    createAccount,
    signIn,
    signOut,
    loadCloudConfig,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
