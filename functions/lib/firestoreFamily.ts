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

export type MemberLite = { id: string; role?: string; embyUserId?: string; name?: string };

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
    });
  }
  return out;
}

export type LiveSession = {
  memberId: string;
  startedAt: number; // ms
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
    out[k] = {
      memberId,
      startedAt,
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
