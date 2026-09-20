/** Minimal Firestore REST helpers for family screenTime updates. */

export type FsValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields?: Record<string, FsValue> } }
  | { arrayValue: { values?: FsValue[] } };

export type FsDoc = { name?: string; fields?: Record<string, FsValue>; updateTime?: string };

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
  category?: string;
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
      category: str(fields.category),
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
  category?: string;
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
  if (ev.category) fields.category = { stringValue: ev.category };
  return { mapValue: { fields } };
}

/** Thrown when a conditional write loses the race — caller should re-fetch and retry. */
export class PreconditionFailedError extends Error {
  constructor() {
    super('Family doc changed since it was read');
    this.name = 'PreconditionFailedError';
  }
}

export type PatchableEvent = {
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

/**
 * Replace the entire events array on the family doc (service account).
 * When expectedUpdateTime is given, the write is conditional on the doc not
 * having changed since it was read (Firestore's currentDocument.updateTime
 * precondition) — throws PreconditionFailedError on a lost race instead of
 * silently overwriting a concurrent change (another device's CalDAV write,
 * or the web app's own persist()). Pass undefined for an unconditional
 * write — only mutateFamilyEvents below should do that, and only because
 * it re-reads fresh on every attempt anyway.
 */
export async function patchFamilyEvents(
  projectId: string,
  familyId: string,
  token: string,
  events: PatchableEvent[],
  expectedUpdateTime?: string,
): Promise<void> {
  let url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/families/${encodeURIComponent(familyId)}` +
    `?updateMask.fieldPaths=events&updateMask.fieldPaths=updatedAt`;
  if (expectedUpdateTime) {
    url += `&currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`;
  }

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
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('FAILED_PRECONDITION')) throw new PreconditionFailedError();
    throw new Error(`Firestore PATCH events ${res.status}: ${text}`);
  }
}

/**
 * Safely apply a mutation to the family's events array: read the current
 * doc, run `mutate` over the current events, write back conditionally on
 * the doc not having changed since the read. If another writer wins the
 * race, re-fetch and retry rather than clobbering it.
 */
export async function mutateFamilyEvents(
  projectId: string,
  familyId: string,
  token: string,
  mutate: (current: PatchableEvent[]) => PatchableEvent[],
  maxAttempts = 4,
): Promise<PatchableEvent[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const doc = await getFamilyDoc(projectId, familyId, token);
    const current: PatchableEvent[] = readEvents(doc).map((ev) => ({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      allDay: ev.allDay,
      memberId: ev.memberIds?.[0],
      memberIds: ev.memberIds || [],
      recurrence: ev.recurrence,
      recurrenceUntil: ev.recurrenceUntil,
      exceptionDates: ev.exceptionDates,
      location: ev.location,
      notes: ev.notes,
      category: ev.category,
    }));
    const next = mutate(current);
    try {
      await patchFamilyEvents(projectId, familyId, token, next, doc.updateTime);
      return next;
    } catch (e) {
      if (e instanceof PreconditionFailedError) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not save event — too much concurrent activity, try again');
}


/** Todo shape for CalDAV VTODO. */
export type FeedTodo = {
  id: string;
  text: string;
  memberId: string;
  createdById: string;
  completed: boolean;
  priority: number;
  createdAt: string;
  dueAt?: string;
  status?: string;
  lastCompletedAt?: string;
};

export function readTodos(doc: FsDoc): FeedTodo[] {
  const f = doc.fields?.todos;
  if (!f || !('arrayValue' in f)) return [];
  const out: FeedTodo[] = [];
  for (const v of f.arrayValue.values || []) {
    if (!('mapValue' in v)) continue;
    const fields = v.mapValue.fields || {};
    const id = str(fields.id);
    const text = str(fields.text);
    if (!id || !text) continue;
    const completed =
      'booleanValue' in (fields.completed || {})
        ? (fields.completed as { booleanValue: boolean }).booleanValue
        : false;
    out.push({
      id,
      text,
      memberId: str(fields.memberId) || '',
      createdById: str(fields.createdById) || '',
      completed,
      priority: int(fields.priority) ?? 0,
      createdAt: str(fields.createdAt) || new Date().toISOString(),
      dueAt: str(fields.dueAt),
      status: str(fields.status),
      lastCompletedAt: str(fields.lastCompletedAt),
    });
  }
  return out;
}

function todoToFsValue(t: FeedTodo): FsValue {
  const fields: Record<string, FsValue> = {
    id: { stringValue: t.id },
    text: { stringValue: t.text },
    memberId: { stringValue: t.memberId },
    createdById: { stringValue: t.createdById || t.memberId },
    completed: { booleanValue: !!t.completed },
    priority: { integerValue: String(t.priority || 0) },
    createdAt: { stringValue: t.createdAt || new Date().toISOString() },
  };
  if (t.dueAt) fields.dueAt = { stringValue: t.dueAt };
  if (t.status) fields.status = { stringValue: t.status };
  if (t.lastCompletedAt) fields.lastCompletedAt = { stringValue: t.lastCompletedAt };
  return { mapValue: { fields } };
}

export async function patchFamilyTodos(
  projectId: string,
  familyId: string,
  token: string,
  todos: FeedTodo[],
  expectedUpdateTime?: string,
): Promise<void> {
  let url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/families/${encodeURIComponent(familyId)}` +
    `?updateMask.fieldPaths=todos&updateMask.fieldPaths=updatedAt`;
  if (expectedUpdateTime) {
    url += `&currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`;
  }

  const body = {
    fields: {
      todos: { arrayValue: { values: todos.map(todoToFsValue) } },
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
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('FAILED_PRECONDITION')) throw new PreconditionFailedError();
    throw new Error(`Firestore PATCH todos ${res.status}: ${text}`);
  }
}

/** Same race-safe pattern as mutateFamilyEvents, for the todos array. */
export async function mutateFamilyTodos(
  projectId: string,
  familyId: string,
  token: string,
  mutate: (current: FeedTodo[]) => FeedTodo[],
  maxAttempts = 4,
): Promise<FeedTodo[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const doc = await getFamilyDoc(projectId, familyId, token);
    const current = readTodos(doc);
    const next = mutate(current);
    try {
      await patchFamilyTodos(projectId, familyId, token, next, doc.updateTime);
      return next;
    } catch (e) {
      if (e instanceof PreconditionFailedError) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Could not save task — too much concurrent activity, try again');
}

/** settings.calendarMemberTokens map: memberId → token */
export function readCalendarMemberTokens(doc: FsDoc): Record<string, string> {
  const settings = doc.fields?.settings;
  if (!settings || !('mapValue' in settings)) return {};
  const field = settings.mapValue.fields?.calendarMemberTokens;
  if (!field || !('mapValue' in field)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(field.mapValue.fields || {})) {
    const s = str(v);
    if (s) out[k] = s;
  }
  return out;
}
