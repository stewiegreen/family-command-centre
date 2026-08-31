/**
 * Client-side iCal (.ics) export/import for GreenHQ calendar events.
 * Uses dynamic imports so a missing package never blanks the rest of the app.
 */
import type { CalendarEvent } from '../types';
import { uid } from './uid';

type DateArray =
  | [number, number, number, number, number]
  | [number, number, number, number]
  | [number, number, number];

function toDateArray(iso: string, allDay: boolean): DateArray {
  const d = new Date(iso);
  if (allDay) {
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  }
  return [
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
  ];
}

function allDayExclusiveEnd(endIso: string): DateArray {
  const d = new Date(endIso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
}

function recurrenceToRRule(ev: CalendarEvent): string | undefined {
  const r = (ev.recurrence || 'none').toLowerCase();
  if (!r || r === 'none') return undefined;
  let freq = '';
  if (r === 'daily') freq = 'DAILY';
  else if (r === 'weekly') freq = 'WEEKLY';
  else if (r === 'monthly') freq = 'MONTHLY';
  else return undefined;
  let rule = `FREQ=${freq}`;
  if (ev.recurrenceUntil) {
    const u = new Date(ev.recurrenceUntil);
    const y = u.getUTCFullYear();
    const m = String(u.getUTCMonth() + 1).padStart(2, '0');
    const day = String(u.getUTCDate()).padStart(2, '0');
    rule += `;UNTIL=${y}${m}${day}T235959Z`;
  }
  return rule;
}

export type ExportResult = { ok: true; ics: string } | { ok: false; error: string };

/**
 * Build a .ics file body from master CalendarEvents (not expanded instances).
 */
export async function exportEventsToIcs(
  events: CalendarEvent[],
  calName = 'GreenHQ',
): Promise<ExportResult> {
  try {
    const { createEvents } = await import('ics');
    const attrs = events.map((ev) => {
      const start = toDateArray(ev.start, ev.allDay);
      const endArr = ev.allDay
        ? allDayExclusiveEnd(ev.end || ev.start)
        : toDateArray(ev.end || ev.start, false);

      const base: Record<string, unknown> = {
        start,
        end: endArr,
        title: ev.title,
        description: ev.notes,
        location: ev.location,
        uid: ev.id,
        calName,
        productId: 'GreenHQ/family-command-centre',
        startInputType: 'local',
        endInputType: 'local',
      };

      const rrule = recurrenceToRRule(ev);
      if (rrule) base.recurrenceRule = rrule;

      if (ev.exceptionDates?.length) {
        base.exclusionDates = ev.exceptionDates.map((ds) => {
          const [y, m, d] = ds.split('-').map(Number);
          return [y, m, d] as DateArray;
        });
      }

      return base;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, value } = createEvents(attrs as any);
    if (error || !value) {
      return { ok: false, error: error?.message || 'Failed to generate ICS' };
    }
    return { ok: true, ics: value };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : 'ICS export failed. Run: npm install ics ical.js',
    };
  }
}

/** Trigger a browser download of a .ics file. */
export function downloadIcs(icsBody: string, filename = 'greenhq-calendar.ics'): void {
  const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ImportResult = {
  events: CalendarEvent[];
  imported: number;
  skipped: number;
  skipReasons: string[];
};

/**
 * Parse an .ics file string into CalendarEvents.
 */
export async function importEventsFromIcs(
  icsText: string,
  defaultMemberId: string,
): Promise<ImportResult> {
  try {
    const ICAL = (await import('ical.js')).default;
    return parseWithIcal(ICAL, icsText, defaultMemberId);
  } catch (e) {
    return {
      events: [],
      imported: 0,
      skipped: 0,
      skipReasons: [
        e instanceof Error
          ? e.message
          : 'ICS import failed. Run: npm install ics ical.js',
      ],
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWithIcal(ICAL: any, icsText: string, defaultMemberId: string): ImportResult {
  const events: CalendarEvent[] = [];
  const skipReasons: string[] = [];
  let skipped = 0;

  let jcal: unknown;
  try {
    jcal = ICAL.parse(icsText);
  } catch (e) {
    return {
      events: [],
      imported: 0,
      skipped: 0,
      skipReasons: [`Parse error: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      const summary = event.summary || 'Untitled';
      const startDate = event.startDate;
      const endDate = event.endDate || startDate;
      if (!startDate) {
        skipped++;
        skipReasons.push(`"${summary}": missing DTSTART`);
        continue;
      }

      const allDay = !!startDate.isDate;
      const start = startDate.toJSDate().toISOString();
      let end = endDate.toJSDate().toISOString();

      if (new Date(end).getTime() <= new Date(start).getTime()) {
        if (allDay) {
          const s = startDate.toJSDate();
          end = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1).toISOString();
        } else {
          end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        }
      }

      let recurrence: string | undefined;
      let recurrenceUntil: string | undefined;
      const rruleProp = vevent.getFirstProperty('rrule');

      if (rruleProp) {
        const mapped = mapRRuleProperty(rruleProp);
        if (mapped.ok === false) {
          skipped++;
          skipReasons.push(`"${summary}": ${mapped.reason}`);
          continue;
        }
        recurrence = mapped.recurrence;
        recurrenceUntil = mapped.recurrenceUntil;
      }

      const exceptionDates: string[] = [];
      for (const prop of vevent.getAllProperties('exdate')) {
        try {
          const vals = prop.getValues() as { toJSDate: () => Date }[];
          for (const v of vals) {
            const d = v.toJSDate();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            exceptionDates.push(`${y}-${m}-${day}`);
          }
        } catch {
          /* skip bad exdate */
        }
      }

      events.push({
        id: uid(),
        title: summary,
        start,
        end,
        allDay,
        memberId: defaultMemberId,
        memberIds: [defaultMemberId],
        recurrence,
        recurrenceUntil,
        exceptionDates: exceptionDates.length ? exceptionDates : undefined,
        location: event.location || undefined,
        notes: event.description || undefined,
      });
    } catch (e) {
      skipped++;
      skipReasons.push(`Event parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    events,
    imported: events.length,
    skipped,
    skipReasons: skipReasons.slice(0, 20),
  };
}

function mapRRuleProperty(
  rruleProp: { getFirstValue: () => unknown },
):
  | { ok: true; recurrence: string; recurrenceUntil?: string }
  | { ok: false; reason: string } {
  try {
    const val = rruleProp.getFirstValue() as {
      freq?: string;
      interval?: number;
      until?: { toJSDate: () => Date };
      parts?: { FREQ?: string[]; INTERVAL?: string[] };
    };

    let freq = (val?.freq || '').toUpperCase();
    let interval = val?.interval ?? 1;

    if (!freq && val?.parts?.FREQ?.[0]) {
      freq = String(val.parts.FREQ[0]).toUpperCase();
    }
    if (val?.parts?.INTERVAL?.[0]) {
      interval = Number(val.parts.INTERVAL[0]) || 1;
    }

    if (interval > 1) {
      return { ok: false, reason: `RRULE INTERVAL=${interval} not supported` };
    }

    let recurrence: string;
    if (freq === 'DAILY') recurrence = 'daily';
    else if (freq === 'WEEKLY') recurrence = 'weekly';
    else if (freq === 'MONTHLY') recurrence = 'monthly';
    else return { ok: false, reason: `unsupported RRULE FREQ=${freq || '?'}` };

    let recurrenceUntil: string | undefined;
    if (val?.until) {
      recurrenceUntil = val.until.toJSDate().toISOString();
    }

    return { ok: true, recurrence, recurrenceUntil };
  } catch {
    return { ok: false, reason: 'complex RRULE not supported' };
  }
}
