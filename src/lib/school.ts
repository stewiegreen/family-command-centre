import type {
  CalendarEvent,
  FamilyData,
  StudyBlock,
  StudyConfig,
  StudyDayPlan,
  StudyStreak,
  StudySubject,
  StudyTemplate,
  StudyTemplateItem,
} from '../types';
import { ensureProgress, isoWeekId, progressTowardNextLevel } from './quest';
import { uid } from './uid';

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
  streakBonusXp: 5,
  streakBonusCoins: 2,
};

export function ensureStudySubjects(existing?: StudySubject[] | null): StudySubject[] {
  if (existing && existing.length > 0) return existing;
  return DEFAULT_STUDY_SUBJECTS.map((s) => ({ ...s }));
}

export function ensureStudyConfig(c?: StudyConfig | null): StudyConfig {
  return {
    dayBonusXp: c?.dayBonusXp ?? DEFAULT_STUDY_CONFIG.dayBonusXp,
    dayBonusCoins: c?.dayBonusCoins ?? DEFAULT_STUDY_CONFIG.dayBonusCoins,
    streakBonusXp: c?.streakBonusXp ?? DEFAULT_STUDY_CONFIG.streakBonusXp,
    streakBonusCoins: c?.streakBonusCoins ?? DEFAULT_STUDY_CONFIG.streakBonusCoins,
  };
}

export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Previous local calendar date YYYY-MM-DD. */
export function prevLocalDate(date: string): string {
  const [y, mo, d] = date.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() - 1);
  return localDateStr(dt);
}

