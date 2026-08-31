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
import type { FamilyData, FirebaseConfig, Invite, Member, Message, Role, SyncStatus, ViewId } from '../types';
import {
  CURRENT_USER_KEY,
  FAMILY_ID_KEY,
  loadCloudConfig,
  loadLocalData,
  saveCloudConfig,
  saveLocalData,
} from '../lib/storage';
import { migratePayload } from '../lib/defaults';
import {
  cloudCreateInvite,
  cloudDeleteMessage,
  cloudJoinWithInvite,
  cloudListInvites,
  cloudMarkMessageRead,
  cloudRevokeInvite,
  cloudSendMessage,
  cloudWrite,
  createUserWithEmailAndPassword,
  fetchUserFamily,
  clearUserFamily,
  getFirebaseAuth,
  getDb,
  initFirebase,
  onAuthStateChanged,
  partitionMessagesForPrune,
  resetFirebase,
  signInWithEmailAndPassword,
  fbSignOut,
  subscribeFamily,
  subscribeMessages,
  updateProfile,
} from '../lib/firebase';

const PARENT_PIN_SESSION_KEY = 'fcc_parent_pin_ok';
const KID_PIN_SESSION_KEY = 'fcc_kid_pin_ok';
const PROFILE_OVERRIDE_KEY = 'fcc_profile_override';

