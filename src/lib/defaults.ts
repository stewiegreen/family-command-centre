import type { FamilyData, Member, Settings } from '../types';

export const DEFAULT_MEMBERS: Member[] = [
  { id: '1', name: 'Alex', color: '#6366f1', emoji: '👨', initials: 'A', role: 'parent' },
  { id: '2', name: 'Sam', color: '#ec4899', emoji: '👩', initials: 'S', role: 'parent' },
  { id: '3', name: 'Jordan', color: '#10b981', emoji: '🧒', initials: 'J', role: 'kid' },
  { id: '4', name: 'Taylor', color: '#f59e0b', emoji: '👧', initials: 'T', role: 'kid' },
];

export const DEFAULT_SETTINGS: Settings = {
  familyName: 'The Family',
  embyUrl: 'http://emby.local:8096',
  komgaUrl: 'http://komga.local:25600',
  theme: 'dark',
  currentUserId: '1',
  embedMedia: false,
  pinnedAnnouncement: 'Welcome to your Family Command Centre! 🎉 Edit this in Settings.',
  parentPin: undefined,
  notificationsEnabled: false,
};

export const DEFAULT_DATA: FamilyData = {
  members: DEFAULT_MEMBERS,
  events: [],
  todos: [],
  chores: [],
  shopping: [],
  notes: [],
  messages: [],
  presence: {},
  appearance: {},
  screenTime: {},
  screenTimeLog: [],
  settings: DEFAULT_SETTINGS,
};

export const MEMBER_COLORS = [
  '#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e', '#84cc16',
  '#14b8a6', '#f97316', '#a855f7', '#3b82f6', '#e11d48', '#65a30d', '#0ea5e9', '#d946ef',
  // Extra options for kids
  '#22c55e', '#eab308', '#ef4444', '#0d9488', '#7c3aed', '#db2777', '#0891b2', '#4f46e5',
  '#b45309', '#15803d', '#be185d', '#1d4ed8', '#9333ea', '#c026d3', '#ea580c', '#059669',
];
export const MEMBER_EMOJIS = [
  '😀', '😎', '🤩', '🥳', '😇', '🤗', '🦊', '🐱', '🐶', '🐼', '🦄', '🐸', '🦁', '🐯',
  '🐻', '🐨', '🐰', '🐧', '🦉', '🐝', '🦋', '🌸', '⭐', '🔥', '🌈', '⚽', '🎮', '📚',
  '🎨', '🎵', '🚀', '🏠', '👨', '👩', '🧒', '👧', '🧑', '👦', '👵', '🦸', '🧙', '🧛',
];

export function migratePayload(p: Partial<FamilyData>): FamilyData {
  const members = ((p.members?.length ? p.members : DEFAULT_MEMBERS) as Member[]).map((m, i) => {
    const role = m.role === 'parent' || m.role === 'kid' || m.role === 'media'
      ? m.role
      : (i < 2 ? 'parent' as const : 'kid' as const);
    return { ...m, role };
  });
  const todos = (p.todos || []).map((t) => ({
    ...t,
    createdById: t.createdById || t.memberId,
  }));
  return {
    ...DEFAULT_DATA,
    ...p,
    settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) },
    members,
    todos,
    chores: (p.chores || []).map((c: {
      id: string;
      title: string;
      rewardMinutes?: number;
      status?: string;
      submittedById?: string;
      submittedAt?: string;
      approvedForId?: string;
      approvedById?: string;
      approvedAt?: string;
      createdById?: string;
      createdAt?: string;
      lastCompletedById?: string;
      lastCompletedAt?: string;
    }) => ({
      id: c.id,
      title: c.title,
      rewardMinutes: Math.max(0, c.rewardMinutes ?? 0),
      status: (c.status === 'pending' || c.status === 'done' || c.status === 'open'
        ? c.status
        : 'open') as 'open' | 'pending' | 'done',
      submittedById: c.submittedById,
      submittedAt: c.submittedAt,
      approvedForId: c.approvedForId || c.lastCompletedById,
      approvedById: c.approvedById,
      approvedAt: c.approvedAt || c.lastCompletedAt,
      createdById: c.createdById || '',
      createdAt: c.createdAt || new Date().toISOString(),
    })),
    shopping: p.shopping || [],
    events: (p.events || []).map((e: {
      id: string;
      title: string;
      start: string;
      end?: string;
      allDay: boolean;
      memberId: string;
      recurrence?: string;
      recurrenceUntil?: string;
      exceptionDates?: string[];
      location?: string;
      notes?: string;
    }) => {
      const start = e.start || new Date().toISOString();
      let end = e.end;
      if (!end) {
        const s = new Date(start);
        if (e.allDay) {
          // Exclusive end-of-day: next local midnight after start's local calendar day
          const next = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
          end = next.toISOString();
        } else {
          end = new Date(s.getTime() + 60 * 60 * 1000).toISOString();
        }
      }
      return {
        id: e.id,
        title: e.title,
        start,
        end,
        allDay: !!e.allDay,
        memberId: e.memberId,
        recurrence: e.recurrence,
        recurrenceUntil: e.recurrenceUntil,
        exceptionDates: e.exceptionDates,
        location: e.location,
        notes: e.notes,
      };
    }),
    notes: p.notes || [],
    messages: p.messages || [],
    presence: p.presence || {},
    appearance: p.appearance || {},
    screenTime: p.screenTime || {},
    screenTimeLog: p.screenTimeLog || [],
  };
}
