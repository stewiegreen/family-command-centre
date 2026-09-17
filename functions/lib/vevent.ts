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
  category?: string;
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

/**
 * Convert a wall-clock time in `timeZone` to a real UTC Date.
 * Uses Intl (available on Cloudflare Workers) — no TZ database package needed.
 */
function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  // Desired wall clock as if it were UTC
  const desiredAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const partsOf = (ms: number) => {
    const p = dtf.formatToParts(new Date(ms));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return {
      year: g('year'),
      month: g('month'),
      day: g('day'),
      hour: g('hour'),
      minute: g('minute'),
      second: g('second'),
    };
  };

  // Instant `desiredAsUtcMs` displays as some wall time in `timeZone`.
  // Diff between that wall (as UTC ms) and desiredAsUtcMs is the offset.
  const wall = partsOf(desiredAsUtcMs);
  const wallAsUtcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const offset = wallAsUtcMs - desiredAsUtcMs;
  // Apply once; DST edges may need a second pass
  let utcMs = desiredAsUtcMs - offset;
  const wall2 = partsOf(utcMs);
  const wall2AsUtc = Date.UTC(wall2.year, wall2.month - 1, wall2.day, wall2.hour, wall2.minute, wall2.second);
  if (wall2AsUtc !== desiredAsUtcMs) {
    utcMs = utcMs - (wall2AsUtc - desiredAsUtcMs);
  }
  return new Date(utcMs);
}

/** Default zone for floating (no TZID / no Z) times — GreenHQ family is AU. */
const DEFAULT_FLOATING_TZ = 'Australia/Brisbane';

/** ICS date → ISO UTC string. */
function icsDateToIso(raw: string, allDayHint?: boolean): { iso: string; allDay: boolean } {
  // raw may be "VALUE=DATE::20260917" or "TZID=Australia/Brisbane::20260917T080000" or "20260917T050000Z"
  let params = '';
  let value = raw;
  if (raw.includes('::')) {
    const idx = raw.indexOf('::');
    params = raw.slice(0, idx);
    value = raw.slice(idx + 2);
  }
  const paramsUpper = params.toUpperCase();
  const allDay = allDayHint ?? (paramsUpper.includes('VALUE=DATE') || /^\d{8}$/.test(value));
  if (allDay) {
    const y = value.slice(0, 4);
    const mo = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${mo}-${d}T12:00:00.000Z`, allDay: true };
  }

  const cleaned = value.replace(/\.\d+/, '');
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i);
  if (!m) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      return { iso: new Date().toISOString(), allDay: false };
    }
    return { iso: d.toISOString(), allDay: false };
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const isZulu = !!m[7];

  // Explicit UTC
  if (isZulu) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
    return { iso: new Date(iso).toISOString(), allDay: false };
  }

  // TZID=Area/City (iOS always sends this for timed events)
  let tz = DEFAULT_FLOATING_TZ;
  const tzidMatch = params.match(/TZID=([^;]+)/i);
  if (tzidMatch?.[1]) {
    // Strip quotes Apple sometimes adds
    tz = tzidMatch[1].replace(/^"|"$/g, '');
  }

  try {
    const utc = zonedWallToUtc(year, month, day, hour, minute, second, tz);
    return { iso: utc.toISOString(), allDay: false };
  } catch {
    // Fallback: treat as floating Brisbane
    const utc = zonedWallToUtc(year, month, day, hour, minute, second, DEFAULT_FLOATING_TZ);
    return { iso: utc.toISOString(), allDay: false };
  }
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

  let uid = (props['UID']?.[0] || '').trim();
  const summary = (props['SUMMARY']?.[0] || 'Event').trim();
  // Apple sometimes puts UID only in the path; caller can override
  if (!uid) uid = `put-${Date.now()}`;

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
  const catRaw = props['CATEGORIES']?.[0]?.trim();
  let category: string | undefined;
  if (catRaw) {
    const first = catRaw.split(',')[0]!.trim().toLowerCase();
    const map: Record<string, string> = {
      school: 'school',
      sport: 'sport',
      medical: 'medical',
      family: 'family',
      travel: 'travel',
      birthday: 'birthday',
      chore: 'chore',
      other: 'other',
      general: 'general',
    };
    category = map[first] || (['school','sport','medical','family','travel','birthday','chore','other','general'].includes(first) ? first : 'other');
  }

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
    category,
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
  if (ev.category && ev.category !== 'general') {
    // Human label works better in Apple Calendar than raw id
    const labels: Record<string, string> = {
      school: 'School',
      sport: 'Sport',
      medical: 'Medical',
      family: 'Family',
      travel: 'Travel',
      birthday: 'Birthday',
      chore: 'Chore',
      other: 'Other',
    };
    lines.push(`CATEGORIES:${esc(labels[ev.category] || ev.category)}`);
  }
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
  // Match GreenHQ NotificationWatcher: 1h + 15m before timed events
  if (!ev.allDay) {
    for (const trigger of ['-PT1H', '-PT15M']) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${esc(ev.title)}`,
        `TRIGGER:${trigger}`,
        'END:VALARM',
      );
    }
  } else {
    // All-day: morning-of style nudge (relative to stored start)
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(ev.title)}`,
      'TRIGGER:-PT3H',
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function eventEtag(ev: GhEvent): string {
  // Weak etag from stable fields
  const raw = `${ev.id}|${ev.title}|${ev.start}|${ev.end}|${ev.allDay}|${ev.notes || ''}|${ev.location || ''}|${ev.recurrence || ''}|${ev.category || ''}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `"${(h >>> 0).toString(16)}"`;
}
