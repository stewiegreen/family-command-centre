import {
  addDays,
  addMonths,
  addWeeks,
  isBefore,
  isSameDay,
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

/**
 * Expand stored master events into concrete instances overlapping [rangeStart, rangeEnd].
 * Non-recurring events are returned as a single instance when they fall in range.
 */
export function expandEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const out: ExpandedEvent[] = [];
  const rs = startOfDay(rangeStart);
  const re = startOfDay(rangeEnd);

  for (const ev of events) {
    const rule = (ev.recurrence || 'none').toLowerCase();
    const masterStart = new Date(ev.start);

    if (!rule || rule === 'none') {
      if (!isBefore(masterStart, rs) && !isBefore(re, startOfDay(masterStart))) {
        out.push({
          ...ev,
          masterId: ev.id,
          instanceStart: ev.start,
        });
      }
      continue;
    }

    const end = seriesEnd(ev, re);
    let cursor = new Date(masterStart);
    // Fast-forward before range
    let guard = 0;
    while (isBefore(startOfDay(cursor), rs) && guard < MAX_INSTANCES) {
      cursor = step(cursor, rule);
      guard++;
    }

    guard = 0;
    while (!isBefore(end, startOfDay(cursor)) && guard < MAX_INSTANCES) {
      if (!isBefore(startOfDay(cursor), rs)) {
        const instanceStart = applyTime(cursor, masterStart, ev.allDay);
        out.push({
          ...ev,
          id: `${ev.id}_${instanceStart.slice(0, 10)}`,
          masterId: ev.id,
          start: instanceStart,
          instanceStart,
        });
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

export function eventsOnDay(events: CalendarEvent[], day: Date, padMonths = 2): ExpandedEvent[] {
  const rangeStart = addMonths(startOfDay(day), -padMonths);
  const rangeEnd = addMonths(startOfDay(day), padMonths);
  return expandEvents(events, rangeStart, rangeEnd).filter((e) =>
    isSameDay(new Date(e.instanceStart), day),
  );
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
