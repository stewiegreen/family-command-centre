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
    chores: p.chores || [],
    shopping: p.shopping || [],
    events: p.events || [],
    notes: p.notes || [],
    messages: p.messages || [],
    presence: p.presence || {},
    appearance: p.appearance || {},
    screenTime: p.screenTime || {},
    screenTimeLog: p.screenTimeLog || [],
  };
}
