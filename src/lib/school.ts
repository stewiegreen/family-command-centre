import type {
  CalendarEvent,
  FamilyData,
  StudyBlock,
  StudyConfig,
  StudySubject,
} from '../types';
import { ensureProgress, isoWeekId, progressTowardNextLevel } from './quest';

export const DEFAULT_STUDY_SUBJECTS: StudySubject[] = [
  { id: 'math', name: 'Math', color: '#3b82f6', active: true, sort: 0 },
  { id: 'reading', name: 'Reading', color: '#8b5cf6', active: true, sort: 1 },
  { id: 'writing', name: 'Writing', color: '#ec4899', active: true, sort: 2 },
  { id: 'science', name: 'Science', color: '#10b981', active: true, sort: 3 },
  { id: 'other', name: 'Other', color: '#f59e0b', active: true, sort: 4 },
];

export const DEFAULT_STUDY_CONFIG: StudyConfig = {
  dayBonusXp: 15,
  dayBonusCoins: 5,
};

export function ensureStudySubjects(existing?: StudySubject[] | null): StudySubject[] {
  if (existing && existing.length > 0) return existing;
  return DEFAULT_STUDY_SUBJECTS.map((s) => ({ ...s }));
}

export function ensureStudyConfig(c?: StudyConfig | null): StudyConfig {
  return {
    dayBonusXp: c?.dayBonusXp ?? DEFAULT_STUDY_CONFIG.dayBonusXp,
    dayBonusCoins: c?.dayBonusCoins ?? DEFAULT_STUDY_CONFIG.dayBonusCoins,
  };
}

export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateTime(date: string, time: string): Date {
  const [hh, mm] = time.split(':').map((x) => parseInt(x, 10));
  const [y, mo, d] = date.split('-').map((x) => parseInt(x, 10));
  return new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
}

/** Build / update a calendar event for a study block. */
export function calendarEventForBlock(
  block: StudyBlock,
  subjectName?: string,
): CalendarEvent {
  const title = subjectName
    ? `School — ${subjectName}: ${block.title}`
    : `School — ${block.title}`;
  const eventId = block.calendarEventId || `study-${block.id}`;

  let start: string;
  let end: string;
  let allDay = false;

  if (block.startTime && block.endTime) {
    start = parseLocalDateTime(block.date, block.startTime).toISOString();
    end = parseLocalDateTime(block.date, block.endTime).toISOString();
  } else if (block.startTime && block.minutes) {
    const s = parseLocalDateTime(block.date, block.startTime);
    const e = new Date(s.getTime() + block.minutes * 60_000);
    start = s.toISOString();
    end = e.toISOString();
  } else if (block.minutes) {
    // Default window: start 10:00 local
    const s = parseLocalDateTime(block.date, '10:00');
    const e = new Date(s.getTime() + block.minutes * 60_000);
    start = s.toISOString();
    end = e.toISOString();
  } else {
    // All-day on that date (noon → next midnight exclusive style: local noon → noon+1)
    const s = parseLocalDateTime(block.date, '12:00');
    const e = new Date(s.getTime() + 24 * 60 * 60_000);
    start = s.toISOString();
    end = e.toISOString();
    allDay = true;
  }

  return {
    id: eventId,
    title,
    start,
    end,
    allDay,
    memberId: block.kidId,
    memberIds: [block.kidId],
    notes: block.notes,
    location: undefined,
  };
}

export function upsertBlockCalendar(
  data: FamilyData,
  block: StudyBlock,
  subjects: StudySubject[],
): FamilyData {
  const sub = subjects.find((s) => s.id === block.subjectId);
  const ev = calendarEventForBlock(block, sub?.name);
  const withId: StudyBlock = { ...block, calendarEventId: ev.id };
  const events = [...(data.events || [])];
  const idx = events.findIndex((e) => e.id === ev.id);
  if (idx >= 0) events[idx] = ev;
  else events.push(ev);
  const blocks = (data.studyBlocks || []).map((b) => (b.id === withId.id ? withId : b));
  if (!blocks.some((b) => b.id === withId.id)) blocks.push(withId);
  return { ...data, events, studyBlocks: blocks };
}

export function removeBlockCalendar(data: FamilyData, block: StudyBlock): FamilyData {
  const eid = block.calendarEventId || `study-${block.id}`;
  return {
    ...data,
    events: (data.events || []).filter((e) => e.id !== eid),
    studyBlocks: (data.studyBlocks || []).filter((b) => b.id !== block.id),
  };
}

