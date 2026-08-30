/**
 * Firebase is loaded on demand so local-only users never download Auth/Firestore.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { FamilyData, FirebaseConfig, Invite, Member, Message, Role } from '../types';
import { MEMBER_COLORS, MEMBER_EMOJIS, migratePayload } from './defaults';
import { makeFamilyCode, makeInviteCode, uid } from './uid';
import { CURRENT_USER_KEY, FAMILY_ID_KEY } from './storage';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let loading: Promise<void> | null = null;

type AppMod = typeof import('firebase/app');
type AuthMod = typeof import('firebase/auth');
type FsMod = typeof import('firebase/firestore');

let appMod: AppMod | null = null;
let authMod: AuthMod | null = null;
let fsMod: FsMod | null = null;

async function loadModules(): Promise<{ appMod: AppMod; authMod: AuthMod; fsMod: FsMod }> {
  if (appMod && authMod && fsMod) return { appMod, authMod, fsMod };
  if (!loading) {
    loading = (async () => {
      const [a, au, f] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      appMod = a;
      authMod = au;
      fsMod = f;
    })();
  }
  await loading;
  return { appMod: appMod!, authMod: authMod!, fsMod: fsMod! };
}

export function getFirebaseAuth(): Auth | null {
  return auth;
}

export function getDb(): Firestore | null {
  return db;
}

export async function initFirebase(cfg: FirebaseConfig): Promise<boolean> {
  if (!cfg?.apiKey || !cfg?.projectId) return false;
  try {
    const { appMod: a, authMod: au, fsMod: f } = await loadModules();
    if (app) {
      auth = au.getAuth(app);
      db = f.getFirestore(app);
      return true;
    }
    if (a.getApps().length) {
      app = a.getApps()[0]!;
    } else {
      app = a.initializeApp(cfg);
    }
    auth = au.getAuth(app);
    db = f.getFirestore(app);
    return true;
  } catch (e) {
    console.error('Firebase init failed', e);
    app = null;
    auth = null;
    db = null;
    return false;
  }
}

export function resetFirebase(): void {
  app = null;
  auth = null;
  db = null;
}

function familyRef(familyId: string) {
  return fsMod!.doc(db!, 'families', familyId);
}

function userRef(userId: string) {
  return fsMod!.doc(db!, 'users', userId);
}

function inviteRef(code: string) {
  return fsMod!.doc(db!, 'invites', code);
}

export function makeMemberFromAuth(user: User, name: string, role: Role): Member {
  const display = (name || user.displayName || user.email?.split('@')[0] || 'Member').trim();
  const color = MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)]!;
  const emoji = MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)]!;
  return {
    id: uid(),
    uid: user.uid,
    name: display,
    color,
    emoji,
    initials: display.charAt(0).toUpperCase(),
    role: role || 'kid',
  };
}

export async function cloudCreateFamily(
  seedData: FamilyData,
  authUser: User,
  displayName: string,
): Promise<{ familyId: string; memberId: string; payload: FamilyData }> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  const id = makeFamilyCode();
  const adminMember = makeMemberFromAuth(authUser, displayName, 'parent');
  // Never seed calendar/todos/notes/messages from local or another family —
  // that was leaking data into newly created families.
  void seedData;
  const payload: FamilyData = {
    members: [adminMember],
    events: [],
    todos: [],
    chores: [],
    shopping: [],
    notes: [],
    messages: [],
    settings: {
      familyName: 'The Family',
      embyUrl: '',
      komgaUrl: '',
      theme: 'dark',
      currentUserId: adminMember.id,
      embedMedia: false,
      pinnedAnnouncement: '',
    },
    memberUids: [authUser.uid],
    parentUids: [authUser.uid],
    adminUid: authUser.uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const { currentUserId: _, ...settingsWithoutUser } = payload.settings;
  await fsMod.setDoc(familyRef(id), {
    ...payload,
    messages: [],
    settings: settingsWithoutUser,
  });
  await fsMod.setDoc(
    userRef(authUser.uid),
    {
      familyId: id,
      memberId: adminMember.id,
      displayName: adminMember.name,
      email: authUser.email || '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  localStorage.setItem(FAMILY_ID_KEY, id);
  localStorage.setItem(CURRENT_USER_KEY, adminMember.id);
  return { familyId: id, memberId: adminMember.id, payload };
}

export async function cloudCreateInvite(
  familyId: string,
  authUser: User,
  opts: { role: Role; label: string },
): Promise<Invite> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  const code = makeInviteCode();
  const payload = {
    familyId,
    role: (opts.role === 'parent' || opts.role === 'media' ? opts.role : 'kid') as Role,
    label: (opts.label || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: authUser.uid,
    used: false,
    usedBy: null as string | null,
  };
  await fsMod.setDoc(inviteRef(code), payload);
  return { code, ...payload };
}

export async function cloudListInvites(familyId: string): Promise<Invite[]> {
  if (!db || !fsMod) return [];
  const q = fsMod.query(fsMod.collection(db, 'invites'), fsMod.where('familyId', '==', familyId));
  const snap = await fsMod.getDocs(q);
  return snap.docs.map((d) => ({ code: d.id, ...(d.data() as Omit<Invite, 'code'>) }));
}

export async function cloudRevokeInvite(code: string): Promise<void> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  await fsMod.deleteDoc(inviteRef(code));
}

/**
 * Join without requiring a prior family read (members-only read rules).
 * Uses arrayUnion so the client does not need the current document.
 */
