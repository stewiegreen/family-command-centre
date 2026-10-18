// src/pages/play/Word500Board.tsx
// Solo Word500 board — count-only feedback, player scratchpad notes, daily + practice.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { fireConfetti } from '../../lib/confetti';
import { cn } from '../../lib/cn';
import { todaySeed } from '../../lib/wordle';
import {
  WORD500_LEN,
  WORD500_ROWS,
  buildWord500ShareText,
  clearWord500Local,
  evaluateWord500Status,
  filterConsistent,
  initialWord500State,
  isValidGuess,
  loadWord500Local,
  newWord500Game,
  persistWord500Progress,
  poolForDifficulty,
  scoreCounts,
  word500Points,
  word500StorageKey,
  type NoteColor,
  type Word500Counts,
  type Word500Daily,
  type Word500Difficulty,
  type Word500State,
} from '../../lib/word500';
import type { Member } from '../../types';

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const NOTE_CYCLE: NoteColor[] = ['none', 'red', 'yellow', 'green'];

function noteClass(n: NoteColor): string {
  if (n === 'red') return 'ring-2 ring-rose-500 bg-rose-500/20';
  if (n === 'yellow') return 'ring-2 ring-amber-400 bg-amber-400/20';
  if (n === 'green') return 'ring-2 ring-emerald-500 bg-emerald-500/20';
  return '';
}

/** Same footprint as letter tiles so the row reads as one aligned strip. */
const TILE =
  'w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-md border-2 flex items-center justify-center font-black uppercase';

function CountChips({ counts }: { counts: Word500Counts }) {
  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      aria-label={`${counts.green} right place, ${counts.yellow} right letter wrong place, ${counts.red} not in word`}
    >
      <span
        className={cn(
          TILE,
          'text-sm sm:text-base md:text-lg text-white bg-emerald-500 border-emerald-400',
        )}
      >
        {counts.green}
      </span>
      <span
        className={cn(
          TILE,
          'text-sm sm:text-base md:text-lg text-slate-900 bg-amber-400 border-amber-300',
        )}
      >
        {counts.yellow}
      </span>
      <span
        className={cn(
          TILE,
          'text-sm sm:text-base md:text-lg text-white bg-rose-500 border-rose-400',
        )}
      >
        {counts.red}
      </span>
    </div>
  );
}

