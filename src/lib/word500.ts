/**
 * Word500 — count-only deduction word game (pure client logic + daily helpers).
 * Feedback is three counts per guess (green/yellow/red), never which letters.
 */

import {
  WORDLE_ANSWERS,
  hashSeed,
  isValidGuess,
  scoreGuess,
  todaySeed,
} from './wordle';

export const WORD500_LEN = 5;
export const WORD500_ROWS = 8;

export type Word500Difficulty = 'standard' | 'standardPlus' | 'advanced';
export type Word500Status = 'playing' | 'won' | 'lost';
export type NoteColor = 'none' | 'red' | 'yellow' | 'green';

export type Word500Counts = { green: number; yellow: number; red: number };

export type Word500State = {
  answer: string;
  guesses: string[];
  status: Word500Status;
  mode: 'daily' | 'practice';
  difficulty: Word500Difficulty;
  seed?: string;
};

export type Word500Solve = {
  memberId: string;
  name: string;
  guesses: number;
  points: number;
  at: string;
};

/** Shared daily board on FamilyData.word500Daily */
export type Word500Daily = {
  seed: string;
  solves: Word500Solve[];
  finishedMemberIds?: string[];
  inProgress?: Record<string, { guesses: string[] }>;
};

const FORBIDDEN_STANDARD = new Set(['j', 'q', 'x', 'z']);

function hasUniqueLetters(w: string): boolean {
  return new Set(w).size === w.length;
}

/** Standard: unique letters, no J/Q/X/Z */
export const WORD500_POOL_STANDARD: readonly string[] = WORDLE_ANSWERS.filter(
  (w) => hasUniqueLetters(w) && ![...w].some((ch) => FORBIDDEN_STANDARD.has(ch)),
);

/** Standard+: unique letters, full alphabet */
export const WORD500_POOL_STANDARD_PLUS: readonly string[] = WORDLE_ANSWERS.filter((w) =>
  hasUniqueLetters(w),
);

/** Advanced: full answer list */
export const WORD500_POOL_ADVANCED: readonly string[] = WORDLE_ANSWERS;

export function poolForDifficulty(d: Word500Difficulty): readonly string[] {
  if (d === 'standard') return WORD500_POOL_STANDARD;
  if (d === 'standardPlus') return WORD500_POOL_STANDARD_PLUS;
  return WORD500_POOL_ADVANCED;
}

export function scoreCounts(guess: string, answer: string): Word500Counts {
  const states = scoreGuess(guess, answer);
  const green = states.filter((s) => s === 'correct').length;
  const yellow = states.filter((s) => s === 'present').length;
  return { green, yellow, red: 5 - green - yellow };
}

export function pickFromPool(pool: readonly string[], seed: string): string {
  if (pool.length === 0) return 'crane';
  return pool[hashSeed(seed) % pool.length]!;
}

/**
 * Daily Standard answer: salted seed so it never equals that day's Wordle answer.
 * Deterministic on every device.
 */
export function pickWord500DailyAnswer(daySeed: string = todaySeed()): string {
  const pool = WORD500_POOL_STANDARD;
  let salt = `word500:standard:${daySeed}`;
  let answer = pickFromPool(pool, salt);
  const wordleAnswer = WORDLE_ANSWERS[hashSeed(daySeed) % WORDLE_ANSWERS.length]!;
  let n = 0;
  while (answer === wordleAnswer && n < 50) {
    n += 1;
    salt = `word500:standard:${daySeed}:${n}`;
    answer = pickFromPool(pool, salt);
  }
  return answer;
}

