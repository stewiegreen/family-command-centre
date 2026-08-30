import type { FirebaseConfig } from '../types';

/**
 * Built-in Firebase web config for this family deploy.
 * Baked into the production build so every phone only signs in / uses an invite.
 *
 * Override at build time with VITE_FIREBASE_* env vars if needed.
 */
const fromEnv: FirebaseConfig | null =
  import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID
    ? {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
        authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || '',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
        storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || '',
        messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || '',
        appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || '',
      }
    : null;

/** Default project config (used when env vars are not set). */
const BUILT_IN: FirebaseConfig = {
  apiKey: 'AIzaSyBFKQ356Fs-eVjG-T24tcP6RbUHtfNcICc',
  authDomain: 'command-c62ad.firebaseapp.com',
  projectId: 'command-c62ad',
  storageBucket: 'command-c62ad.firebasestorage.app',
  messagingSenderId: '461364513601',
  appId: '1:461364513601:web:cda69c4c08e31947392fc0',
};

export const BUILT_IN_FIREBASE_CONFIG: FirebaseConfig = fromEnv || BUILT_IN;

/** True when a config is compiled into the app (no paste required). */
export const HAS_BUILT_IN_CONFIG = Boolean(
  BUILT_IN_FIREBASE_CONFIG.apiKey && BUILT_IN_FIREBASE_CONFIG.projectId,
);
