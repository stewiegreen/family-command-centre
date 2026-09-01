/**
 * ChoreQuest weekly cycle — idempotent, late-safe rollover.
 * Runs on client when the app/page loads; no server clock required.
 */
import type {
  CoinLedgerEntry,
  FamilyData,
  MemberProgress,
  WeekState,
} from '../types';
import { ensureProgress, getChoreQuestConfig, isoWeekId, levelFromXp, progressTowardNextLevel } from './quest';
import type { ChoreQuestConfig } from '../types';

/** Approved weekday quests needed for the Weekend Chest. */
export const STREAK_TARGET = 5;
/** Chest payout. */
export const STREAK_COINS = 40;
export const STREAK_XP = 30;
/** Interest on unspent coins at week close. */
export const INTEREST_RATE = 0.1;
export const INTEREST_MIN_BALANCE = 10;
/** Shared house-inspection bonus per kid. */
export const INSPECTION_COINS = 25;
export const INSPECTION_XP = 15;

export function isWeekday(d = new Date()): boolean {
  const day = d.getDay(); // 0 Sun … 6 Sat
  return day >= 1 && day <= 5;
}

/** Compare ISO week ids like "2026-W36". */
export function weekIdLess(a: string, b: string): boolean {
  return a < b;
}

export function emptyWeekState(weekId: string): WeekState {
  return {
    weekId,
    weekdayCompletions: {},
    streakClaimed: {},
    interestPaid: {},
    inspectionPaid: {},
  };
}

function kidIds(data: FamilyData): string[] {
  return (data.members || []).filter((m) => m.role === 'kid').map((m) => m.id);
}

function appendLedger(
  existing: CoinLedgerEntry[] | undefined,
  entry: CoinLedgerEntry,
): CoinLedgerEntry[] {
  // Deterministic id → skip duplicate
  const list = existing || [];
  if (list.some((e) => e.id === entry.id)) return list;
  return [entry, ...list].slice(0, 200);
}

function addXp(
  progress: Record<string, MemberProgress> | undefined,
  memberId: string,
  xpGain: number,
): Record<string, MemberProgress> {
  const prev = ensureProgress(progress?.[memberId]);
  const xp = prev.xp + xpGain;
  return {
    ...(progress || {}),
    [memberId]: { xp, level: levelFromXp(xp) },
  };
}

function addCoins(
  balances: Record<string, number> | undefined,
  memberId: string,
  delta: number,
): Record<string, number> {
  return {
    ...(balances || {}),
    [memberId]: (balances?.[memberId] ?? 0) + delta,
  };
}

/**
 * Close a single past week: pay interest, late streak chests, inspection bonuses.
 * Fully idempotent via per-member flags + deterministic ledger ids.
 */
export function closeWeek(
  data: FamilyData,
  ws: WeekState,
  byId: string,
  at: string,
): FamilyData {
  const cfg = getChoreQuestConfig(data);
  let memberProgress = data.memberProgress || {};
  let coinBalances = { ...(data.coinBalances || {}) };
  let coinLedger = data.coinLedger || [];
  const streakClaimed = { ...(ws.streakClaimed || {}) };
  const interestPaid = { ...(ws.interestPaid || {}) };
  const inspectionPaid = { ...(ws.inspectionPaid || {}) };
  const kids = kidIds(data);

  for (const memberId of kids) {
    // --- Interest ---
    if (!interestPaid[memberId]) {
      const bal = coinBalances[memberId] ?? 0;
      if (bal >= cfg.interestMinBalance) {
        const payout = Math.floor(bal * cfg.interestRate);
        if (payout > 0) {
          const entry: CoinLedgerEntry = {
            id: `interest:${ws.weekId}:${memberId}`,
            memberId,
            delta: payout,
            reason: 'interest',
            label: `Savings interest (${ws.weekId})`,
            byId,
            at,
            weekId: ws.weekId,
          };
          coinLedger = appendLedger(coinLedger, entry);
          // Only credit if entry was new
          if (coinLedger[0]?.id === entry.id) {
            coinBalances = addCoins(coinBalances, memberId, payout);
          }
        }
      }
      interestPaid[memberId] = true;
    }

    // --- Late streak chest ---
    const completions = ws.weekdayCompletions?.[memberId] ?? 0;
    if (completions >= cfg.streakTarget && !streakClaimed[memberId]) {
      const entry: CoinLedgerEntry = {
        id: `streak:${ws.weekId}:${memberId}`,
        memberId,
        delta: cfg.streakCoins,
        reason: 'streak_chest',
        label: `Weekend Chest (${ws.weekId})`,
        byId,
        at,
        weekId: ws.weekId,
      };
      coinLedger = appendLedger(coinLedger, entry);
      if (coinLedger[0]?.id === entry.id) {
        coinBalances = addCoins(coinBalances, memberId, cfg.streakCoins);
        memberProgress = addXp(memberProgress, memberId, cfg.streakXp);
      }
      streakClaimed[memberId] = true;
    }

    // --- House inspection (shared) ---
    if (ws.houseInspectionPassed && !inspectionPaid[memberId]) {
      const entry: CoinLedgerEntry = {
        id: `inspect:${ws.weekId}:${memberId}`,
        memberId,
        delta: cfg.inspectionCoins,
        reason: 'house_inspection',
        label: `House inspection passed (${ws.weekId})`,
        byId,
        at,
        weekId: ws.weekId,
      };
      coinLedger = appendLedger(coinLedger, entry);
      if (coinLedger[0]?.id === entry.id) {
        coinBalances = addCoins(coinBalances, memberId, cfg.inspectionCoins);
        memberProgress = addXp(memberProgress, memberId, cfg.inspectionXp);
      }
      inspectionPaid[memberId] = true;
    }
  }

  return {
    ...data,
    memberProgress,
    coinBalances,
    coinLedger,
    weekState: {
      ...ws,
      streakClaimed,
      interestPaid,
      inspectionPaid,
    },
  };
}