interface AppContextValue {
  data: FamilyData;
  update: (updater: FamilyData | ((prev: FamilyData) => FamilyData)) => void;
  view: ViewId;
  setView: (v: ViewId) => void;
  currentUser: Member | undefined;
  getMember: (id: string) => Member | undefined;
  isParent: boolean;
  isMediaOnly: boolean;
  cloudReady: boolean;
  cloudError: string | null;
  familyId: string;
  syncStatus: SyncStatus;
  authUser: User | null;
  authReady: boolean;
  needsFamilySetup: boolean;
  /** Parent PIN unlocked for this browser session (sensitive settings). */
  parentPinUnlocked: boolean;
  unlockParentPin: (pin: string) => boolean;
  lockParentPin: () => void;
  /** Kid profile PIN gate (app unlock). */
  kidPinRequired: boolean;
  kidPinUnlocked: boolean;
  unlockKidPin: (pin: string) => boolean;
  /** Switch active profile on this device (PIN required if target has one). */
  switchProfile: (memberId: string, pin?: string) => { ok: boolean; error?: string };
  /** Set theme for the current member (kids can change their own). */
  setMyTheme: (theme: import('../types').ThemeId) => void;
  connectCloud: (cfg: FirebaseConfig) => Promise<boolean>;
  createFamily: (displayName: string) => Promise<string>;
  joinFamily: (inviteCode: string, displayName: string) => Promise<string>;
  leaveFamily: () => Promise<void>;
  disconnectCloud: () => Promise<void>;
  createInvite: (opts: { role: Role; label: string }) => Promise<Invite>;
  listInvites: () => Promise<Invite[]>;
  revokeInvite: (code: string) => Promise<void>;
  sendMessage: (toMemberId: string, text: string) => Promise<void>;
  markThreadRead: (fromMemberId: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  loadCloudConfig: typeof loadCloudConfig;
}

const AppCtx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<FamilyData>(loadLocalData);
  const [view, setView] = useState<ViewId>('dashboard');
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState(() => localStorage.getItem(FAMILY_ID_KEY) || '');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [needsFamilySetup, setNeedsFamilySetup] = useState(false);
  const [parentPinUnlocked, setParentPinUnlocked] = useState(
    () => sessionStorage.getItem(PARENT_PIN_SESSION_KEY) === '1',
  );
  const [kidPinUnlocked, setKidPinUnlocked] = useState(
    () => sessionStorage.getItem(KID_PIN_SESSION_KEY) === '1',
  );
  const unsubRef = useRef<(() => void) | null>(null);
  const unsubMsgRef = useRef<(() => void) | null>(null);
  const unsubAuthRef = useRef<(() => void) | null>(null);
  const writingRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const startFamilyListener = useCallback((fid: string, preferredMemberId?: string | null) => {
    if (unsubRef.current) unsubRef.current();
    if (unsubMsgRef.current) unsubMsgRef.current();
    setFamilyId(fid);
    setSyncStatus('connecting');
    unsubRef.current = subscribeFamily(
      fid,
      (remote) => {
        if (writingRef.current) return;
        setData((prev) => {
          let currentUserId = preferredMemberId || prev.settings.currentUserId;
          const auth = getFirebaseAuth();
          const linked = remote.members.find((m) => m.uid && auth?.currentUser && m.uid === auth.currentUser.uid);
          const override = sessionStorage.getItem(PROFILE_OVERRIDE_KEY);
          if (override && remote.members.some((m) => m.id === override)) {
            // Explicit profile switch on this device
            currentUserId = override;
          } else if (linked) {
            currentUserId = linked.id;
          } else if (!remote.members.some((m) => m.id === currentUserId)) {
            currentUserId = remote.members[0]?.id || currentUserId;
          }
          let migrated = remote;
          try {
            migrated = migratePayload(remote);
          } catch (err) {
            console.error('migratePayload failed', err);
          }
          return {
            ...migrated,
            // Messages come from the subcollection listener — keep them.
            messages: prev.messages,
            settings: { ...migrated.settings, currentUserId },
          };
        });
        setSyncStatus('live');
        setCloudError(null);
        setNeedsFamilySetup(false);
      },
      (err) => {
        console.error(err);
        setCloudError(err.message || 'Sync error');
        setSyncStatus('error');
      },
    );
    const auth = getFirebaseAuth();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      unsubMsgRef.current = subscribeMessages(
        fid,
        uid,
        (messages) => {
          const me = dataRef.current.members.find(
            (m) => m.id === dataRef.current.settings.currentUserId,
          );
          const isParentRole = me?.role === 'parent';
          const { toDelete } = partitionMessagesForPrune(messages, {
            myMemberId: me?.id || '',
            myUid: uid,
            canDeleteAny: isParentRole,
          });
          if (toDelete.length) {
            void Promise.all(
              toDelete.map((m) => cloudDeleteMessage(fid, m.id).catch(() => {})),
            );
          }
          // Keep full server list in state; UI shows last 50 per thread.
          // Deletes above will shrink the snapshot on the next event.
          setData((prev) => ({ ...prev, messages }));
        },
        (err) => console.error('messages sync', err),
      );
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem(CURRENT_USER_KEY);
    if (savedUser) {
      setData((prev) => {
        if (prev.members.some((m) => m.id === savedUser)) {
          return { ...prev, settings: { ...prev.settings, currentUserId: savedUser } };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const cfg = loadCloudConfig();
      if (!cfg) {
        setSyncStatus('local');
        setAuthReady(true);
        return;
      }
      const ok = await initFirebase(cfg);
      if (cancelled) return;
      if (!ok) {
        setCloudError('Could not connect to Firebase. Check your config in Settings.');
        setSyncStatus('error');
        setAuthReady(true);
        return;
      }
      setCloudReady(true);
      unsubAuthRef.current = onAuthStateChanged(async (user) => {
        setAuthUser(user);
        setAuthReady(true);
        if (!user) {
          if (unsubRef.current) {
            unsubRef.current();
            unsubRef.current = null;
          }
          setFamilyId('');
          setSyncStatus('auth');
          setNeedsFamilySetup(false);
          return;
        }
        try {
          const userDoc = await fetchUserFamily(user.uid);
          let fid = userDoc?.familyId || '';
          const memberId = userDoc?.memberId || null;
          if (!fid) fid = localStorage.getItem(FAMILY_ID_KEY) || '';
          if (fid) {
            // Membership is enforced by Firestore rules (members-only read).
            // If not a member, the listener errors and we fall through to setup.
            localStorage.setItem(FAMILY_ID_KEY, fid);
            startFamilyListener(fid, memberId);
            return;
          }
          localStorage.removeItem(FAMILY_ID_KEY);
          setFamilyId('');
          setNeedsFamilySetup(true);
          setSyncStatus('auth');
        } catch (e) {
          console.error(e);
          setCloudError(e instanceof Error ? e.message : 'Auth/family lookup failed');
          setNeedsFamilySetup(true);
          setSyncStatus('auth');
        }
      });
    };
    void boot();
    return () => {
      cancelled = true;
      if (unsubRef.current) unsubRef.current();
      if (unsubAuthRef.current) unsubAuthRef.current();
    };
  }, [startFamilyListener]);

  const persist = useCallback(async (next: FamilyData) => {
    saveLocalData(next);
    const fid = localStorage.getItem(FAMILY_ID_KEY);
    const cfg = loadCloudConfig();
    const auth = getFirebaseAuth();
    if (cfg && fid && getDb() && auth?.currentUser) {
      writingRef.current = true;
      try {
        await cloudWrite(fid, next);
        setSyncStatus('live');
        setCloudError(null);
      } catch (e) {
        console.error(e);
        setCloudError(e instanceof Error ? e.message : 'Write failed');
        setSyncStatus('error');
      } finally {
        setTimeout(() => {
          writingRef.current = false;
        }, 400);
      }
    }
  }, []);

  const update = useCallback(
    (updater: FamilyData | ((prev: FamilyData) => FamilyData)) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        // Keep profile override if set; otherwise stay on auth-linked member.
        const auth = getFirebaseAuth();
        const override = sessionStorage.getItem(PROFILE_OVERRIDE_KEY);
        if (override && next.members.some((m) => m.id === override)) {
          if (next.settings.currentUserId !== override) {
            next.settings = { ...next.settings, currentUserId: override };
          }
        } else if (auth?.currentUser) {
          const linked = next.members.find((m) => m.uid === auth.currentUser!.uid)
            || prev.members.find((m) => m.uid === auth.currentUser!.uid);
          if (linked && next.settings.currentUserId !== linked.id) {
            next.settings = { ...next.settings, currentUserId: linked.id };
          }
        }
        if (next.settings?.currentUserId) {
          localStorage.setItem(CURRENT_USER_KEY, next.settings.currentUserId);
        }
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    const root = document.documentElement;
    const uid = data.settings.currentUserId;
    const personal = data.appearance?.[uid]?.theme;
    const t = personal || data.settings.theme || 'dark';
    root.classList.toggle('dark', t === 'dark');
    root.classList.toggle('light', t === 'light');
    root.classList.toggle('neon', t === 'neon');
  }, [data.settings.theme, data.settings.currentUserId, data.appearance]);

  const currentUserRaw = data.members.find((m) => m.id === data.settings.currentUserId);
  const currentUser = currentUserRaw
    ? {
        ...currentUserRaw,
        emoji: data.appearance?.[currentUserRaw.id]?.emoji ?? currentUserRaw.emoji,
        color: data.appearance?.[currentUserRaw.id]?.color ?? currentUserRaw.color,
      }
    : undefined;
  const getMember = useCallback(
    (id: string) => {
      const m = data.members.find((x) => x.id === id);
      if (!m) return undefined;
      const a = data.appearance?.[id];
      if (!a) return m;
      return { ...m, emoji: a.emoji ?? m.emoji, color: a.color ?? m.color };
    },
    [data.members, data.appearance],
  );
  const isParent = currentUser?.role === 'parent';
  const isMediaOnly = currentUser?.role === 'media';
  const kidPinRequired = !!(currentUser && currentUser.role === 'kid' && currentUser.pin && currentUser.pin.length >= 4);

  const unlockParentPin = useCallback(
    (pin: string) => {
      const expected = data.settings.parentPin || '';
      if (!expected) {
        setParentPinUnlocked(true);
        sessionStorage.setItem(PARENT_PIN_SESSION_KEY, '1');
        return true;
      }
      if (pin === expected) {
        setParentPinUnlocked(true);
        sessionStorage.setItem(PARENT_PIN_SESSION_KEY, '1');
        return true;
      }
      return false;
    },
    [data.settings.parentPin],
  );

  const lockParentPin = useCallback(() => {
    setParentPinUnlocked(false);
    sessionStorage.removeItem(PARENT_PIN_SESSION_KEY);
  }, []);

  const unlockKidPin = useCallback(
    (pin: string) => {
      if (!currentUser?.pin) {
        setKidPinUnlocked(true);
        sessionStorage.setItem(KID_PIN_SESSION_KEY, '1');
        return true;
      }
      if (pin === currentUser.pin) {
        setKidPinUnlocked(true);
        sessionStorage.setItem(KID_PIN_SESSION_KEY, '1');
        return true;
      }
      return false;
    },
    [currentUser?.pin],
  );

  const sendMessage = useCallback(
    async (toMemberId: string, text: string) => {
      const auth = getFirebaseAuth();
      const fid = localStorage.getItem(FAMILY_ID_KEY);
      const me = dataRef.current.members.find((m) => m.id === dataRef.current.settings.currentUserId);
      const to = dataRef.current.members.find((m) => m.id === toMemberId);
      if (!text.trim() || !me || !to) return;
      const trimmed = text.trim();
      if (fid && getDb() && auth?.currentUser) {
        const msg = await cloudSendMessage(fid, {
          fromId: me.id,
          toId: to.id,
          fromUid: auth.currentUser.uid,
          toUid: to.uid || '',
          text: trimmed,
          timestamp: new Date().toISOString(),
          read: false,
        });
        setData((prev) => {
          if (prev.messages.some((m) => m.id === msg.id)) return prev;
          const next = [...prev.messages, msg];
          const { kept, toDelete } = partitionMessagesForPrune(next, {
            myMemberId: me.id,
            myUid: auth.currentUser!.uid,
            canDeleteAny: me.role === 'parent',
          });
          if (toDelete.length) {
            void Promise.all(
              toDelete.map((m) => cloudDeleteMessage(fid, m.id).catch(() => {})),
            );
          }
          return { ...prev, messages: kept };
        });
      } else {
        const local: Message = {
          id: `local_${Date.now()}`,
          fromId: me.id,
          toId: to.id,
          text: trimmed,
          timestamp: new Date().toISOString(),
          read: false,
        };
        update((d) => {
          const next = [...d.messages, local];
          const { kept } = partitionMessagesForPrune(next, {
            myMemberId: me.id,
            canDeleteAny: me.role === 'parent',
          });
          return { ...d, messages: kept };
        });
      }
    },
    [update],
  );

  const markThreadRead = useCallback(async (fromMemberId: string) => {
    const me = dataRef.current.members.find((m) => m.id === dataRef.current.settings.currentUserId);
    if (!me) return;
    const unread = dataRef.current.messages.filter(
      (m) => m.toId === me.id && m.fromId === fromMemberId && !m.read,
    );
    if (!unread.length) return;
    const fid = localStorage.getItem(FAMILY_ID_KEY);
    if (fid && getDb()) {
      await Promise.all(unread.map((m) => cloudMarkMessageRead(fid, m.id).catch(() => {})));
      setData((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.toId === me.id && m.fromId === fromMemberId && !m.read ? { ...m, read: true } : m,
        ),
      }));
    } else {
      update((d) => ({
        ...d,
        messages: d.messages.map((m) =>
          m.toId === me.id && m.fromId === fromMemberId && !m.read ? { ...m, read: true } : m,
        ),
      }));
    }
  }, [update]);

