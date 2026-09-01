export type Role = 'parent' | 'kid' | 'media';
export type Priority = 'low' | 'medium' | 'high';
export type ViewId = 'dashboard' | 'calendar' | 'todos' | 'chores' | 'shopping' | 'notes' | 'messages' | 'media' | 'settings';
export type SyncStatus = 'local' | 'connecting' | 'live' | 'error' | 'auth';
export type ChoreCadence = 'daily' | 'weekly' | 'once'; // legacy
export type ChoreStatus = 'open' | 'pending' | 'done';
/** Simple presence — no GPS. */
export type PresenceStatus = 'home' | 'school' | 'work' | 'out' | 'away';
export type ThemeId = 'dark' | 'light' | 'neon';

/** Shared family-wide todo list (not assigned to one person). */
export const FAMILY_LIST_ID = '__family__';

export const PRESENCE_OPTIONS: { id: PresenceStatus; label: string; emoji: string }[] = [
  { id: 'home', label: 'Home', emoji: '🏠' },
  { id: 'school', label: 'School', emoji: '🎒' },
  { id: 'work', label: 'Work', emoji: '💼' },
  { id: 'out', label: 'Out', emoji: '🚗' },
  { id: 'away', label: 'Away', emoji: '✈️' },
];

export interface Member {
  id: string;
  uid?: string;
  name: string;
  color: string;
  emoji?: string;
  initials: string;
  role: Role;
  /** Optional 4–6 digit unlock PIN for this profile (client-gated). */
  pin?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO datetime (UTC). For all-day events, use local noon on the start date. */
  start: string;
  /** ISO datetime (UTC). Exclusive end for all-day (local midnight of day after last day). */
  end: string;
  allDay: boolean;
  /** Primary / legacy single assignee (first of memberIds after migration). */
  memberId: string;
  /** All assigned members (kids doing an activity together, etc.). Prefer this over memberId. */
  memberIds?: string[];
  /** none | daily | weekly | monthly — expanded on read, not stored as instances. */
  recurrence?: string;
  /** Optional ISO end date for repeating series (inclusive day). */
  recurrenceUntil?: string;
  /** Local YYYY-MM-DD dates to skip when expanding a recurring series. */
  exceptionDates?: string[];
  location?: string;
  notes?: string;
}

/** Virtual instance produced by expanding a recurring master event. */
export interface ExpandedEvent extends CalendarEvent {
  /** Master event id (same as id for non-recurring). */
  masterId: string;
  /** Instance start (ISO). */
  instanceStart: string;
  /** Instance end (ISO). */
  instanceEnd: string;
}

export interface Todo {
  id: string;
  text: string;
  /** Member id, or FAMILY_LIST_ID for shared family tasks. */
  memberId: string;
  createdById: string;
  completed: boolean;
  priority: Priority;
  createdAt: string;
  /** Optional due datetime (ISO). Used for “due soon” notifications. */
  dueAt?: string;
}

/**
 * Parent-created chore board item.
 * Kids pick a job → mark finished → parent approves screen-time minutes.
 */
export interface Chore {
  id: string;
  title: string;
  /** Screen-time minutes awarded when a parent approves. */
  rewardMinutes: number;
  status: ChoreStatus;
  /** Kid who tapped “I finished this”. */
  submittedById?: string;
  submittedAt?: string;
  /** Member who received the minutes on approval. */
  approvedForId?: string;
  approvedById?: string;
  approvedAt?: string;
  createdById: string;
  createdAt: string;
  /** @deprecated rotation model — migrated to open jobs */
  rotation?: string[];
  turnIndex?: number;
  cadence?: ChoreCadence;
  lastCompletedAt?: string;
  lastCompletedById?: string;
}

/** Ledger entry for screen-time earn/spend. */
export interface ScreenTimeLogEntry {
  id: string;
  memberId: string;
  /** Positive = earned, negative = spent. */
  delta: number;
  reason: string;
  byId: string;
  at: string;
}

/** Shared shopping / errands list item. */
export interface ShoppingItem {
  id: string;
  text: string;
  store?: string;
  claimedById?: string | null;
  bought: boolean;
  createdById: string;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  fromId: string;
  toId: string;
  /** Auth uids — used by Firestore rules for private message access. */
  fromUid?: string;
  toUid?: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface Settings {
  familyName: string;
  embyUrl: string;
  komgaUrl: string;
  /** Family default theme (used when member has no personal theme). */
  theme: ThemeId;
  currentUserId: string;
  embedMedia: boolean;
  pinnedAnnouncement: string;
  /** Parent PIN required for sensitive settings actions (invites, roles, leave). */
  parentPin?: string;
  /** User opted in to browser notifications on this device. */
  notificationsEnabled?: boolean;
}

export interface PresenceEntry {
  status: PresenceStatus;
  updatedAt: string;
}

export interface FamilyData {
  members: Member[];
  events: CalendarEvent[];
  todos: Todo[];
  chores: Chore[];
  shopping: ShoppingItem[];
  notes: Note[];
  messages: Message[];
  settings: Settings;
  /** memberId → presence (writable by all members; not on the members array). */
  presence?: Record<string, PresenceEntry>;
  /** memberId → emoji/color/theme/homescreen overrides (self-serve). */
  appearance?: Record<
    string,
    {
      emoji?: string;
      color?: string;
      theme?: ThemeId;
      /** Ordered list of dashboard widget ids for this member only. */
      homescreenOrder?: string[];
    }
  >;
  /** memberId → earned screen-time minutes balance. */
  screenTime?: Record<string, number>;
  /** Recent earn/spend history (newest first, trimmed client-side). */
  screenTimeLog?: ScreenTimeLogEntry[];
  memberUids?: string[];
  /** Auth uids of members with role === 'parent'. Enforced by security rules. */
  parentUids?: string[];
  adminUid?: string;
  createdAt?: string;
  updatedAt?: string;
  lastInviteCode?: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface Invite {
  code: string;
  familyId: string;
  role: Role;
  label: string;
  createdAt: string;
  createdBy: string;
  used: boolean;
  usedBy?: string | null;
  usedAt?: string;
}
