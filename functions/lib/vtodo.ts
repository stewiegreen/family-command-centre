/**
 * VTODO ↔ GreenHQ Todo mapping for CalDAV task lists.
 */

export type GhTodo = {
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

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

function toIcalPriority(p: number): number {
  if (p >= 3) return 1;
  if (p === 2) return 5;
  if (p === 1) return 9;
  return 0;
}

function fromIcalPriority(raw: string | undefined): number {
  if (!raw) return 0;
  const p = parseInt(raw, 10);
  if (!Number.isFinite(p) || p === 0) return 0;
  if (p <= 3) return 3;
  if (p <= 6) return 2;
  return 1;
}

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

function parseProps(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of unfold(block)) {
    if (!line || line.startsWith('BEGIN:') || line.startsWith('END:')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const keyPart = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = (keyPart.includes(';') ? keyPart.slice(0, keyPart.indexOf(';')) : keyPart).toUpperCase();
    props[name] = value;
  }
  return props;
}

/** Parse ICS datetime (Z or floating as UTC) → ISO. */
function icsToIso(value: string): string | undefined {
  const cleaned = value.replace(/\.\d+/, '');
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/i);
  if (m) {
    return new Date(
      `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`,
    ).toISOString();
  }
  const dOnly = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dOnly) {
    return `${dOnly[1]}-${dOnly[2]}-${dOnly[3]}T12:00:00.000Z`;
  }
  return undefined;
}

export function serializeVTodo(t: GhTodo): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GreenHQ//CalDAV//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTODO',
  ];
  lines.push(`UID:${t.id}`);
  lines.push(`SUMMARY:${esc(t.text)}`);
  lines.push(`CREATED:${toIcsUtc(t.createdAt || new Date().toISOString())}`);
  lines.push(`DTSTAMP:${toIcsUtc(new Date().toISOString())}`);
  if (t.dueAt) lines.push(`DUE:${toIcsUtc(t.dueAt)}`);
  const completed = t.completed || t.status === 'done';
  lines.push(`STATUS:${completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);
  if (completed) {
    lines.push('PERCENT-COMPLETE:100');
    lines.push(`COMPLETED:${toIcsUtc(t.lastCompletedAt || new Date().toISOString())}`);
  } else {
    lines.push('PERCENT-COMPLETE:0');
  }
  const pr = toIcalPriority(t.priority || 0);
  if (pr > 0) lines.push(`PRIORITY:${pr}`);
  lines.push('END:VTODO', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function parseVTodo(
  icsBody: string,
  defaultMemberId: string,
  createdById: string,
): GhTodo | null {
  const upper = icsBody.toUpperCase();
  const startIdx = upper.indexOf('BEGIN:VTODO');
  const endIdx = upper.indexOf('END:VTODO');
  if (startIdx < 0 || endIdx < 0) return null;
  const block = icsBody.slice(startIdx, endIdx + 'END:VTODO'.length);
  const props = parseProps(block);
  let uid = (props['UID'] || '').trim();
  if (!uid) uid = `todo-${Date.now()}`;
  const text = (props['SUMMARY'] || 'Task').trim();
  const status = (props['STATUS'] || '').toUpperCase();
  const percent = parseInt(props['PERCENT-COMPLETE'] || '0', 10);
  const completed = status === 'COMPLETED' || percent >= 100;
  const dueAt = props['DUE'] ? icsToIso(props['DUE'].split(';').pop() || props['DUE']) : undefined;
  const createdAt = props['CREATED']
    ? icsToIso(props['CREATED']) || new Date().toISOString()
    : new Date().toISOString();
  const lastCompletedAt = props['COMPLETED'] ? icsToIso(props['COMPLETED']) : undefined;
  return {
    id: uid,
    text,
    memberId: defaultMemberId,
    createdById,
    completed,
    priority: fromIcalPriority(props['PRIORITY']),
    createdAt,
    dueAt,
    status: completed ? 'done' : 'todo',
    lastCompletedAt,
  };
}

export function todoEtag(t: GhTodo): string {
  const raw = `${t.id}|${t.text}|${t.dueAt || ''}|${t.completed}|${t.status || ''}|${t.priority}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `"${(h >>> 0).toString(16)}"`;
}
