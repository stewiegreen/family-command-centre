/**
 * Dashboard constants and small pure helpers.
 */
import type { HomescreenWidgetId } from '../../lib/homescreen';

export type SectionId = HomescreenWidgetId;

export const HOME_EVENTS_FILTER_KEY = 'fcc-home-events-member-filter';

export function eventAssigneeIds(ev: { memberId: string; memberIds?: string[] }): string[] {
  if (ev.memberIds && ev.memberIds.length > 0) return ev.memberIds;
  return ev.memberId ? [ev.memberId] : [];
}

export function loadHomeEventsFilter(): string {
  try {
    return localStorage.getItem(HOME_EVENTS_FILTER_KEY) || 'all';
  } catch {
    return 'all';
  }
}

export const COLOR_ICON: Record<string, string> = {
  indigo: 'bg-accent/15 text-accent',
  emerald: 'bg-sky-500/15 text-sky-500',
  amber: 'bg-amber-500/15 text-amber-500',
  pink: 'bg-pink-500/15 text-pink-500',
};

export const DISMISS_ANN_KEY = 'fcc_dismissed_announcement';


export const SECTION_LABELS: Record<SectionId, string> = {
  stats: 'Quick stats',
  chorequest: 'ChoreQuest',
  presence: 'Where is everyone',
  digest: 'This week',
  events: 'Upcoming Events',
  todos: "Today's Tasks",
  chores: 'Chores',
  shopping: 'Shopping',
  journal: 'Journal',
  school: 'School',
  weather: 'Weather',
  screentimer: 'Screen timer',
  look: 'Profile look',
  pictureframe: 'Picture frame',
  pictureframe2: 'Picture frame 2',
  lights: 'Lights',
  books: 'On Deck',
  recs: 'Recommended',
};

export const HOME_JOURNAL_MOODS = ['😊', '😌', '😐', '😔', '😤', '🤩', '😴', '🙏'] as const;
export const HOME_JOURNAL_PROMPTS = [
  'What made you smile today?',
  'One thing you’re grateful for…',
  'What felt hard — and what helped?',
  'A small win from today…',
  'What do you want more of in your days?',
  'If today had a title, what would it be?',
  'What’s one kindness you noticed?',
];
export function homeJournalPrompt(): string {
  const day = Math.floor(Date.now() / 86_400_000) % HOME_JOURNAL_PROMPTS.length;
  return HOME_JOURNAL_PROMPTS[day]!;
}

export function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}


/** Stable chrome — drag whole card; hide control lives inside the card. */