/**
 * Ensure weekState matches the current local ISO week.
 * Closes any past week(s) exactly once, then opens the current week.
 * Safe to call on every page load / focus.
 */
export function ensureWeekRollover(data: FamilyData, byId: string): FamilyData {
  const current = isoWeekId();
  const at = new Date().toISOString();
  let next = data;
  let ws = next.weekState;

  if (!ws || !ws.weekId) {
    return { ...next, weekState: emptyWeekState(current) };
  }

  // Same week — nothing to close
  if (ws.weekId === current) {
    return next;
  }

  // Close past weeks in order (usually just one). Cap at 8 to avoid long loops.
  let guard = 0;
  while (ws && weekIdLess(ws.weekId, current) && guard < 8) {
    next = closeWeek(next, ws, byId, at);
    // Advance to the numerically next week id is hard without a calendar lib;
    // after closing once, jump straight to current if still behind.
    ws = next.weekState!;
    if (ws.weekId === current) break;
    // Mark closed week done by opening current (we only fully settle the
    // immediate previous week in detail; older quiet weeks get one close pass).
    if (guard === 0 && weekIdLess(ws.weekId, current)) {
      // First past week fully closed above; subsequent skips just open current.
      next = {
        ...next,
        weekState: emptyWeekState(current),
      };
      ws = next.weekState!;
      break;
    }
    guard += 1;
  }

  if (!next.weekState || next.weekState.weekId !== current) {
    next = { ...next, weekState: emptyWeekState(current) };
  }

  return next;
}

/** Record an approved quest toward this week's weekday streak (Mon–Fri only). */
export function recordWeekdayCompletion(
  data: FamilyData,
  memberId: string,
  approvedAt = new Date(),
): FamilyData {
  if (!isWeekday(approvedAt)) return data;
  const current = isoWeekId(approvedAt);
  let ws = data.weekState;
  if (!ws || ws.weekId !== current) {
    // Rollover should have run; if not, start current week without closing here.
    ws = emptyWeekState(current);
  }
  const prev = ws.weekdayCompletions?.[memberId] ?? 0;
  return {
    ...data,
    weekState: {
      ...ws,
      weekdayCompletions: {
        ...(ws.weekdayCompletions || {}),
        [memberId]: prev + 1,
      },
    },
  };
}

