import type { Quest, QuestDifficulty, MemberProgress, RewardItem, ChoreQuestConfig, FamilyData } from '../types';

/** Default XP / coins by difficulty. rewardMinutes kept at 0 — screen time comes from the shop. */
export const DIFFICULTY_REWARDS: Record<
  QuestDifficulty,
  { xp: number; coins: number; rewardMinutes: number; label: string; emoji: string }
> = {
  easy: { xp: 10, coins: 5, rewardMinutes: 0, label: 'Easy', emoji: '🌱' },
  medium: { xp: 25, coins: 12, rewardMinutes: 0, label: 'Medium', emoji: '⚔️' },
  epic: { xp: 50, coins: 25, rewardMinutes: 0, label: 'Epic', emoji: '🐉' },
};

export const DIFFICULTY_ORDER: QuestDifficulty[] = ['easy', 'medium', 'epic'];

/** Cumulative XP required to *reach* level n (level 1 starts at 0). */
export function xpToReachLevel(level: number): number {
  if (level <= 1) return 0;
  // 100 * n^1.5 cumulative-ish: sum approach via closed form approximation
  // xpForLevel(n) = XP needed to go from n to n+1 = 100 * n^1.5
  let total = 0;
  for (let n = 1; n < level; n++) {
    total += Math.round(100 * Math.pow(n, 1.5));
  }
  return total;
}

/** XP needed to go from `level` → `level + 1`. */
export function xpForNextLevel(level: number): number {
  const safe = Math.max(1, level);
  return Math.round(100 * Math.pow(safe, 1.5));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level += 1;
    if (level > 99) break;
  }
  return level;
}

export function progressTowardNextLevel(xp: number): {
  level: number;
  intoLevel: number;
  needed: number;
  pct: number;
} {
  const level = levelFromXp(xp);
  const floor = xpToReachLevel(level);
  const needed = xpForNextLevel(level);
  const intoLevel = Math.max(0, xp - floor);
  const pct = needed <= 0 ? 100 : Math.min(100, Math.round((intoLevel / needed) * 100));
  return { level, intoLevel, needed, pct };
}

export function ensureProgress(p?: MemberProgress | null): MemberProgress {
  const xp = Math.max(0, p?.xp ?? 0);
  return { xp, level: levelFromXp(xp) };
}

