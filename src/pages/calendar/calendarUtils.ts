/**
 * Calendar page pure helpers and constants.
 * Extracted from CalendarPage so view components and the page can share them.
 */
import { format } from 'date-fns';
import type { ExpandedEvent } from '../../types';
import {
  EVENT_CATEGORY_META,
  eventCategoryOf,
  type EventCategory,
} from '../../lib/eventCategories';

export type CalView = 'month' | 'week' | 'day';

export const VIEW_KEY = 'fcc-calendar-view';
export const MEMBER_FILTER_KEY = 'fcc-calendar-member-filter';
export const TASKS_KEY = 'fcc-calendar-show-tasks';
export const HOUR_START = 6;
export const HOUR_END = 22;
export const HOUR_HEIGHT = 56; // px per hour
export const SNAP_MIN = 15; // drag snap in minutes

export function loadView(): CalView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'month' || v === 'week' || v === 'day') return v;
  } catch {
    /* ignore */
  }
  return 'month';
}

export function loadShowTasks(): boolean {
  try {
    const v = localStorage.getItem(TASKS_KEY);
    if (v === '0' || v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function loadMemberFilter(): string {
  try {
    return localStorage.getItem(MEMBER_FILTER_KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function localDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function localTimeStr(d: Date): string {
  return format(d, 'HH:mm');
}

/** Build ISO start/end from form fields. All-day: exclusive end = local midnight after end date. */
export function buildTimes(form: {
  allDay: boolean;
  start: string;
  endDate: string;
  time: string;
  endTime: string;
}): { start: string; end: string } {
  if (form.allDay) {
    const startLocal = new Date(form.start + 'T12:00:00');
    const endDay = form.endDate || form.start;
    const [y, m, d] = endDay.split('-').map(Number);
    // Exclusive: midnight of the day after the last inclusive day
    const endExclusive = new Date(y, m - 1, d + 1);
    return { start: startLocal.toISOString(), end: endExclusive.toISOString() };
  }
  const start = new Date(form.start + 'T' + form.time);
  const end = new Date((form.endDate || form.start) + 'T' + form.endTime);
  if (end.getTime() <= start.getTime()) {
    end.setTime(start.getTime() + 60 * 60 * 1000);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatEventTimeLabel(ev: ExpandedEvent): string {
  if (ev.allDay) return '';
  return format(new Date(ev.instanceStart), 'H:mm') + ' ';
}

/** Assigned members for an event (supports multi-assignee). */
export function eventMemberIds(ev: { memberId: string; memberIds?: string[] }): string[] {
  if (ev.memberIds && ev.memberIds.length > 0) return ev.memberIds;
  return ev.memberId ? [ev.memberId] : [];
}

/** Chip background: single colour, or stripe when multiple people share the event. */
export function eventChipStyle(
  ev: { memberId: string; memberIds?: string[] },
  memberColor: (id: string) => string,
  opts?: { alpha?: string },
): import("react").CSSProperties {
  const alpha = opts?.alpha ?? '55';
  const ids = eventMemberIds(ev);
  const colors = (ids.length ? ids : [ev.memberId]).map((id) => memberColor(id || ''));
  const primary = colors[0] || '#6366f1';
  if (colors.length <= 1) {
    return {
      backgroundColor: primary + alpha,
      color: primary,
      borderLeft: `4px solid ${primary}`,
    };
  }
  // Up to 3 colour bands so multi-kid events read at a glance
  const band = colors.slice(0, 3);
  const stops = band
    .map((c, i) => {
      const a = (i / band.length) * 100;
      const b = ((i + 1) / band.length) * 100;
      return `${c}${alpha} ${a}%, ${c}${alpha} ${b}%`;
    })
    .join(', ');
  return {
    backgroundImage: `linear-gradient(90deg, ${stops})`,
    color: primary,
    borderLeft: `4px solid ${primary}`,
  };
}

export type FormState = {
  title: string;
  allDay: boolean;
  memberIds: string[];
  start: string;
  endDate: string;
  time: string;
  endTime: string;
  recurrence: string;
  recurrenceUntil: string;
  location: string;
  notes: string;
  linkedNoteId: string;
  category: EventCategory;
};

export function emptyForm(memberId: string, day?: Date): FormState {
  const d = day ? localDateStr(day) : localDateStr(new Date());
  return {
    title: '',
    allDay: true,
    memberIds: memberId ? [memberId] : [],
    start: d,
    endDate: d,
    time: '09:00',
    endTime: '10:00',
    recurrence: 'none',
    recurrenceUntil: '',
    location: '',
    notes: '',
    linkedNoteId: '',
    category: 'general',
  };
}


export function eventTitleLabel(ev: { title: string; category?: string; linkedNoteId?: string }): string {
  const cat = eventCategoryOf(ev.category);
  const prefix = cat !== 'general' ? `${EVENT_CATEGORY_META[cat].emoji} ` : '';
  const suffix = ev.linkedNoteId ? ' 📎' : '';
  return `${prefix}${ev.title}${suffix}`;
}

export function snapMins(mins: number): number {
  return Math.round(mins / SNAP_MIN) * SNAP_MIN;
}

export function yToMins(clientY: number, gridTop: number): number {
  const y = clientY - gridTop;
  const mins = HOUR_START * 60 + (y / HOUR_HEIGHT) * 60;
  return snapMins(Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, mins)));
}