function parseLocalDateTime(date: string, time: string): Date {
  const [hh, mm] = time.split(':').map((x) => parseInt(x, 10));
  const [y, mo, d] = date.split('-').map((x) => parseInt(x, 10));
  return new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
}

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
    const s = parseLocalDateTime(block.date, '10:00');
    const e = new Date(s.getTime() + block.minutes * 60_000);
    start = s.toISOString();
    end = e.toISOString();
  } else {
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

export function dayPlanId(kidId: string, date: string): string {
  return `${kidId}:${date}`;
}

export function getDayPlan(
  data: FamilyData,
  kidId: string,
  date: string,
): StudyDayPlan {
  const id = dayPlanId(kidId, date);
  const found = (data.studyDayPlans || []).find((p) => p.id === id);
  return found || { id, kidId, date, pickCount: 0 };
}

/** Required = not in choice pool. Choice pool must finish pickCount. */
export function dayCompletionState(
  data: FamilyData,
  kidId: string,
  date: string,
): {
  required: StudyBlock[];
  choice: StudyBlock[];
  pickCount: number;
  requiredDone: boolean;
  choiceDone: boolean;
  complete: boolean;
  doneCount: number;
  totalNeeded: number;
} {
  const blocks = blocksForKidDate(data, kidId, date);
  const required = blocks.filter((b) => !b.choicePool);
  const choice = blocks.filter((b) => b.choicePool);
  const pickCount = Math.min(getDayPlan(data, kidId, date).pickCount ?? 0, choice.length);
  const requiredDone = required.every((b) => b.status === 'done');
  const choiceFinished = choice.filter((b) => b.status === 'done').length;
  const choiceDone = choiceFinished >= pickCount;
  const doneCount =
    required.filter((b) => b.status === 'done').length + Math.min(choiceFinished, pickCount);
  const totalNeeded = required.length + pickCount;
  return {
    required,
    choice,
    pickCount,
    requiredDone,
    choiceDone,
    complete: blocks.length > 0 && requiredDone && choiceDone,
    doneCount,
    totalNeeded,
  };
}

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
          ? {
              ...b,
              status: 'pending' as const,
              submittedAt: at,
              submittedById: byId,
              updatedAt: at,
            }
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

function updateStreak(data: FamilyData, kidId: string, date: string): {
  data: FamilyData;
  streak: number;
  continued: boolean;
} {
  const prev: StudyStreak | undefined = data.studyStreaks?.[kidId];
  const yesterday = prevLocalDate(date);
  let current = 1;
  let continued = false;
  if (prev?.lastDate === date) {
    current = prev.current;
    continued = prev.current > 1;
  } else if (prev?.lastDate === yesterday) {
    current = (prev.current || 0) + 1;
    continued = current > 1;
  } else {
    current = 1;
    continued = false;
  }
  return {
    data: {
      ...data,
      studyStreaks: {
        ...(data.studyStreaks || {}),
        [kidId]: { current, lastDate: date },
      },
    },
    streak: current,
    continued,
  };
}

export function maybeGrantDayBonus(
  data: FamilyData,
  kidId: string,
  date: string,
  byId: string,
): FamilyData {
  const state = dayCompletionState(data, kidId, date);
  if (!state.complete) return data;
  if (dayBonusAlreadyGranted(data, kidId, date)) return data;

  const cfg = ensureStudyConfig(data.studyConfig);
  let next = data;
  const streakResult = updateStreak(next, kidId, date);
  next = streakResult.data;

  let xp = cfg.dayBonusXp ?? 0;
  let coins = cfg.dayBonusCoins ?? 0;
  if (streakResult.continued) {
    xp += cfg.streakBonusXp ?? 0;
    coins += cfg.streakBonusCoins ?? 0;
  }
  if (xp <= 0 && coins <= 0) return next;

  const label =
    streakResult.streak > 1
      ? `School day complete · ${date} · ${streakResult.streak}-day streak`
      : `School day complete · ${date}`;

  return creditStudy(
    next,
    kidId,
    xp,
    coins,
    'study_day_bonus',
    label,
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
    .sort(
      (a, b) =>
        (a.sort ?? 0) - (b.sort ?? 0) ||
        (a.startTime || '').localeCompare(b.startTime || '') ||
        a.title.localeCompare(b.title),
    );
}

/** Clone all blocks from one day onto another (fresh open status). */
export function copyDayBlocks(
  data: FamilyData,
  kidId: string,
  fromDate: string,
  toDate: string,
  byId: string,
): FamilyData {
  if (fromDate === toDate) return data;
  const source = blocksForKidDate(data, kidId, fromDate);
  if (source.length === 0) return data;
  const subjects = ensureStudySubjects(data.studySubjects);
  const now = new Date().toISOString();
  let next: FamilyData = {
    ...data,
    // Remove existing blocks on target day for this kid (replace)
    studyBlocks: (data.studyBlocks || []).filter(
      (b) => !(b.kidId === kidId && b.date === toDate),
    ),
  };
  // Drop calendar events for removed target blocks
  const removed = (data.studyBlocks || []).filter((b) => b.kidId === kidId && b.date === toDate);
  for (const r of removed) {
    const eid = r.calendarEventId || `study-${r.id}`;
    next = { ...next, events: (next.events || []).filter((e) => e.id !== eid) };
  }

  for (const s of source) {
    const block: StudyBlock = {
      id: uid(),
      kidId,
      date: toDate,
      title: s.title,
      subjectId: s.subjectId,
      startTime: s.startTime,
      endTime: s.endTime,
      minutes: s.minutes,
      xp: s.xp,
      coins: s.coins,
      status: 'open',
      requiresApproval: s.requiresApproval,
      choicePool: s.choicePool,
      sort: s.sort,
      notes: s.notes,
      createdById: byId,
      createdAt: now,
      updatedAt: now,
    };
    next = {
      ...next,
      studyBlocks: [...(next.studyBlocks || []), block],
    };
    next = upsertBlockCalendar(next, block, subjects);
  }

  // Copy pickCount plan
  const fromPlan = getDayPlan(data, kidId, fromDate);
  const toId = dayPlanId(kidId, toDate);
  const plans = (next.studyDayPlans || []).filter((p) => p.id !== toId);
  plans.push({
    id: toId,
    kidId,
    date: toDate,
    pickCount: fromPlan.pickCount ?? 0,
  });
  next = { ...next, studyDayPlans: plans };
  return next;
}

/** Copy Mon–Fri pattern: from week's Monday onto target week's Monday–Friday. */
export function weekDatesFrom(dateInWeek: string): string[] {
  const [y, mo, d] = dateInWeek.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, mo - 1, d);
  const day = dt.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + mondayOffset);
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = new Date(dt);
    x.setDate(dt.getDate() + i);
    out.push(localDateStr(x));
  }
  return out;
}

