export type Role = 'parent' | 'kid' | 'media';
export type Priority = 'low' | 'medium' | 'high';
export type ViewId = 'dashboard' | 'calendar' | 'todos' | 'chores' | 'shopping' | 'notes' | 'messages' | 'media' | 'settings';
export type SyncStatus = 'local' | 'connecting' | 'live' | 'error' | 'auth';
export type ChoreCadence = 'daily' | 'weekly' | 'once'; // legacy
export type ChoreStatus = 'open' | 'pending' | 'done';
export type QuestDifficulty = 'easy' | 'medium' | 'epic';
export type QuestStatus = 'open' | 'pending' | 'done';
export type CoinReason =
  | 'quest'
  | 'streak_chest'
  | 'interest'
  | 'house_inspection'
  | 'redeem'
  | 'adjust';
export type RewardKind =
  | 'screen_time'
  | 'treat'
  | 'choice'
  | 'late_bed'
  | 'allowance'
  | 'custom';
export type RedemptionStatus = 'pending' | 'fulfilled' | 'cancelled';
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
 * ChoreQuest quest (replaces legacy Chore).
 * Parent posts → kid marks finished → parent approves → XP + coins.
 * Field name in FamilyData remains `chores` for back-compat with Dashboard digests.
 */
export interface Quest {
  id: string;
  title: string;
  difficulty: QuestDifficulty;
  /** XP awarded on approval (from difficulty table, overridable). */
  xp: number;
  /** Coins (Treasure) awarded on approval. */
  coins: number;
  /**
   * Legacy screen-time minutes. Still applied on approval so old expectations work;
   * new flow prefers coins → shop → screen-time redeem.
   */
  rewardMinutes: number;
  status: QuestStatus;
  submittedById?: string;
  submittedAt?: string;
  approvedForId?: string;
  approvedById?: string;
  approvedAt?: string;
  createdById: string;
  createdAt: string;
  /** Optional link back to catalog template this was posted from. */
  templateId?: string;
  /** @deprecated rotation model */
  rotation?: string[];
  turnIndex?: number;
  cadence?: ChoreCadence;
  lastCompletedAt?: string;
  lastCompletedById?: string;
}

/**
 * Reusable quest template (master chore list).
 * Not on the live board until a parent posts it as a Quest.
 * Soft-hide with active:false instead of deleting.
 */
export interface QuestTemplate {
  id: string;
  title: string;
  difficulty: QuestDifficulty;
  /** Optional XP override; omit to use difficulty defaults at post time. */
  xp?: number;
  /** Optional coins override; omit to use difficulty defaults at post time. */
  coins?: number;
  /** Soft-hide without deleting (like shop items). */
  active: boolean;
  sort: number;
  createdAt: string;
  updatedAt?: string;
}

/** @deprecated Use Quest */
export type Chore = Quest;

/** Per-kid XP / level (not spendable). */
export interface MemberProgress {
  xp: number;
  level: number;
}

/** Coin (Treasure) ledger — source of truth for balances. */
export interface CoinLedgerEntry {
  id: string;
  memberId: string;
  delta: number;
  reason: CoinReason;
  label: string;
  refId?: string;
  byId: string;
  at: string;
  weekId: string;
}

/** Shop catalog item (Phase 2). Stubs present so types compile. */
export interface RewardItem {
  id: string;
  label: string;
  icon: string;
  kind: RewardKind;
  coinCost: number;
  screenMinutes?: number;
  featured?: boolean;
  active: boolean;
  sort: number;
}

export interface RedemptionRecord {
  id: string;
  memberId: string;
  rewardItemId: string;
  label: string;
  kind: RewardKind;
  coinCost: number;
  screenMinutes?: number;
  status: RedemptionStatus;
  requestedAt: string;
  fulfilledAt?: string;
  fulfilledById?: string;
}

/** Current ISO-week state (Phase 3). Stub shape for forward compat. */
export interface WeekState {
  weekId: string;
  weekdayCompletions: Record<string, number>;
  streakClaimed?: Record<string, boolean>;
  houseInspectionPassed?: boolean;
  houseInspectionAt?: string;
  houseInspectionById?: string;
  interestPaid?: Record<string, boolean>;
  inspectionPaid?: Record<string, boolean>;
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


/** Parent-tunable ChoreQuest economy (Phase 5). */
export interface ChoreQuestConfig {
  streakTarget: number;
  streakCoins: number;
  streakXp: number;
  /** Fraction, e.g. 0.1 = 10%. */
  interestRate: number;
  interestMinBalance: number;
  inspectionCoins: number;
  inspectionXp: number;
  easyXp?: number;
  easyCoins?: number;
  mediumXp?: number;
  mediumCoins?: number;
  epicXp?: number;
  epicCoins?: number;
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
  /** Quest board (legacy field name `chores`). */
  chores: Quest[];
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
  /** memberId → XP / level. */
  memberProgress?: Record<string, MemberProgress>;
  /** memberId → coin balance (cache; ledger is source of truth). */
  coinBalances?: Record<string, number>;
  /** Coin ledger, newest first (trim client-side). */
  coinLedger?: CoinLedgerEntry[];
  /** Reward shop catalog (Phase 2). */
  rewardCatalog?: RewardItem[];
  /** Reusable quest templates (master chore list). Not live until posted. */
  questCatalog?: QuestTemplate[];
  /** Redemptions (Phase 2). */
  redemptions?: RedemptionRecord[];
  /** Current week cycle state (Phase 3). */
  weekState?: WeekState;
  /** Parent-tunable quest economy (Phase 5). */
  choreQuest?: ChoreQuestConfig;
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