export function pickWord500PracticeAnswer(difficulty: Word500Difficulty): string {
  const pool = poolForDifficulty(difficulty);
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function evaluateWord500Status(guesses: string[], answer: string): Word500Status {
  if (guesses.some((g) => g === answer)) return 'won';
  if (guesses.length >= WORD500_ROWS) return 'lost';
  return 'playing';
}

/** 550 − 50 × guesses used when won; 0 on loss. First-guess = 500. */
export function word500Points(guessesUsed: number, won: boolean): number {
  if (!won) return 0;
  return Math.max(0, 550 - 50 * guessesUsed);
}

/**
 * Filter pool to words that produce the same scoreCounts for every prior guess
 * as the observed (guess → counts) pairs.
 */
export function filterConsistent(
  pool: readonly string[],
  history: { guess: string; counts: Word500Counts }[],
): string[] {
  return pool.filter((w) =>
    history.every((h) => {
      const c = scoreCounts(h.guess, w);
      return c.green === h.counts.green && c.yellow === h.counts.yellow && c.red === h.counts.red;
    }),
  );
}

export function pruneWord500InProgress(
  inProgress: Word500Daily['inProgress'] | undefined,
  _seed: string,
): NonNullable<Word500Daily['inProgress']> {
  const out: NonNullable<Word500Daily['inProgress']> = {};
  for (const [memberId, entry] of Object.entries(inProgress || {})) {
    if (!entry || !Array.isArray(entry.guesses) || entry.guesses.length === 0) continue;
    out[memberId] = { guesses: entry.guesses };
  }
  return out;
}

export function word500DailyForToday(
  existing: Word500Daily | null | undefined,
  seed = todaySeed(),
): Word500Daily {
  if (existing && existing.seed === seed) {
    return {
      seed,
      solves: [...(existing.solves || [])],
      finishedMemberIds: [...(existing.finishedMemberIds || [])],
      inProgress: pruneWord500InProgress(existing.inProgress, seed),
    };
  }
  return { seed, solves: [], finishedMemberIds: [], inProgress: {} };
}

export function recordWord500DailyFinish(
  existing: Word500Daily | null | undefined,
  seed: string,
  memberId: string,
  name: string,
  outcome: { won: boolean; guesses: number },
): Word500Daily {
  const base = word500DailyForToday(existing, seed);
  const finished = new Set(base.finishedMemberIds || []);
  if (finished.has(memberId)) {
    if (base.inProgress && base.inProgress[memberId]) {
      const { [memberId]: _, ...rest } = base.inProgress;
      base.inProgress = rest;
    }
    return base;
  }
  finished.add(memberId);
  base.finishedMemberIds = [...finished];
  if (base.inProgress && base.inProgress[memberId]) {
    const { [memberId]: _, ...rest } = base.inProgress;
    base.inProgress = rest;
  }
  if (outcome.won) {
    const points = word500Points(outcome.guesses, true);
    base.solves = base.solves.filter((s) => s.memberId !== memberId);
    base.solves.push({
      memberId,
      name,
      guesses: outcome.guesses,
      points,
      at: new Date().toISOString(),
    });
    base.solves.sort(
      (a, b) => b.points - a.points || a.guesses - b.guesses || a.at.localeCompare(b.at),
    );
  }
  return base;
}

export function word500StorageKey(
  mode: 'daily' | 'practice',
  memberId: string | undefined,
  seedOrDifficulty: string,
): string {
  if (mode === 'daily') {
    return `greenhq-word500-daily:${memberId || 'anon'}:${seedOrDifficulty}`;
  }
  return `greenhq-word500-practice:${memberId || 'anon'}:${seedOrDifficulty}`;
}

export type Word500LocalPayload = {
  guesses: string[];
  answer: string;
  difficulty: Word500Difficulty;
  mode: 'daily' | 'practice';
  seed?: string;
  /** Player note marks: guessIndex → 5 note colours */
  notes?: NoteColor[][];
};

export function saveWord500Local(key: string, payload: Word500LocalPayload): void {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadWord500Local(key: string): Word500LocalPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as Word500LocalPayload;
    if (!data || !Array.isArray(data.guesses) || typeof data.answer !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearWord500Local(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function newWord500Game(
  mode: 'daily' | 'practice',
  difficulty: Word500Difficulty = 'standard',
): Word500State {
  if (mode === 'daily') {
    const seed = todaySeed();
    return {
      answer: pickWord500DailyAnswer(seed),
      guesses: [],
      status: 'playing',
      mode: 'daily',
      difficulty: 'standard',
      seed,
    };
  }
  return {
    answer: pickWord500PracticeAnswer(difficulty),
    guesses: [],
    status: 'playing',
    mode: 'practice',
    difficulty,
  };
}

export function restoreWord500FromGuesses(
  guesses: string[],
  answer: string,
  mode: 'daily' | 'practice',
  difficulty: Word500Difficulty,
  seed?: string,
): Word500State {
  return {
    answer,
    guesses,
    status: evaluateWord500Status(guesses, answer),
    mode,
    difficulty,
    seed,
  };
}

export function initialWord500State(
  mode: 'daily' | 'practice',
  opts: {
    memberId?: string;
    daily?: Word500Daily | null;
    difficulty?: Word500Difficulty;
  } = {},
): Word500State {
  const difficulty = opts.difficulty || 'standard';
  const seed = todaySeed();
  const key =
    mode === 'daily'
      ? word500StorageKey('daily', opts.memberId, seed)
      : word500StorageKey('practice', opts.memberId, difficulty);

  if (mode === 'daily') {
    const daily = word500DailyForToday(opts.daily, seed);
    if (opts.daily?.seed && opts.daily.seed !== seed) {
      clearWord500Local(key);
      clearWord500Local(word500StorageKey('daily', opts.memberId, opts.daily.seed));
    }
    const finished = new Set(daily.finishedMemberIds || []);
    if (opts.memberId && finished.has(opts.memberId)) {
      return {
        answer: pickWord500DailyAnswer(seed),
        guesses: [],
        status: 'lost',
        mode: 'daily',
        difficulty: 'standard',
        seed,
      };
    }
    const cloudEntry = opts.memberId ? daily.inProgress?.[opts.memberId] : undefined;
    if (cloudEntry && Array.isArray(cloudEntry.guesses) && cloudEntry.guesses.length > 0) {
      const answer = pickWord500DailyAnswer(seed);
      const restored = restoreWord500FromGuesses(
        cloudEntry.guesses,
        answer,
        'daily',
        'standard',
        seed,
      );
      if (restored.status === 'playing') {
        saveWord500Local(key, {
          guesses: restored.guesses,
          answer,
          difficulty: 'standard',
          mode: 'daily',
          seed,
        });
        return restored;
      }
    }
    const local = loadWord500Local(key);
    if (
      local &&
      local.mode === 'daily' &&
      local.seed === seed &&
      Array.isArray(local.guesses) &&
      local.guesses.length > 0
    ) {
      const restored = restoreWord500FromGuesses(
        local.guesses,
        local.answer || pickWord500DailyAnswer(seed),
        'daily',
        'standard',
        seed,
      );
      if (restored.status === 'playing') return restored;
    }
    clearWord500Local(key);
    return newWord500Game('daily');
  }

  const local = loadWord500Local(key);
  if (
    local &&
    local.mode === 'practice' &&
    local.difficulty === difficulty &&
    Array.isArray(local.guesses) &&
    local.guesses.length > 0
  ) {
    const restored = restoreWord500FromGuesses(
      local.guesses,
      local.answer,
      'practice',
      difficulty,
    );
    if (restored.status === 'playing') return restored;
  }
  return newWord500Game('practice', difficulty);
}

export function persistWord500Progress(
  state: Word500State,
  memberId: string | undefined,
  notes?: NoteColor[][],
): void {
  const key =
    state.mode === 'daily'
      ? word500StorageKey('daily', memberId, state.seed || todaySeed())
      : word500StorageKey('practice', memberId, state.difficulty);
  if (state.status !== 'playing') {
    clearWord500Local(key);
    return;
  }
  saveWord500Local(key, {
    guesses: state.guesses,
    answer: state.answer,
    difficulty: state.difficulty,
    mode: state.mode,
    seed: state.seed,
    notes,
  });
}

export function buildWord500ShareText(
  seed: string,
  difficulty: Word500Difficulty,
  guesses: string[],
  answer: string,
  won: boolean,
): string {
  const points = word500Points(guesses.length, won);
  const lines = guesses.map((g) => {
    const c = scoreCounts(g, answer);
    return `🟩${c.green} 🟨${c.yellow} 🟥${c.red}`;
  });
  const label =
    difficulty === 'standard'
      ? 'Standard'
      : difficulty === 'standardPlus'
        ? 'Standard+'
        : 'Advanced';
  const header = won
    ? `Word500 ${seed} · ${label}\nSolved ${guesses.length}/8 · ${points} pts`
    : `Word500 ${seed} · ${label}\nX/8 · 0 pts`;
  return [header, ...lines].join('\n');
}

export { isValidGuess };