/** ISO week id in local timezone, e.g. "2026-W36". */
export function isoWeekId(d = new Date()): string {
  // ISO week: Thursday-based year
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNo =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  const year = date.getFullYear();
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

export function rewardsForDifficulty(d: QuestDifficulty) {
  return DIFFICULTY_REWARDS[d];
}

/** Build a new open quest from title + difficulty. */
export function buildQuest(opts: {
  title: string;
  difficulty: QuestDifficulty;
  createdById: string;
  id?: string;
  xp?: number;
  coins?: number;
  config?: ChoreQuestConfig | null;
}): Quest {
  const r = rewardsForDifficultyWithConfig(opts.difficulty, opts.config);
  return {
    id: opts.id || crypto.randomUUID(),
    title: opts.title.trim(),
    difficulty: opts.difficulty,
    xp: opts.xp != null ? Math.max(0, Math.floor(opts.xp)) : r.xp,
    coins: opts.coins != null ? Math.max(0, Math.floor(opts.coins)) : r.coins,
    rewardMinutes: 0,
    status: 'open',
    createdById: opts.createdById,
    createdAt: new Date().toISOString(),
  };
}

/** Migrate a legacy chore-shaped object into a Quest. */
export function migrateChoreToQuest(c: {
  id: string;
  title: string;
  rewardMinutes?: number;
  status?: string;
  submittedById?: string;
  submittedAt?: string;
  approvedForId?: string;
  approvedById?: string;
  approvedAt?: string;
  createdById?: string;
  createdAt?: string;
  difficulty?: QuestDifficulty;
  xp?: number;
  coins?: number;
  lastCompletedById?: string;
  lastCompletedAt?: string;
  rotation?: string[];
  turnIndex?: number;
  cadence?: string;
}): Quest {
  const minutes = Math.max(0, c.rewardMinutes ?? 0);
  // Infer difficulty from legacy minutes if not set
  let difficulty: QuestDifficulty = c.difficulty || 'medium';
  if (!c.difficulty) {
    if (minutes <= 8) difficulty = 'easy';
    else if (minutes >= 25) difficulty = 'epic';
    else difficulty = 'medium';
  }
  const defaults = DIFFICULTY_REWARDS[difficulty];
  const status: Quest['status'] =
    c.status === 'pending' || c.status === 'done' || c.status === 'open' ? c.status : 'open';

  return {
    id: c.id,
    title: c.title,
    difficulty,
    xp: c.xp ?? defaults.xp,
    coins: c.coins ?? defaults.coins,
    // Screen time is shop-only; do not grant minutes on quest approval
    rewardMinutes: 0,
    status,
    submittedById: c.submittedById,
    submittedAt: c.submittedAt,
    approvedForId: c.approvedForId || c.lastCompletedById,
    approvedById: c.approvedById,
    approvedAt: c.approvedAt || c.lastCompletedAt,
    createdById: c.createdById || '',
    createdAt: c.createdAt || new Date().toISOString(),
    rotation: c.rotation,
    turnIndex: c.turnIndex,
    cadence: c.cadence as Quest['cadence'],
    lastCompletedAt: c.lastCompletedAt,
    lastCompletedById: c.lastCompletedById,
  };
}

/** Default shop catalog — seeded once when empty. */
export const DEFAULT_REWARD_CATALOG: RewardItem[] = [
  {
    id: 'weekend-pass',
    label: 'Weekend Pass',
    icon: '🎟️',
    kind: 'custom',
    coinCost: 80,
    featured: true,
    active: true,
    sort: 0,
  },
  {
    id: 'screen-15',
    label: 'Screen time · 15 min',
    icon: '📱',
    kind: 'screen_time',
    coinCost: 12,
    screenMinutes: 15,
    active: true,
    sort: 10,
  },
  {
    id: 'screen-30',
    label: 'Screen time · 30 min',
    icon: '📱',
    kind: 'screen_time',
    coinCost: 22,
    screenMinutes: 30,
    active: true,
    sort: 11,
  },
  {
    id: 'treat',
    label: 'Dessert / treat',
    icon: '🍪',
    kind: 'treat',
    coinCost: 15,
    active: true,
    sort: 20,
  },
  {
    id: 'choice',
    label: 'Choose movie or dinner',
    icon: '🎬',
    kind: 'choice',
    coinCost: 20,
    active: true,
    sort: 21,
  },
  {
    id: 'late-bed',
    label: 'Stay up 30 min late',
    icon: '🌙',
    kind: 'late_bed',
    coinCost: 25,
    active: true,
    sort: 22,
  },
  {
    id: 'allowance-5',
    label: 'Allowance $5',
    icon: '💵',
    kind: 'allowance',
    coinCost: 50,
    active: true,
    sort: 30,
  },
];

export function ensureRewardCatalog(existing?: RewardItem[] | null): RewardItem[] {
  if (existing && existing.length > 0) return existing;
  return DEFAULT_REWARD_CATALOG.map((r) => ({ ...r }));
}


export const DEFAULT_CHOREQUEST_CONFIG: ChoreQuestConfig = {
  streakTarget: 5,
  streakCoins: 40,
  streakXp: 30,
  interestRate: 0.1,
  interestMinBalance: 10,
  inspectionCoins: 25,
  inspectionXp: 15,
};

export function getChoreQuestConfig(data?: Pick<FamilyData, 'choreQuest'> | null): ChoreQuestConfig {
  const c = data?.choreQuest;
  return {
    ...DEFAULT_CHOREQUEST_CONFIG,
    ...(c || {}),
    streakTarget: Math.max(1, Math.floor(c?.streakTarget ?? DEFAULT_CHOREQUEST_CONFIG.streakTarget)),
    streakCoins: Math.max(0, Math.floor(c?.streakCoins ?? DEFAULT_CHOREQUEST_CONFIG.streakCoins)),
    streakXp: Math.max(0, Math.floor(c?.streakXp ?? DEFAULT_CHOREQUEST_CONFIG.streakXp)),
    interestRate: Math.min(1, Math.max(0, c?.interestRate ?? DEFAULT_CHOREQUEST_CONFIG.interestRate)),
    interestMinBalance: Math.max(0, Math.floor(c?.interestMinBalance ?? DEFAULT_CHOREQUEST_CONFIG.interestMinBalance)),
    inspectionCoins: Math.max(0, Math.floor(c?.inspectionCoins ?? DEFAULT_CHOREQUEST_CONFIG.inspectionCoins)),
    inspectionXp: Math.max(0, Math.floor(c?.inspectionXp ?? DEFAULT_CHOREQUEST_CONFIG.inspectionXp)),
  };
}

/** Difficulty rewards with optional parent overrides from config. */
export function rewardsForDifficultyWithConfig(
  d: QuestDifficulty,
  cfg?: ChoreQuestConfig | null,
) {
  const base = DIFFICULTY_REWARDS[d];
  if (!cfg) return base;
  if (d === 'easy') {
    return {
      ...base,
      xp: cfg.easyXp ?? base.xp,
      coins: cfg.easyCoins ?? base.coins,
    };
  }
  if (d === 'epic') {
    return {
      ...base,
      xp: cfg.epicXp ?? base.xp,
      coins: cfg.epicCoins ?? base.coins,
    };
  }
  return {
    ...base,
    xp: cfg.mediumXp ?? base.xp,
    coins: cfg.mediumCoins ?? base.coins,
  };
}
