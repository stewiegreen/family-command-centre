import {
  addDays,
  addMonths,
  addWeeks,
  isBefore,
  
  startOfDay,
} from 'date-fns';
import type { CalendarEvent, ExpandedEvent } from '../types';

const MAX_INSTANCES = 400;

function seriesEnd(ev: CalendarEvent, rangeEnd: Date): Date {
  if (ev.recurrenceUntil) {
    const until = startOfDay(new Date(ev.recurrenceUntil));
    return isBefore(until, rangeEnd) ? until : rangeEnd;
  }
  return rangeEnd;
}

/** Duration in ms from master start→end (minimum 1 minute for timed, 1 day for all-day if missing). */
function masterDurationMs(ev: CalendarEvent): number {
  const s = new Date(ev.start).getTime();
  const e = new Date(ev.end || ev.start).getTime();
  if (e > s) return e - s;
  return ev.allDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isExcepted(ev: CalendarEvent, instanceStart: Date): boolean {
  const key = localDateKey(instanceStart);
  return (ev.exceptionDates || []).includes(key);
}

/**
 * Expand stored master events into concrete instances overlapping [rangeStart, rangeEnd].
 * An instance overlaps if instanceStart < rangeEndExclusive and instanceEnd > rangeStart.
 * Non-recurring events are returned as a single instance when they overlap the range.
 */
export function expandEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const out: ExpandedEvent[] = [];
  const rs = rangeStart.getTime();
  const re = rangeEnd.getTime();
  // Use start-of-day bounds for stepping recurring masters
  const rsDay = startOfDay(rangeStart);
  const reDay = startOfDay(rangeEnd);

  for (const ev of events) {
    const rule = (ev.recurrence || 'none').toLowerCase();
    const masterStart = new Date(ev.start);
    const duration = masterDurationMs(ev);

    if (!rule || rule === 'none') {
      const instStart = masterStart.getTime();
      const instEnd = instStart + duration;
      if (instStart < re && instEnd > rs && !isExcepted(ev, masterStart)) {
        out.push({
          ...ev,
          end: ev.end || new Date(instEnd).toISOString(),
          masterId: ev.id,
          instanceStart: ev.start,
          instanceEnd: ev.end || new Date(instEnd).toISOString(),
        });
      }
      continue;
    }

    const endBound = seriesEnd(ev, reDay);
    let cursor = new Date(masterStart);
    let guard = 0;
    // Fast-forward before range (leave one step of slack for multi-day duration)
    while (isBefore(startOfDay(cursor), addDays(rsDay, -7)) && guard < MAX_INSTANCES) {
      cursor = step(cursor, rule);
      guard++;
    }

    guard = 0;
    while (!isBefore(endBound, startOfDay(cursor)) && guard < MAX_INSTANCES) {
      if (!isExcepted(ev, cursor)) {
        const instanceStartIso = applyTime(cursor, masterStart, ev.allDay);
        const instStartMs = new Date(instanceStartIso).getTime();
        const instEndMs = instStartMs + duration;
        if (instStartMs < re && instEndMs > rs) {
          out.push({
            ...ev,
            id: `${ev.id}_${localDateKey(cursor)}`,
            masterId: ev.id,
            start: instanceStartIso,
            end: new Date(instEndMs).toISOString(),
            instanceStart: instanceStartIso,
            instanceEnd: new Date(instEndMs).toISOString(),
          });
        }
      }
      cursor = step(cursor, rule);
      guard++;
    }
  }

  return out.sort(
    (a, b) => new Date(a.instanceStart).getTime() - new Date(b.instanceStart).getTime(),
  );
}

function step(d: Date, rule: string): Date {
  if (rule === 'daily') return addDays(d, 1);
  if (rule === 'weekly') return addWeeks(d, 1);
  if (rule === 'monthly') return addMonths(d, 1);
  return addDays(d, 1);
}

function applyTime(day: Date, master: Date, allDay: boolean): string {
  if (allDay) {
    const x = startOfDay(day);
    x.setHours(12, 0, 0, 0);
    return x.toISOString();
  }
  const x = new Date(day);
  x.setHours(master.getHours(), master.getMinutes(), master.getSeconds(), 0);
  return x.toISOString();
}

/** True if the expanded instance overlaps the given local calendar day. */
export function eventOverlapsDay(ev: ExpandedEvent, day: Date): boolean {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const s = new Date(ev.instanceStart).getTime();
  const e = new Date(ev.instanceEnd).getTime();
  return s < dayEnd && e > dayStart;
}

export function eventsOnDay(events: CalendarEvent[], day: Date, padMonths = 2): ExpandedEvent[] {
  const rangeStart = addMonths(startOfDay(day), -padMonths);
  const rangeEnd = addMonths(startOfDay(day), padMonths);
  return expandEvents(events, rangeStart, rangeEnd).filter((e) => eventOverlapsDay(e, day));
}

export function upcomingExpanded(
  events: CalendarEvent[],
  from: Date,
  daysAhead: number,
): ExpandedEvent[] {
  const rangeEnd = addDays(startOfDay(from), daysAhead);
  return expandEvents(events, startOfDay(from), rangeEnd).filter(
    (e) => new Date(e.instanceStart).getTime() >= from.getTime() - 60_000,
  );
}

/**
 * Pack overlapping timed events into columns (Google Calendar style).
 * Returns map of event id → { column, columnCount }.
 */
export function packOverlapping(
  events: ExpandedEvent[],
): Map<string, { column: number; columnCount: number }> {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.instanceStart).getTime() - new Date(b.instanceStart).getTime() ||
      new Date(b.instanceEnd).getTime() - new Date(a.instanceEnd).getTime(),
  );
  const result = new Map<string, { column: number; columnCount: number }>();
  // Active: { endMs, column }
  type Active = { endMs: number; column: number; id: string };
  let active: Active[] = [];
  let groupIds: string[] = [];
  let maxCol = 0;

  const flushGroup = () => {
    const cols = maxCol + 1;
    for (const id of groupIds) {
      const prev = result.get(id);
      if (prev) result.set(id, { column: prev.column, columnCount: cols });
    }
    groupIds = [];
    maxCol = 0;
  };

  for (const ev of sorted) {
    const startMs = new Date(ev.instanceStart).getTime();
    const endMs = new Date(ev.instanceEnd).getTime();
    active = active.filter((a) => a.endMs > startMs);
    if (active.length === 0 && groupIds.length) flushGroup();

    const used = new Set(active.map((a) => a.column));
    let col = 0;
    while (used.has(col)) col++;
    maxCol = Math.max(maxCol, col);
    active.push({ endMs, column: col, id: ev.id });
    groupIds.push(ev.id);
    result.set(ev.id, { column: col, columnCount: 1 });
  }
  if (groupIds.length) flushGroup();
  return result;
}
