/**
 * Builds the read-only .ics subscription feed body for a family's calendar.
 * Port of src/lib/ical.ts recurrence mapping — server-side uses UTC so phones
 * convert correctly (Workers run in UTC; client export uses local getters).
 */

import { createEvents, type DateArray, type EventAttributes } from 'ics';
import type { FeedEvent, MemberLite } from './functions-firestoreFamily';

function toDateArray(iso: string, allDay: boolean): DateArray {
  const d = new Date(iso);
  if (allDay) {
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }
  return [
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
  ];
}

function allDayExclusiveEnd(endIso: string): DateArray {
  const d = new Date(endIso);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

function recurrenceToRRule(ev: FeedEvent): string | undefined {
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

function memberNames(memberIds: string[], members: MemberLite[]): string {
  return memberIds
    .map((id) => members.find((m) => m.id === id)?.name)
    .filter((n): n is string => !!n)
    .join(', ');
}

export function buildIcsFeed(
  events: FeedEvent[],
  members: MemberLite[],
  calName: string,
  opts?: { omitMemberNamesInTitle?: boolean },
): string {
  const attrs: EventAttributes[] = events.map((ev) => {
    const start = toDateArray(ev.start, ev.allDay);
    const end = ev.allDay
      ? allDayExclusiveEnd(ev.end || ev.start)
      : toDateArray(ev.end || ev.start, false);

    const names = opts?.omitMemberNamesInTitle
      ? ''
      : memberNames(ev.memberIds, members);

    const attr: EventAttributes = {
      start,
      end,
      title: names ? `${ev.title} · ${names}` : ev.title,
      uid: ev.id,
      calName,
      productId: 'GreenHQ/family-command-centre',
      startInputType: 'utc',
      endInputType: 'utc',
    };

    if (ev.notes) attr.description = ev.notes;
    if (ev.location) attr.location = ev.location;

    const rrule = recurrenceToRRule(ev);
    if (rrule) attr.recurrenceRule = rrule;

    if (ev.exceptionDates?.length) {
      attr.exclusionDates = ev.exceptionDates.map((ds) => {
        const [y, m, d] = ds.split('-').map(Number);
        return [y!, m!, d!] as DateArray;
      });
    }

    return attr;
  });

  const { error, value } = createEvents(attrs);
  if (error || !value) {
    throw new Error(error?.message || 'Failed to generate ICS');
  }
  return value;
}