export function copyWeekBlocks(
  data: FamilyData,
  kidId: string,
  fromDateInWeek: string,
  toDateInWeek: string,
  byId: string,
): FamilyData {
  const fromDays = weekDatesFrom(fromDateInWeek);
  const toDays = weekDatesFrom(toDateInWeek);
  let next = data;
  for (let i = 0; i < 5; i++) {
    next = copyDayBlocks(next, kidId, fromDays[i]!, toDays[i]!, byId);
  }
  return next;
}

export function saveTemplateFromDay(
  data: FamilyData,
  kidId: string,
  date: string,
  name: string,
): FamilyData {
  const blocks = blocksForKidDate(data, kidId, date);
  if (blocks.length === 0) return data;
  const now = new Date().toISOString();
  const items: StudyTemplateItem[] = blocks.map((b, i) => ({
    title: b.title,
    subjectId: b.subjectId,
    startTime: b.startTime,
    endTime: b.endTime,
    minutes: b.minutes,
    xp: b.xp,
    coins: b.coins,
    requiresApproval: b.requiresApproval,
    choicePool: b.choicePool,
    notes: b.notes,
    sort: b.sort ?? i,
  }));
  const tpl: StudyTemplate = {
    id: uid(),
    name: name.trim() || `Template ${date}`,
    kidId,
    items,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...data,
    studyTemplates: [...(data.studyTemplates || []), tpl],
  };
}

export function applyTemplateToDay(
  data: FamilyData,
  templateId: string,
  kidId: string,
  date: string,
  byId: string,
  replace = true,
): FamilyData {
  const tpl = (data.studyTemplates || []).find((t) => t.id === templateId);
  if (!tpl) return data;
  const subjects = ensureStudySubjects(data.studySubjects);
  const now = new Date().toISOString();
  let next: FamilyData = data;
  if (replace) {
    const removed = (data.studyBlocks || []).filter((b) => b.kidId === kidId && b.date === date);
    next = {
      ...data,
      studyBlocks: (data.studyBlocks || []).filter(
        (b) => !(b.kidId === kidId && b.date === date),
      ),
    };
    for (const r of removed) {
      const eid = r.calendarEventId || `study-${r.id}`;
      next = { ...next, events: (next.events || []).filter((e) => e.id !== eid) };
    }
  }
  for (let i = 0; i < tpl.items.length; i++) {
    const s = tpl.items[i]!;
    const block: StudyBlock = {
      id: uid(),
      kidId,
      date,
      title: s.title,
      subjectId: s.subjectId,
      startTime: s.startTime,
      endTime: s.endTime,
      minutes: s.minutes,
      xp: s.xp,
      coins: s.coins,
      status: 'open',
      requiresApproval: s.requiresApproval,
      choicePool: s.choicePool,
      sort: s.sort ?? i,
      notes: s.notes,
      createdById: byId,
      createdAt: now,
      updatedAt: now,
    };
    next = {
      ...next,
      studyBlocks: [...(next.studyBlocks || []), block],
    };
    next = upsertBlockCalendar(next, block, subjects);
  }
  return next;
}

export function setDayPickCount(
  data: FamilyData,
  kidId: string,
  date: string,
  pickCount: number,
): FamilyData {
  const id = dayPlanId(kidId, date);
  const plans = (data.studyDayPlans || []).filter((p) => p.id !== id);
  plans.push({ id, kidId, date, pickCount: Math.max(0, Math.floor(pickCount)) });
  return { ...data, studyDayPlans: plans };
}