  const connectCloud = useCallback(
    async (cfg: FirebaseConfig) => {
      saveCloudConfig(cfg);
      const ok = await initFirebase(cfg);
      if (!ok) {
        setCloudError('Invalid Firebase config');
        setSyncStatus('error');
        setCloudReady(false);
        return false;
      }
      setCloudReady(true);
      setCloudError(null);
      setSyncStatus(getFirebaseAuth()?.currentUser ? (familyId ? 'live' : 'auth') : 'auth');
      // Attach auth listener if not already (first connect from Settings)
      if (!unsubAuthRef.current) {
        unsubAuthRef.current = onAuthStateChanged((user) => {
          setAuthUser(user);
          if (!user) {
            setSyncStatus('auth');
            setNeedsFamilySetup(false);
          }
        });
      }
      return true;
    },
    [familyId],
  );

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!getFirebaseAuth()) throw new Error('Cloud not connected');
    const cred = await createUserWithEmailAndPassword(email.trim(), password);
    if (displayName) await updateProfile(cred.user, { displayName: displayName.trim() });
    return cred.user;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!getFirebaseAuth()) throw new Error('Cloud not connected');
    const cred = await signInWithEmailAndPassword(email.trim(), password);
    return cred.user;
  }, []);

  const signOutUser = useCallback(async () => {
    sessionStorage.removeItem(PROFILE_OVERRIDE_KEY);
    sessionStorage.removeItem(KID_PIN_SESSION_KEY);
    setKidPinUnlocked(false);
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    if (unsubMsgRef.current) {
      unsubMsgRef.current();
      unsubMsgRef.current = null;
    }
    localStorage.removeItem(FAMILY_ID_KEY);
    sessionStorage.removeItem(PARENT_PIN_SESSION_KEY);
    sessionStorage.removeItem(KID_PIN_SESSION_KEY);
    setParentPinUnlocked(false);
    setKidPinUnlocked(false);
    setFamilyId('');
    setNeedsFamilySetup(false);
    if (getFirebaseAuth()) await fbSignOut();
    setAuthUser(null);
    setSyncStatus(loadCloudConfig() ? 'auth' : 'local');
  }, []);

  const createFamily = useCallback(async (_displayName: string) => {
    // Disabled: single-family app. New users must join via invite only.
    throw new Error('Creating a new family is disabled. Ask a parent for an invite code.');
  }, []);

  const joinFamily = useCallback(
    async (inviteCode: string, displayName: string) => {
      const auth = getFirebaseAuth();
      if (!getDb() || !auth?.currentUser) throw new Error('You must be signed in');
      setSyncStatus('connecting');
      const { familyId: fid, memberId, data: remote } = await cloudJoinWithInvite(
        inviteCode,
        auth.currentUser,
        displayName,
      );
      setData({
        ...remote,
        settings: { ...remote.settings, currentUserId: memberId },
      });
      saveLocalData({
        ...remote,
        settings: { ...remote.settings, currentUserId: memberId },
      });
      startFamilyListener(fid, memberId);
      return fid;
    },
    [startFamilyListener],
  );

  const createInvite = useCallback(async ({ role, label }: { role: Role; label: string }) => {
    const auth = getFirebaseAuth();
    if (!getDb() || !auth?.currentUser) throw new Error('You must be signed in');
    const fid = localStorage.getItem(FAMILY_ID_KEY);
    if (!fid) throw new Error('No family linked');
    return cloudCreateInvite(fid, auth.currentUser, { role, label });
  }, []);

  const listInvites = useCallback(async () => {
    const fid = localStorage.getItem(FAMILY_ID_KEY);
    if (!fid || !getDb()) return [];
    return cloudListInvites(fid);
  }, []);

  const revokeInvite = useCallback(async (code: string) => {
    if (!getDb()) throw new Error('Cloud not connected');
    await cloudRevokeInvite(code);
  }, []);

  const leaveFamily = useCallback(async () => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = null;
    if (unsubMsgRef.current) {
      unsubMsgRef.current();
      unsubMsgRef.current = null;
    }
    localStorage.removeItem(FAMILY_ID_KEY);
    setFamilyId('');
    const auth = getFirebaseAuth();
    if (auth?.currentUser) {
      try {
        await clearUserFamily(auth.currentUser.uid);
      } catch {
        /* ignore */
      }
    }
    setNeedsFamilySetup(!!auth?.currentUser);
    setSyncStatus(auth?.currentUser ? 'auth' : 'local');
  }, []);

  const disconnectCloud = useCallback(async () => {
    await leaveFamily();
    const auth = getFirebaseAuth();
    if (auth) try { await fbSignOut(); } catch { /* ignore */ }
    saveCloudConfig(null);
    resetFirebase();
    setAuthUser(null);
    setCloudReady(false);
    setSyncStatus('local');
    setNeedsFamilySetup(false);
  }, [leaveFamily]);


  const switchProfile = useCallback(
    (memberId: string, pin?: string): { ok: boolean; error?: string } => {
      const target = dataRef.current.members.find((m) => m.id === memberId);
      if (!target) return { ok: false, error: 'Member not found' };
      if (target.id === dataRef.current.settings.currentUserId) {
        return { ok: true };
      }
      const hasPin = !!(target.pin && target.pin.length >= 4);
      if (hasPin) {
        if (!pin || pin !== target.pin) return { ok: false, error: 'Wrong PIN' };
      } else if (target.role === 'parent' && dataRef.current.settings.parentPin) {
        // Protect parent profiles with the family parent PIN when no personal PIN
        if (!pin || pin !== dataRef.current.settings.parentPin) {
          return { ok: false, error: 'Parent PIN required' };
        }
      }
      sessionStorage.setItem(PROFILE_OVERRIDE_KEY, memberId);
      localStorage.setItem(CURRENT_USER_KEY, memberId);
      // Fresh PIN session for the new profile
      if (hasPin || target.role === 'kid') {
        setKidPinUnlocked(true);
        sessionStorage.setItem(KID_PIN_SESSION_KEY, '1');
      }
      setData((prev) => {
        const next = {
          ...prev,
          settings: { ...prev.settings, currentUserId: memberId },
        };
        void persist(next);
        return next;
      });
      return { ok: true };
    },
    [persist],
  );

  const setMyTheme = useCallback(
    (theme: 'dark' | 'light' | 'neon') => {
      update((d) => {
        const id = d.settings.currentUserId;
        if (!id) return d;
        const prev = d.appearance?.[id] || {};
        return {
          ...d,
          appearance: {
            ...(d.appearance || {}),
            [id]: { ...prev, theme },
          },
        };
      });
    },
    [update],
  );

  const value: AppContextValue = {
    data,
    update,
    view,
    setView,
    currentUser,
    getMember,
    isParent,
    isMediaOnly,
    cloudReady,
    cloudError,
    familyId,
    syncStatus,
    authUser,
    authReady,
    needsFamilySetup,
    parentPinUnlocked: parentPinUnlocked || !data.settings.parentPin,
    unlockParentPin,
    lockParentPin,
    kidPinRequired,
    kidPinUnlocked: kidPinUnlocked || !kidPinRequired,
    unlockKidPin,
    switchProfile,
    setMyTheme,
    connectCloud,
    createFamily,
    joinFamily,
    leaveFamily,
    disconnectCloud,
    createInvite,
    listInvites,
    revokeInvite,
    sendMessage,
    markThreadRead,
    signUp,
    signIn,
    signOut: signOutUser,
    loadCloudConfig,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