/** In-week claim of the Weekend Chest (idempotent). */
export function claimStreakChest(
  data: FamilyData,
  memberId: string,
  byId: string,
): { data: FamilyData; ok: boolean; error?: string } {
  const current = isoWeekId();
  const ws = data.weekState;
  if (!ws || ws.weekId !== current) {
    return { data, ok: false, error: 'Week not ready' };
  }
  const cfg = getChoreQuestConfig(data);
  const completions = ws.weekdayCompletions?.[memberId] ?? 0;
  if (completions < cfg.streakTarget) {
    return { data, ok: false, error: `Need ${cfg.streakTarget} weekday quests` };
  }
  if (ws.streakClaimed?.[memberId]) {
    return { data, ok: false, error: 'Already claimed' };
  }

  const at = new Date().toISOString();
  const entry: CoinLedgerEntry = {
    id: `streak:${ws.weekId}:${memberId}`,
    memberId,
    delta: cfg.streakCoins,
    reason: 'streak_chest',
    label: `Weekend Chest (${ws.weekId})`,
    byId,
    at,
    weekId: ws.weekId,
  };

  let coinLedger = appendLedger(data.coinLedger, entry);
  let coinBalances = data.coinBalances || {};
  let memberProgress = data.memberProgress || {};
  if (coinLedger[0]?.id === entry.id) {
    coinBalances = addCoins(coinBalances, memberId, cfg.streakCoins);
    memberProgress = addXp(memberProgress, memberId, cfg.streakXp);
  }

  return {
    ok: true,
    data: {
      ...data,
      coinBalances,
      coinLedger,
      memberProgress,
      weekState: {
        ...ws,
        streakClaimed: { ...(ws.streakClaimed || {}), [memberId]: true },
      },
    },
  };
}

/** Parent marks house inspection passed for the current week. */
export function markHouseInspection(
  data: FamilyData,
  byId: string,
): FamilyData {
  const current = isoWeekId();
  let ws = data.weekState;
  if (!ws || ws.weekId !== current) {
    ws = emptyWeekState(current);
  }
  if (ws.houseInspectionPassed) return data;

  const at = new Date().toISOString();
  let next: FamilyData = {
    ...data,
    weekState: {
      ...ws,
      houseInspectionPassed: true,
      houseInspectionAt: at,
      houseInspectionById: byId,
      inspectionPaid: { ...(ws.inspectionPaid || {}) },
    },
  };

  // Pay immediately so kids see the bonus without waiting for week close.
  const cfg = getChoreQuestConfig(next);
  const kids = kidIds(next);
  let coinBalances = { ...(next.coinBalances || {}) };
  let coinLedger = next.coinLedger || [];
  let memberProgress = next.memberProgress || {};
  const inspectionPaid = { ...(next.weekState!.inspectionPaid || {}) };

  for (const memberId of kids) {
    if (inspectionPaid[memberId]) continue;
    const entry: CoinLedgerEntry = {
      id: `inspect:${current}:${memberId}`,
      memberId,
      delta: cfg.inspectionCoins,
      reason: 'house_inspection',
      label: `House inspection passed (${current})`,
      byId,
      at,
      weekId: current,
    };
    coinLedger = appendLedger(coinLedger, entry);
    if (coinLedger[0]?.id === entry.id) {
      coinBalances = addCoins(coinBalances, memberId, cfg.inspectionCoins);
      memberProgress = addXp(memberProgress, memberId, cfg.inspectionXp);
    }
    inspectionPaid[memberId] = true;
  }

  return {
    ...next,
    coinBalances,
    coinLedger,
    memberProgress,
    weekState: {
      ...next.weekState!,
      inspectionPaid,
    },
  };
}

/** Projected interest if balance is held until week close. */
export function projectedInterest(
  balance: number,
  cfg?: ChoreQuestConfig | null,
): number {
  const c = cfg || DEFAULT_CONFIG_FALLBACK();
  if (balance < c.interestMinBalance) return 0;
  return Math.floor(balance * c.interestRate);
}

function DEFAULT_CONFIG_FALLBACK(): ChoreQuestConfig {
  return getChoreQuestConfig(null);
}

/** Days until next Monday 00:00 local (interest / new week). */
export function daysUntilWeekEnd(now = new Date()): number {
  const day = now.getDay(); // 0 Sun
  // Next Monday: if Mon(1)..Sun(0), days until next Monday after this week ends Sunday
  // Week ends Sunday night → Monday rollover. Days remaining including today-ish:
  if (day === 0) return 0; // Sunday — rollover imminent / today
  return 8 - day; // Mon=7 … Sat=2 — show days until Monday
}

export function streakStatus(
  ws: WeekState | undefined,
  memberId: string,
  cfg?: ChoreQuestConfig | null,
): {
  completions: number;
  target: number;
  ready: boolean;
  claimed: boolean;
} {
  const target = (cfg || DEFAULT_CONFIG_FALLBACK()).streakTarget;
  const completions = ws?.weekdayCompletions?.[memberId] ?? 0;
  const claimed = !!ws?.streakClaimed?.[memberId];
  return {
    completions,
    target,
    ready: completions >= target && !claimed,
    claimed,
  };
}

// re-export for UI convenience
export { progressTowardNextLevel };