export async function cloudJoinWithInvite(
  inviteCode: string,
  authUser: User,
  displayName: string,
): Promise<{ familyId: string; memberId: string; data: FamilyData }> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  const clean = (inviteCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 6) throw new Error('Enter a valid invite code');

  const invSnap = await fsMod.getDoc(inviteRef(clean));
  if (!invSnap.exists()) throw new Error('Invite not found. Ask the admin for a new invite.');
  const inv = invSnap.data() as Omit<Invite, 'code'>;
  if (inv.used) throw new Error('This invite has already been used.');
  const familyId = inv.familyId;
  if (!familyId) throw new Error('Invalid invite');

  // Already a member? (user doc may still point here)
  const userSnap = await fsMod.getDoc(userRef(authUser.uid));
  if (userSnap.exists() && userSnap.data().familyId === familyId) {
    const memberId = (userSnap.data().memberId as string) || '';
    localStorage.setItem(FAMILY_ID_KEY, familyId);
    if (memberId) localStorage.setItem(CURRENT_USER_KEY, memberId);
    const famSnap = await fsMod.getDoc(familyRef(familyId));
    if (famSnap.exists()) {
      return { familyId, data: migratePayload(famSnap.data() as FamilyData), memberId };
    }
  }

  const role: Role = inv.role === 'parent' || inv.role === 'media' ? inv.role : 'kid';
  const newMember = makeMemberFromAuth(authUser, inv.label || displayName, role);

  const batch = fsMod.writeBatch(db);
  // arrayUnion allows join without reading the family doc first
  const familyUpdate: Record<string, unknown> = {
    memberUids: fsMod.arrayUnion(authUser.uid),
    members: fsMod.arrayUnion(newMember),
    updatedAt: new Date().toISOString(),
    lastInviteCode: clean, // lets the security rule verify this exact invite server-side
  };
  if (role === 'parent') {
    familyUpdate.parentUids = fsMod.arrayUnion(authUser.uid);
  }
  batch.update(familyRef(familyId), familyUpdate);
  batch.update(inviteRef(clean), {
    used: true,
    usedBy: authUser.uid,
    usedAt: new Date().toISOString(),
  });
  batch.set(
    userRef(authUser.uid),
    {
      familyId,
      memberId: newMember.id,
      displayName: newMember.name,
      email: authUser.email || '',
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  await batch.commit();

  // Now a member — read is allowed
  const famSnap = await fsMod.getDoc(familyRef(familyId));
  if (!famSnap.exists()) throw new Error('Family no longer exists.');
  const data = migratePayload(famSnap.data() as FamilyData);

  localStorage.setItem(FAMILY_ID_KEY, familyId);
  localStorage.setItem(CURRENT_USER_KEY, newMember.id);
  return { familyId, memberId: newMember.id, data };
}

<<<<<<< HEAD
/** Firestore rejects `undefined` anywhere in the document tree. */
function stripUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out as T;
}

=======
>>>>>>> 78dbda71cfcdf1ae5ca5fd69f5e1f4fb892f06d0
export async function cloudWrite(familyId: string, data: FamilyData): Promise<void> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  const memberUids = (data.members || []).map((m) => m.uid).filter(Boolean) as string[];
  const parentUids = (data.members || [])
    .filter((m) => m.role === 'parent' && m.uid)
    .map((m) => m.uid!) as string[];
  const { currentUserId: _, ...settingsRest } = data.settings;
  // Messages live in families/{id}/messages — do not write the legacy array.
