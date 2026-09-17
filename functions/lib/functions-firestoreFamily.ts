/** Minimal Firestore REST helpers for family screenTime updates. */

export type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FsValue> } }
  | { arrayValue: { values?: FsValue[] } };

export type FsDoc = { name?: string; fields?: Record<string, FsValue> };

function str(v: FsValue | undefined): string | undefined {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  return undefined;
}

function int(v: FsValue | undefined): number | undefined {
  if (!v) return undefined;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return Math.round(v.doubleValue);
  return undefined;
}

export function readStringMap(doc: FsDoc, field: string): Record<string, string> {
  const f = doc.fields?.[field];
  if (!f || !('mapValue' in f)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.mapValue.fields || {})) {
    const s = str(v);
    if (s != null) out[k] = s;
  }
  return out;
}

export function readNumberMap(doc: FsDoc, field: string): Record<string, number> {
  const f = doc.fields?.[field];
  if (!f || !('mapValue' in f)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.mapValue.fields || {})) {
    const n = int(v);
    if (n != null && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export type MemberLite = { id: string; role?: string; embyUserId?: string; name?: string; color?: string };

export function readMembers(doc: FsDoc): MemberLite[] {
  const f = doc.fields?.members;
  if (!f || !('arrayValue' in f)) return [];
  const values = f.arrayValue.values || [];
  const out: MemberLite[] = [];
  for (const v of values) {
    if (!('mapValue' in v)) continue;
    const fields = v.mapValue.fields || {};
    const id = str(fields.id);
    if (!id) continue;
    out.push({
      id,
      role: str(fields.role),
      embyUserId: str(fields.embyUserId),
      name: str(fields.name),
      color: str(fields.color),
    });
  }
  return out;
}

export type LiveSession = {
  memberId: string;
  startedAt: number; // ms — when this play stretch began (informational)
  /** Always charge elapsed from this, not startedAt. Updated by webhook + cron. */
  lastChargedAt: number;
  sessionId?: string;
  itemName?: string;
  paused?: boolean;
};

export function readLiveSessions(doc: FsDoc): Record<string, LiveSession> {
  const f = doc.fields?.embyLive;
  if (!f || !('mapValue' in f)) return {};
  const out: Record<string, LiveSession> = {};
  for (const [k, v] of Object.entries(f.mapValue.fields || {})) {
    if (!('mapValue' in v)) continue;
    const fields = v.mapValue.fields || {};
    const memberId = str(fields.memberId);
    const startedAt = int(fields.startedAt);
    if (!memberId || startedAt == null) continue;
    // Backward compat: sessions written before lastChargedAt existed fall back to startedAt
    const lastChargedAt = int(fields.lastChargedAt) ?? startedAt;
    out[k] = {
      memberId,
      startedAt,
      lastChargedAt,
      sessionId: str(fields.sessionId),
      itemName: str(fields.itemName),
      paused: 'booleanValue' in (fields.paused || {}) ? (fields.paused as { booleanValue: boolean }).booleanValue : false,
    };
  }
  return out;
}

function numberMapValue(map: Record<string, number>): FsValue {
  const fields: Record<string, FsValue> = {};
  for (const [k, n] of Object.entries(map)) {
    fields[k] = { integerValue: String(Math.max(0, Math.floor(n))) };
  }
  return { mapValue: { fields } };
}

function liveMapValue(map: Record<string, LiveSession>): FsValue {
  const fields: Record<string, FsValue> = {};
  for (const [k, s] of Object.entries(map)) {
    const inner: Record<string, FsValue> = {
      memberId: { stringValue: s.memberId },
      startedAt: { integerValue: String(s.startedAt) },
      lastChargedAt: { integerValue: String(s.lastChargedAt ?? s.startedAt) },
      paused: { booleanValue: !!s.paused },
    };
    if (s.sessionId) inner.sessionId = { stringValue: s.sessionId };
    if (s.itemName) inner.itemName = { stringValue: s.itemName };
    fields[k] = { mapValue: { fields: inner } };
  }
  return { mapValue: { fields } };
}

function logEntryValue(e: {
  id: string;
  memberId: string;
  delta: number;
  reason: string;
  byId: string;
  at: string;
}): FsValue {
  return {
    mapValue: {
      fields: {
        id: { stringValue: e.id },
        memberId: { stringValue: e.memberId },
        delta: { integerValue: String(e.delta) },
        reason: { stringValue: e.reason },
        byId: { stringValue: e.byId },
        at: { stringValue: e.at },
      },
    },
  };
}

export function readScreenTimeLog(doc: FsDoc): FsValue[] {
  const f = doc.fields?.screenTimeLog;
  if (!f || !('arrayValue' in f)) return [];
  return f.arrayValue.values || [];
}

export async function getFamilyDoc(
  projectId: string,
  familyId: string,
  token: string,
): Promise<FsDoc> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/families/${encodeURIComponent(familyId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Firestore GET ${res.status}: ${await res.text()}`);
  return (await res.json()) as FsDoc;
}

export async function patchFamilyScreen(
  projectId: string,
  familyId: string,
  token: string,
  screenTime: Record<string, number>,
  live: Record<string, LiveSession>,
  newLogEntries: {
    id: string;
    memberId: string;
    delta: number;
    reason: string;
    byId: string;
    at: string;
  }[],
  existingLog: FsValue[],
): Promise<void> {
  const logValues = [
    ...newLogEntries.map(logEntryValue),
    ...existingLog,
  ].slice(0, 80);

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/families/${encodeURIComponent(familyId)}` +
    `?updateMask.fieldPaths=screenTime` +
    `&updateMask.fieldPaths=screenTimeLog` +
    `&updateMask.fieldPaths=embyLive` +
    `&updateMask.fieldPaths=updatedAt`;

  const body = {
    fields: {
      screenTime: numberMapValue(screenTime),
      embyLive: liveMapValue(live),
      screenTimeLog: { arrayValue: { values: logValues } },
      updatedAt: { stringValue: new Date().toISOString() },
    },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}: ${await res.text()}`);
}

function strArray(v: FsValue | undefined): string[] {
  if (!v || !('arrayValue' in v)) return [];
  const out: string[] = [];
  for (const item of v.arrayValue.values || []) {
    const s = str(item);
    if (s != null) out.push(s);
  }
  return out;
}

/** Read a top-level string field nested inside the `settings` map. */
export function readSettingsField(doc: FsDoc, key: string): string | undefined {
  const settings = doc.fields?.settings;
  if (!settings || !('mapValue' in settings)) return undefined;
  return str(settings.mapValue.fields?.[key]);
}

/** Lightweight shape read from Firestore for the read-only .ics feed. */
export type FeedEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  memberIds: string[];
  recurrence?: string;
  recurrenceUntil?: string;
  exceptionDates?: string[];
  location?: string;
  notes?: string;
};

export function readEvents(doc: FsDoc): FeedEvent[] {
  const f = doc.fields?.events;
  if (!f || !('arrayValue' in f)) return [];
  const out: FeedEvent[] = [];
  for (const v of f.arrayValue.values || []) {
    if (!('mapValue' in v)) continue;
    const fields = v.mapValue.fields || {};
    const id = str(fields.id);
    const title = str(fields.title);
    const start = str(fields.start);
    const end = str(fields.end);
    if (!id || !title || !start || !end) continue;
    const memberIds = strArray(fields.memberIds);
    const memberId = str(fields.memberId);
    const exceptionDates = strArray(fields.exceptionDates);
    out.push({
      id,
      title,
      start,
      end,
      allDay:
        'booleanValue' in (fields.allDay || {})
          ? (fields.allDay as { booleanValue: boolean }).booleanValue
          : false,
      memberIds: memberIds.length ? memberIds : memberId ? [memberId] : [],
      recurrence: str(fields.recurrence),
      recurrenceUntil: str(fields.recurrenceUntil),
      exceptionDates: exceptionDates.length ? exceptionDates : undefined,
      location: str(fields.location),
      notes: str(fields.notes),
    });
  }
  return out;
}


function eventToFsValue(ev: {
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
}): FsValue {
  const fields: Record<string, FsValue> = {
    id: { stringValue: ev.id },
    title: { stringValue: ev.title },
    start: { stringValue: ev.start },
    end: { stringValue: ev.end },
    allDay: { booleanValue: !!ev.allDay },
    memberIds: {
      arrayValue: {
        values: (ev.memberIds || []).map((id) => ({ stringValue: id })),
      },
    },
  };
  if (ev.memberId) fields.memberId = { stringValue: ev.memberId };
  if (ev.recurrence) fields.recurrence = { stringValue: ev.recurrence };
  if (ev.recurrenceUntil) fields.recurrenceUntil = { stringValue: ev.recurrenceUntil };
  if (ev.exceptionDates?.length) {
    fields.exceptionDates = {
      arrayValue: { values: ev.exceptionDates.map((d) => ({ stringValue: d })) },
    };
  }
  if (ev.location) fields.location = { stringValue: ev.location };
  if (ev.notes) fields.notes = { stringValue: ev.notes };
  return { mapValue: { fields } };
}

/** Replace the entire events array on the family doc (service account). */
export async function patchFamilyEvents(
  projectId: string,
  familyId: string,
  token: string,
  events: {
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
  }[],
): Promise<void> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/families/${encodeURIComponent(familyId)}` +
    `?updateMask.fieldPaths=events&updateMask.fieldPaths=updatedAt`;

  const body = {
    fields: {
      events: { arrayValue: { values: events.map(eventToFsValue) } },
      updatedAt: { stringValue: new Date().toISOString() },
    },
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Firestore PATCH events ${res.status}: ${await res.text()}`);
}