export function Word500Board({
  mode,
  difficulty: initialDifficulty = 'standard',
  me,
  daily,
  onClose,
  onDailyFinish,
  onProgress,
}: {
  mode: 'daily' | 'practice';
  difficulty?: Word500Difficulty;
  me: Member | null | undefined;
  daily?: Word500Daily | null;
  onClose: () => void;
  onDailyFinish?: (result: { won: boolean; guesses: number }) => void;
  onProgress?: (state: Word500State) => void;
}) {
  const seed = todaySeed();
  const [difficulty, setDifficulty] = useState<Word500Difficulty>(
    mode === 'daily' ? 'standard' : initialDifficulty,
  );
  const alreadyFinished =
    mode === 'daily' &&
    !!me &&
    daily?.seed === seed &&
    (daily.finishedMemberIds || []).includes(me.id);

  const [game, setGame] = useState<Word500State>(() =>
    initialWord500State(mode, { memberId: me?.id, daily, difficulty }),
  );
  const [current, setCurrent] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [notes, setNotes] = useState<NoteColor[][]>(() => {
    const key =
      mode === 'daily'
        ? word500StorageKey('daily', me?.id, seed)
        : word500StorageKey('practice', me?.id, difficulty);
    const local = loadWord500Local(key);
    return local?.notes || [];
  });
  const [showHelp, setShowHelp] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [copied, setCopied] = useState(false);

  const gameRef = useRef(game);
  gameRef.current = game;
  const currentRef = useRef(current);
  currentRef.current = current;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const onDailyFinishRef = useRef(onDailyFinish);
  onDailyFinishRef.current = onDailyFinish;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const dailyReportedRef = useRef(alreadyFinished);

  // Day rollover while open
  useEffect(() => {
    if (mode !== 'daily') return;
    const tick = () => {
      const today = todaySeed();
      if (gameRef.current.seed && gameRef.current.seed !== today) {
        const next = initialWord500State('daily', { memberId: me?.id, daily });
        setGame(next);
        setCurrent('');
        setNotes([]);
        setMsg(null);
        dailyReportedRef.current = false;
      }
    };
    const id = window.setInterval(tick, 30_000);
    tick();
    return () => window.clearInterval(id);
  }, [mode, me?.id, daily]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const g = gameRef.current;
      if (g.status !== 'playing') return;
      const k = e.key;
      if (k === 'Enter') {
        e.preventDefault();
        submitRef.current();
        return;
      }
      if (k === 'Backspace') {
        e.preventDefault();
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[a-zA-Z]$/.test(k)) {
        setCurrent((c) => (c.length < WORD500_LEN ? c + k.toLowerCase() : c));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flash = (text: string) => {
    setMsg(text);
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
  };

  const submitRef = useRef(() => {});
  const submit = () => {
    const g = gameRef.current;
    if (g.status !== 'playing') return;
    const cur = currentRef.current;
    if (cur.length !== WORD500_LEN) {
      flash('Need 5 letters');
      return;
    }
    if (!isValidGuess(cur)) {
      flash('Not in word list');
      return;
    }
    const guesses = [...g.guesses, cur];
    const status = evaluateWord500Status(guesses, g.answer);
    const next: Word500State = { ...g, guesses, status };
    setGame(next);
    setCurrent('');
    setMsg(null);
    // Extend notes rows
    setNotes((prev) => {
      const rows = [...prev];
      while (rows.length < guesses.length) {
        rows.push(Array.from({ length: WORD500_LEN }, () => 'none' as NoteColor));
      }
      persistWord500Progress(next, me?.id, rows);
      return rows;
    });
    if (status === 'playing') {
      onProgressRef.current?.(next);
    }
    if (status === 'won' || status === 'lost') {
      if (status === 'won') {
        fireConfetti({ count: 140, power: 14, origin: { x: 0.5, y: 0.4 } });
      }
      clearWord500Local(
        word500StorageKey(
          g.mode,
          me?.id,
          g.mode === 'daily' ? g.seed || todaySeed() : g.difficulty,
        ),
      );
      if (g.mode === 'daily' && !dailyReportedRef.current) {
        dailyReportedRef.current = true;
        onDailyFinishRef.current?.({
          won: status === 'won',
          guesses: guesses.length,
        });
      }
    }
  };
  submitRef.current = submit;

  const cycleNote = (row: number, col: number) => {
    if (row >= game.guesses.length) return;
    setNotes((prev) => {
      const rows = prev.map((r) => [...r]);
      while (rows.length <= row) {
        rows.push(Array.from({ length: WORD500_LEN }, () => 'none' as NoteColor));
      }
      const cell = rows[row]![col] || 'none';
      const idx = NOTE_CYCLE.indexOf(cell);
      rows[row]![col] = NOTE_CYCLE[(idx + 1) % NOTE_CYCLE.length]!;
      persistWord500Progress(game, me?.id, rows);
      return rows;
    });
  };

  const clearNotes = () => {
    setNotes([]);
    persistWord500Progress(game, me?.id, []);
  };

  const newPractice = (d: Word500Difficulty = difficulty) => {
    const next = newWord500Game('practice', d);
    setGame(next);
    setCurrent('');
    setNotes([]);
    setMsg(null);
    setDifficulty(d);
    clearWord500Local(word500StorageKey('practice', me?.id, d));
  };

  const applyHint = () => {
    if (game.mode !== 'practice' || game.status !== 'playing') return;
    const history = game.guesses.map((guess) => ({
      guess,
      counts: scoreCounts(guess, game.answer),
    }));
    const pool = poolForDifficulty(game.difficulty);
    const candidates = filterConsistent(pool, history);
    if (candidates.length === 0) {
      setMsg('No words fit your clues');
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
    setCurrent(pick);
    setMsg(`${candidates.length} possible word${candidates.length === 1 ? '' : 's'} left`);
  };

  const historyCounts = game.guesses.map((g) => scoreCounts(g, game.answer));
  const candidatesLeft =
    game.mode === 'practice'
      ? filterConsistent(
          poolForDifficulty(game.difficulty),
          game.guesses.map((guess, i) => ({ guess, counts: historyCounts[i]! })),
        ).length
      : 0;

  const finishedReadOnly = alreadyFinished && game.status !== 'playing';
  const points =
    game.status === 'won' ? word500Points(game.guesses.length, true) : game.status === 'lost' ? 0 : null;

  const shareText =
    game.status !== 'playing'
      ? buildWord500ShareText(
          game.seed || seed,
          game.difficulty,
          game.guesses,
          game.answer,
          game.status === 'won',
        )
      : '';

  const modeLabel =
    game.mode === 'daily'
      ? 'Daily · Standard'
      : `Practice · ${
          game.difficulty === 'standard'
            ? 'Standard'
            : game.difficulty === 'standardPlus'
              ? 'Standard+'
              : 'Advanced'
        }`;

  return (
    <Card className="p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4 max-w-xl sm:max-w-2xl md:max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-fg">Word500</h2>
          <p className="text-xs text-muted mt-0.5">
            Guess {Math.min(game.guesses.length + (game.status === 'playing' ? 1 : 0), WORD500_ROWS)} of{' '}
            {WORD500_ROWS} · {modeLabel}
          </p>
          <p className="text-[11px] text-muted mt-1 leading-snug">
            Green = right letter, right spot. Yellow = right letter, wrong spot. Red = not in the
            word. We never tell you which letters.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-nav-hover shrink-0"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowHelp((v) => !v)}
        className="text-xs font-semibold text-accent inline-flex items-center gap-1"
      >
        How to play {showHelp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {showHelp && (
        <div className="text-xs text-muted space-y-1.5 bg-surface-2/60 rounded-xl px-3 py-2">
          <p>
            After each guess you only see three numbers: how many letters are green, yellow, and red
            — not which ones. Compare guesses to work it out.
          </p>
          <p>
            Example: guess <span className="font-mono text-fg">STARE</span> vs answer{' '}
            <span className="font-mono text-fg">CRANE</span> →{' '}
            <span className="text-emerald-600 font-semibold">2</span> green,{' '}
            <span className="text-amber-600 font-semibold">1</span> yellow,{' '}
            <span className="text-rose-600 font-semibold">2</span> red (A,E in place; R elsewhere).
          </p>
          <p>Tap submitted letters to mark your own notes. Those marks are yours only.</p>
        </div>
      )}

      {msg && (
        <p className="text-sm text-center text-warn font-medium" role="status">
          {msg}
        </p>
      )}

      {/* Board — letter tiles and count chips share the same TILE size */}
      <div className="space-y-1.5 sm:space-y-2">
        {Array.from({ length: WORD500_ROWS }, (_, row) => {
          const guess = game.guesses[row];
          const isCurrent = row === game.guesses.length && game.status === 'playing';
          const letters = guess
            ? guess.split('')
            : isCurrent
              ? current.padEnd(WORD500_LEN).split('').map((c) => (c === ' ' ? '' : c))
              : Array.from({ length: WORD500_LEN }, () => '');
          const counts = guess ? historyCounts[row] : null;
          const rowNotes = notes[row];

          return (
            <div
              key={row}
              className={cn(
                'flex items-center justify-center gap-2 sm:gap-3',
                isCurrent && shake && 'animate-pulse',
              )}
            >
              <div className="flex gap-1.5 sm:gap-2">
                {letters.map((ch, col) => {
                  const note = rowNotes?.[col] || 'none';
                  const submitted = !!guess;
                  return (
                    <button
                      key={col}
                      type="button"
                      disabled={!submitted}
                      onClick={() => cycleNote(row, col)}
                      className={cn(
                        TILE,
                        'text-sm sm:text-base md:text-lg transition-colors',
                        submitted
                          ? cn(
                              'bg-surface-2 border-border text-fg cursor-pointer',
                              noteClass(note),
                            )
                          : isCurrent && ch
                            ? 'border-fg/40 bg-surface-2 text-fg'
                            : 'border-border bg-surface-2/40 text-transparent',
                      )}
                      aria-label={
                        submitted
                          ? `Letter ${ch || 'blank'}, your note ${note}`
                          : ch
                            ? `Typing ${ch}`
                            : 'Empty'
                      }
                    >
                      {ch || (submitted ? '' : '·')}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                {counts ? (
                  <CountChips counts={counts} />
                ) : (
                  <div className="flex gap-1.5 sm:gap-2 opacity-25" aria-hidden>
                    <span className={cn(TILE, 'border-border bg-surface-2/30')} />
                    <span className={cn(TILE, 'border-border bg-surface-2/30')} />
                    <span className={cn(TILE, 'border-border bg-surface-2/30')} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted text-center">Tap letters to make your own notes.</p>

      {/* Result */}
      {game.status !== 'playing' && (
        <div className="space-y-2 text-center border-t border-border pt-3">
          {game.status === 'won' ? (
            <p className="text-sm font-semibold text-fg">
              Solved in {game.guesses.length} of 8
              {points != null && (
                <span className="text-accent"> · {points} pts</span>
              )}
            </p>
          ) : (
            <p className="text-sm font-semibold text-fg">
              {alreadyFinished && game.guesses.length === 0
                ? 'Already finished today — come back tomorrow'
                : 'Nice try'}
            </p>
          )}
          {!(alreadyFinished && game.guesses.length === 0) && (
            <p className="text-sm text-muted">
              The word was <span className="font-mono font-bold text-fg uppercase">{game.answer}</span>
            </p>
          )}
          {shareText && game.guesses.length > 0 && (
            <div className="flex flex-col items-center gap-1.5">
              <pre className="text-[11px] text-left bg-surface-2 rounded-lg px-3 py-2 whitespace-pre-wrap max-w-full overflow-x-auto">
                {shareText}
              </pre>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(shareText).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? 'Copied' : 'Copy share text'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* On-screen keyboard — same layout/sizing as Wordle (keys stay neutral) */}
      {game.status === 'playing' && !finishedReadOnly && (
        <div className="space-y-1.5 sm:space-y-2 pt-1">
          {KEY_ROWS.map((row, ri) => (
            <div key={row} className="flex justify-center gap-1 sm:gap-1.5">
              {ri === 2 && (
                <button
                  type="button"
                  onClick={() => submit()}
                  className="px-2 sm:px-3 h-11 sm:h-12 rounded-md text-[10px] sm:text-xs font-bold uppercase bg-surface-2 border border-border text-fg hover:bg-nav-hover"
                >
                  Enter
                </button>
              )}
              {row.split('').map((k) => (
                <button
                  key={k}
                  type="button"
                  className="w-8 h-11 sm:w-9 sm:h-12 md:w-10 rounded-md text-sm font-bold uppercase border bg-surface-2 border-border text-fg hover:bg-nav-hover"
                  onClick={() =>
                    setCurrent((c) => (c.length < WORD500_LEN ? c + k : c))
                  }
                >
                  {k}
                </button>
              ))}
              {ri === 2 && (
                <button
                  type="button"
                  onClick={() => setCurrent((c) => c.slice(0, -1))}
                  className="px-2 sm:px-3 h-11 sm:h-12 rounded-md text-[10px] sm:text-xs font-bold uppercase bg-surface-2 border border-border text-fg hover:bg-nav-hover"
                >
                  Del
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-center pt-1 border-t border-border">
        <Button size="sm" variant="ghost" onClick={clearNotes} disabled={notes.length === 0}>
          Clear notes
        </Button>
        {game.mode === 'practice' && game.status === 'playing' && (
          <>
            <Button size="sm" variant="secondary" onClick={applyHint}>
              <Lightbulb className="w-3.5 h-3.5 mr-1" />
              Hint
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowLeft((v) => !v)}>
              {showLeft ? `${candidatesLeft} left` : 'Words left?'}
            </Button>
          </>
        )}
        {game.mode === 'practice' && (
          <>
            <select
              className="text-xs rounded-lg border border-border bg-input px-2 py-1.5 text-fg"
              value={difficulty}
              onChange={(e) => {
                const d = e.target.value as Word500Difficulty;
                newPractice(d);
              }}
            >
              <option value="standard">Standard</option>
              <option value="standardPlus">Standard+</option>
              <option value="advanced">Advanced</option>
            </select>
            <Button size="sm" variant="secondary" onClick={() => newPractice(difficulty)}>
              New puzzle
            </Button>
          </>
        )}
        {game.mode === 'daily' && game.status !== 'playing' && (
          <Button size="sm" variant="secondary" onClick={() => newPractice('standard')}>
            Try Practice
          </Button>
        )}
      </div>
    </Card>
  );
}