<<<<<<< HEAD
  const payload = stripUndefined({
=======
  const payload: Record<string, unknown> = {
>>>>>>> 78dbda71cfcdf1ae5ca5fd69f5e1f4fb892f06d0
    members: data.members,
    events: data.events,
    todos: data.todos,
    chores: data.chores || [],
    shopping: data.shopping || [],
    presence: data.presence || {},
    appearance: data.appearance || {},
    screenTime: data.screenTime || {},
    screenTimeLog: (data.screenTimeLog || []).slice(0, 80),
    notes: data.notes,
    settings: settingsRest,
    updatedAt: new Date().toISOString(),
    memberUids,
    parentUids,
<<<<<<< HEAD
  });
=======
  };
>>>>>>> 78dbda71cfcdf1ae5ca5fd69f5e1f4fb892f06d0
  await fsMod.setDoc(familyRef(familyId), payload, { merge: true });
}

function messagesCol(familyId: string) {
  return fsMod!.collection(db!, 'families', familyId, 'messages');
}

export async function cloudSendMessage(
  familyId: string,
  msg: Omit<Message, 'id'> & { id?: string },
): Promise<Message> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  const id = msg.id || uid();
  const payload = {
    fromId: msg.fromId,
    toId: msg.toId,
    fromUid: msg.fromUid || '',
    toUid: msg.toUid || '',
    text: msg.text,
    timestamp: msg.timestamp || new Date().toISOString(),
    read: false,
  };
  await fsMod.setDoc(fsMod.doc(messagesCol(familyId), id), payload);
  return { id, ...payload };
}

export async function cloudMarkMessageRead(familyId: string, messageId: string): Promise<void> {
  if (!db || !fsMod) throw new Error('Cloud not connected');
  await fsMod.updateDoc(fsMod.doc(messagesCol(familyId), messageId), { read: true });
}

export function subscribeMessages(
  familyId: string,
  myUid: string,
  onData: (messages: Message[]) => void,
  onError: (err: Error) => void,
): () => void {
  if (!db || !fsMod) {
    onError(new Error('Cloud not connected'));
    return () => {};
  }
  // Two queries (from me / to me) — rules require participant match.
  const col = messagesCol(familyId);
  const qFrom = fsMod.query(col, fsMod.where('fromUid', '==', myUid));
  const qTo = fsMod.query(col, fsMod.where('toUid', '==', myUid));
  let fromMsgs: Message[] = [];
  let toMsgs: Message[] = [];
  const emit = () => {
    const map = new Map<string, Message>();
    for (const m of [...fromMsgs, ...toMsgs]) map.set(m.id, m);
    onData(Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
  };
  const unsub1 = fsMod.onSnapshot(
    qFrom,
    (snap) => {
      fromMsgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, 'id'>) }));
      emit();
    },
    (err) => onError(err),
  );
  const unsub2 = fsMod.onSnapshot(
    qTo,
    (snap) => {
      toMsgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, 'id'>) }));
      emit();
    },
    (err) => onError(err),
  );
  return () => {
    unsub1();
    unsub2();
  };
}

export function subscribeFamily(
  familyId: string,
  onData: (data: FamilyData) => void,
  onError: (err: Error) => void,
): () => void {
  if (!db || !fsMod) {
    onError(new Error('Cloud not connected'));
    return () => {};
  }
  return fsMod.onSnapshot(
    familyRef(familyId),
    (snap) => {
      if (!snap.exists()) {
        onError(new Error('Family document missing.'));
        return;
      }
      onData(migratePayload(snap.data() as FamilyData));
    },
    (err) => onError(err),
  );
}

export async function fetchUserFamily(uid: string): Promise<{ familyId?: string; memberId?: string } | null> {
  if (!db || !fsMod) return null;
  const snap = await fsMod.getDoc(userRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as { familyId?: string; memberId?: string };
}

export async function clearUserFamily(uid: string): Promise<void> {
  if (!db || !fsMod) return;
  await fsMod.setDoc(userRef(uid), { familyId: null, memberId: null }, { merge: true });
}

export async function createUserWithEmailAndPassword(email: string, password: string) {
  const { authMod: au } = await loadModules();
  if (!auth) throw new Error('Cloud not connected');
  return au.createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithEmailAndPassword(email: string, password: string) {
  const { authMod: au } = await loadModules();
  if (!auth) throw new Error('Cloud not connected');
  return au.signInWithEmailAndPassword(auth, email, password);
}

export async function fbSignOut() {
  const { authMod: au } = await loadModules();
  if (!auth) return;
  return au.signOut(auth);
}

export async function updateProfile(user: User, profile: { displayName?: string }) {
  const { authMod: au } = await loadModules();
  return au.updateProfile(user, profile);
}

export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  if (!auth || !authMod) {
    callback(null);
    return () => {};
  }
  return authMod.onAuthStateChanged(auth, callback);
}

export type { User };