function creditStudy(
  data: FamilyData,
  memberId: string,
  xpGain: number,
  coinGain: number,
  reason: 'study' | 'study_day_bonus',
  label: string,
  refId: string,
  byId: string,
): FamilyData {
  const at = new Date().toISOString();
  const weekId = isoWeekId(new Date(at));
  const prevProg = ensureProgress(data.memberProgress?.[memberId]);
  const newXp = prevProg.xp + Math.max(0, xpGain);
  const newLevel = progressTowardNextLevel(newXp).level;
  const prevCoins = data.coinBalances?.[memberId] ?? 0;
  const ledger = {
    id: `${reason}:${refId}:${memberId}:${at}`,
    memberId,
    delta: Math.max(0, coinGain),
    reason,
    label,
    refId,
    byId,
    at,
    weekId,
  };
  return {
    ...data,
    memberProgress: {
      ...(data.memberProgress || {}),
      [memberId]: { xp: newXp, level: newLevel },
    },
    coinBalances: {
      ...(data.coinBalances || {}),
      [memberId]: prevCoins + Math.max(0, coinGain),
    },
    coinLedger: [ledger, ...(data.coinLedger || [])].slice(0, 200),
  };
}

/** Kid marks done: auto-credit or pending. */
export function completeStudyBlock(
  data: FamilyData,
  blockId: string,
  byId: string,
): FamilyData {
  const block = (data.studyBlocks || []).find((b) => b.id === blockId);
  if (!block || block.status === 'done' || block.status === 'pending') return data;
  const at = new Date().toISOString();

  if (block.requiresApproval) {
    return {
      ...data,
      studyBlocks: (data.studyBlocks || []).map((b) =>
        b.id === blockId
          ? { ...b, status: 'pending' as const, submittedAt: at, submittedById: byId, updatedAt: at }
          : b,
      ),
    };
  }

  let next: FamilyData = {
    ...data,
    studyBlocks: (data.studyBlocks || []).map((b) =>
      b.id === blockId
        ? {
            ...b,
            status: 'done' as const,
            submittedAt: at,
            submittedById: byId,
            approvedAt: at,
            approvedById: byId,
            updatedAt: at,
          }
        : b,
    ),
  };
  next = creditStudy(next, block.kidId, block.xp, block.coins, 'study', block.title, block.id, byId);
  next = maybeGrantDayBonus(next, block.kidId, block.date, byId);
  return next;
}

/** Parent approves a pending block. */
export function approveStudyBlock(
  data: FamilyData,
  blockId: string,
  parentId: string,
): FamilyData {
  const block = (data.studyBlocks || []).find((b) => b.id === blockId);
  if (!block || block.status !== 'pending') return data;
  const at = new Date().toISOString();
  let next: FamilyData = {
    ...data,
    studyBlocks: (data.studyBlocks || []).map((b) =>
      b.id === blockId
        ? {
            ...b,
            status: 'done' as const,
            approvedAt: at,
            approvedById: parentId,
            updatedAt: at,
          }
        : b,
    ),
  };
  next = creditStudy(
    next,
    block.kidId,
    block.xp,
    block.coins,
    'study',
    block.title,
    block.id,
    parentId,
  );
  next = maybeGrantDayBonus(next, block.kidId, block.date, parentId);
  return next;
}

export function reopenStudyBlock(data: FamilyData, blockId: string): FamilyData {
  const at = new Date().toISOString();
  return {
    ...data,
    studyBlocks: (data.studyBlocks || []).map((b) =>
      b.id === blockId
        ? {
            ...b,
            status: 'open' as const,
            submittedAt: undefined,
            submittedById: undefined,
            approvedAt: undefined,
            approvedById: undefined,
            updatedAt: at,
          }
        : b,
    ),
  };
}

function dayBonusAlreadyGranted(data: FamilyData, kidId: string, date: string): boolean {
  const ref = `study-day:${kidId}:${date}`;
  return (data.coinLedger || []).some(
    (e) => e.reason === 'study_day_bonus' && e.refId === ref && e.memberId === kidId,
  );
}

/** If every block for kid+date is done, grant day bonus once. */
export function maybeGrantDayBonus(
  data: FamilyData,
  kidId: string,
  date: string,
  byId: string,
): FamilyData {
  const blocks = (data.studyBlocks || []).filter((b) => b.kidId === kidId && b.date === date);
  if (blocks.length === 0) return data;
  if (!blocks.every((b) => b.status === 'done')) return data;
  if (dayBonusAlreadyGranted(data, kidId, date)) return data;

  const cfg = ensureStudyConfig(data.studyConfig);
  const xp = cfg.dayBonusXp ?? 0;
  const coins = cfg.dayBonusCoins ?? 0;
  if (xp <= 0 && coins <= 0) return data;

  return creditStudy(
    data,
    kidId,
    xp,
    coins,
    'study_day_bonus',
    `School day complete · ${date}`,
    `study-day:${kidId}:${date}`,
    byId,
  );
}

export function blocksForKidDate(
  data: FamilyData,
  kidId: string,
  date: string,
): StudyBlock[] {
  return (data.studyBlocks || [])
    .filter((b) => b.kidId === kidId && b.date === date)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || a.title.localeCompare(b.title));
}
