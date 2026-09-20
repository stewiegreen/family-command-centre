/**
 * Pure helpers for the temporary Coin Math debug page.
 * Ledger is the intended source of truth; balances can drift when ledger is truncated.
 */
import type { CoinLedgerEntry, FamilyData, Member, RedemptionRecord } from '../types';

export const LEDGER_CAP = 200;

export type ReasonTotals = Record<string, { count: number; sum: number }>;

export function memberLedger(
  ledger: CoinLedgerEntry[] | undefined,
  memberId: string,
): CoinLedgerEntry[] {
  return (ledger || [])
    .filter((e) => e.memberId === memberId)
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Sum of deltas in the *retained* ledger for one member. */
export function ledgerSum(entries: CoinLedgerEntry[]): number {
  return entries.reduce((s, e) => s + (Number(e.delta) || 0), 0);
}

export function storedBalance(data: FamilyData, memberId: string): number {
  return data.coinBalances?.[memberId] ?? 0;
}

export function totalsByReason(entries: CoinLedgerEntry[]): ReasonTotals {
  const out: ReasonTotals = {};
  for (const e of entries) {
    const key = e.reason || 'unknown';
    if (!out[key]) out[key] = { count: 0, sum: 0 };
    out[key].count += 1;
    out[key].sum += Number(e.delta) || 0;
  }
  return out;
}

export function totalsEarnedSpent(entries: CoinLedgerEntry[]): {
  earned: number;
  spent: number;
  net: number;
} {
  let earned = 0;
  let spent = 0;
  for (const e of entries) {
    const d = Number(e.delta) || 0;
    if (d >= 0) earned += d;
    else spent += d;
  }
  return { earned, spent, net: earned + spent };
}

export type MemberCoinReport = {
  memberId: string;
  name: string;
  role: string;
  stored: number;
  fromLedger: number;
  drift: number;
  entryCount: number;
  byReason: ReasonTotals;
  earned: number;
  spent: number;
  entries: CoinLedgerEntry[];
  redemptions: RedemptionRecord[];
};

export function buildMemberReport(
  data: FamilyData,
  member: Member,
): MemberCoinReport {
  const entries = memberLedger(data.coinLedger, member.id);
  const stored = storedBalance(data, member.id);
  const fromLedger = ledgerSum(entries);
  const { earned, spent } = totalsEarnedSpent(entries);
  const redemptions = (data.redemptions || [])
    .filter((r) => r.memberId === member.id)
    .slice()
    .sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  return {
    memberId: member.id,
    name: member.name,
    role: member.role,
    stored,
    fromLedger,
    drift: stored - fromLedger,
    entryCount: entries.length,
    byReason: totalsByReason(entries),
    earned,
    spent,
    entries,
    redemptions,
  };
}

export function familyReports(data: FamilyData): MemberCoinReport[] {
  const members = data.members || [];
  // Kids first, then others who have any coin activity
  const kids = members.filter((m) => m.role === 'kid');
  const others = members.filter((m) => m.role !== 'kid');
  const reports = [...kids, ...others]
    .map((m) => buildMemberReport(data, m))
    .filter((r) => r.role === 'kid' || r.entryCount > 0 || r.stored !== 0);
  return reports;
}

/** Set stored balance to ledger sum without a new ledger row (debug repair). */
export function setBalanceToLedgerSum(data: FamilyData, memberId: string): FamilyData {
  const sum = Math.max(0, ledgerSum(memberLedger(data.coinLedger, memberId)));
  return {
    ...data,
    coinBalances: {
      ...(data.coinBalances || {}),
      [memberId]: sum,
    },
  };
}

export const REASON_HELP: Record<string, string> = {
  quest: 'Parent approved a ChoreQuest (+coins from quest xp/coins fields or difficulty defaults).',
  streak_chest: 'Weekend chest after enough weekday quest approvals.',
  interest: 'Week rollover interest on unspent coins (if balance ≥ threshold).',
  house_inspection: 'Parent passed house inspection bonus.',
  redeem: 'Shop purchase (usually negative). Coins leave when redeemed, not when fulfilled.',
  adjust: 'Manual parent adjust on Rates tab (or rebuild).',
  study: 'School study block credit.',
  study_day_bonus: 'School day-complete bonus.',
};

export const KNOWN_PITFALLS: string[] = [
  `coinLedger is capped at ${LEDGER_CAP} family-wide rows (oldest drop off). Ledger sum can be lower than the true lifetime total, so "drift" is expected if the family is active.`,
  'Stored coinBalances is what the UI spends against. If a write updated balance but failed to append ledger (or the reverse), numbers diverge.',
  'Shop spends use reason "redeem" and should be negative. If you see spend without a matching redeem row, the balance may have been changed without a ledger entry.',
  'Quest credits only land on parent Approve — submitting a quest does not add coins.',
  'Screen-time bank is separate (screenTime / screenTimeLog). Buying screen time spends coins and adds minutes; using the timer spends minutes, not coins.',
  'Week rollover can add interest + chest + inspection in one pass; each should appear as its own ledger row with a stable id (idempotent).',
];
