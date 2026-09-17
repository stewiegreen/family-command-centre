/**
 * Minimal VEVENT ↔ GreenHQ event mapping for CalDAV.
 * Supports the fields GreenHQ actually stores; ignores the rest.
 */

export type GhEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  memberId?: string;
  memberIds: string[];
  recurrence?: string;
  recurrenceUntil?: string;
  exceptionDates?: string[];
  location?: string;
  notes?: string;
};

/** Unfold ICS content lines (RFC 5545). */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseProps(block: string): Record<string, string[]> {
  const props: Record<string, string[]> = {};
  for (const line of unfold(block)) {
    if (!line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    let keyPart = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi = keyPart.indexOf(';');
    const name = (semi >= 0 ? keyPart.slice(0, semi) : keyPart).toUpperCase();
    const params = semi >= 0 ? keyPart.slice(semi + 1) : '';
    // Keep params in a side channel via special key for DTSTART/DTEND
    if (name === 'DTSTART' || name === 'DTEND' || name === 'EXDATE') {
      props[name] = props[name] || [];
      props[name]!.push(params ? `${params}::${value}` : value);
    } else {
      props[name] = props[name] || [];
      props[name]!.push(value);
    }
  }
  return props;
}

/** ICS date → ISO string. All-day = YYYYMMDD → noon UTC that day for stable date. */
function icsDateToIso(raw: string, allDayHint?: boolean): { iso: string; allDay: boolean } {
  // raw may be "VALUE=DATE::20260917" or "TZID=...::20260917T150000" or "20260917T050000Z"
  let params = '';
  let value = raw;
  if (raw.includes('::')) {
    const [p, v] = raw.split('::');
    params = (p || '').toUpperCase();
    value = v || '';
  }
  const allDay = allDayHint ?? (params.includes('VALUE=DATE') || /^\d{8}$/.test(value));
  if (allDay) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    // Store all-day as local-noon-ish UTC (matches GreenHQ form export style roughly)
    return { iso: `${y}-${m}-${d}T12:00:00.000Z`, allDay: true };
  }
  // 20260917T050000Z or 20260917T150000
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (!m) {
    // fallback try Date parse
    const d = new Date(value);
    return { iso: d.toISOString(), allDay: false };
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? '.000Z' : '.000Z'}`;
  // If no Z, treat as UTC floating → still store as Z (same as Phase 1 feed direction)
  return { iso: new Date(iso).toISOString(), allDay: false };
}

function allDayEndExclusive(startIso: string, endIso: string): string {
  // GreenHQ stores exclusive end for all-day (day after last day)
  const s = startIso.slice(0, 10);
  const e = endIso.slice(0, 10);
  if (e > s) return endIso;
  // single-day: end = start + 1 day
  const d = new Date(startIso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function parseVEvent(icsBody: string, defaultMemberIds: string[]): GhEvent | null {
  const upper = icsBody.toUpperCase();
  const startIdx = upper.indexOf('BEGIN:VEVENT');
  const endIdx = upper.indexOf('END:VEVENT');
  if (startIdx < 0 || endIdx < 0) return null;
  const block = icsBody.slice(startIdx, endIdx + 'END:VEVENT'.length);
  const props = parseProps(block);

  const uid = (props['UID']?.[0] || '').trim();
  const summary = (props['SUMMARY']?.[0] || 'Event').trim();
  if (!uid) return null;

  const dtstartRaw = props['DTSTART']?.[0];
  if (!dtstartRaw) return null;
  const startParsed = icsDateToIso(dtstartRaw);
  let endParsed = props['DTEND']?.[0]
    ? icsDateToIso(props['DTEND'][0]!, startParsed.allDay)
    : null;
  if (!endParsed) {
    // DURATION not supported → +1 hour or +1 day
    const d = new Date(startParsed.iso);
    if (startParsed.allDay) d.setUTCDate(d.getUTCDate() + 1);
    else d.setUTCHours(d.getUTCHours() + 1);
    endParsed = { iso: d.toISOString(), allDay: startParsed.allDay };
  }
  let endIso = endParsed.iso;
  if (startParsed.allDay) {
    endIso = allDayEndExclusive(startParsed.iso, endParsed.iso);
  }

  let recurrence: string | undefined;
  let recurrenceUntil: string | undefined;
  const rrule = props['RRULE']?.[0];
  if (rrule) {
    const freq = (rrule.match(/FREQ=([^;]+)/i) || [])[1]?.toUpperCase();
    if (freq === 'DAILY') recurrence = 'daily';
    else if (freq === 'WEEKLY') recurrence = 'weekly';
    else if (freq === 'MONTHLY') recurrence = 'monthly';
    const until = (rrule.match(/UNTIL=([^;]+)/i) || [])[1];
    if (until) {
      const u = icsDateToIso(until.includes('T') ? until : `${until}`);
      recurrenceUntil = u.iso;
    }
  }

  const exceptionDates: string[] = [];
  for (const ex of props['EXDATE'] || []) {
    const p = icsDateToIso(ex, true);
    exceptionDates.push(p.iso.slice(0, 10));
  }

  const location = props['LOCATION']?.[0]?.trim();
  const notes = props['DESCRIPTION']?.[0]?.trim();

  return {
    id: uid,
    title: summary.replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'),
    start: startParsed.iso,
    end: endIso,
    allDay: startParsed.allDay,
    memberIds: defaultMemberIds.length ? defaultMemberIds : [],
    memberId: defaultMemberIds[0],
    recurrence,
    recurrenceUntil,
    exceptionDates: exceptionDates.length ? exceptionDates : undefined,
    location: location || undefined,
    notes: notes
      ? notes.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\')
      : undefined,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIcsUtc(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  }
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function serializeVEvent(ev: GhEvent): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GreenHQ//CalDAV//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT'];
  lines.push(`UID:${ev.id}`);
  lines.push(`SUMMARY:${esc(ev.title)}`);
  if (ev.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${toIcsUtc(ev.start, true)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsUtc(ev.end, true)}`);
  } else {
    lines.push(`DTSTART:${toIcsUtc(ev.start, false)}`);
    lines.push(`DTEND:${toIcsUtc(ev.end, false)}`);
  }
  if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
  if (ev.notes) lines.push(`DESCRIPTION:${esc(ev.notes)}`);
  if (ev.recurrence && ev.recurrence !== 'none') {
    let rule = `FREQ=${ev.recurrence.toUpperCase()}`;
    if (ev.recurrenceUntil) {
      const u = toIcsUtc(ev.recurrenceUntil, false);
      rule += `;UNTIL=${u}`;
    }
    lines.push(`RRULE:${rule}`);
  }
  if (ev.exceptionDates?.length) {
    for (const ds of ev.exceptionDates) {
      lines.push(`EXDATE;VALUE=DATE:${ds.replace(/-/g, '')}`);
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function eventEtag(ev: GhEvent): string {
  // Weak etag from stable fields
  const raw = `${ev.id}|${ev.title}|${ev.start}|${ev.end}|${ev.allDay}|${ev.notes || ''}|${ev.location || ''}|${ev.recurrence || ''}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `"${(h >>> 0).toString(16)}"`;
}
