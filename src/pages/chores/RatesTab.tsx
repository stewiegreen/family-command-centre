// src/pages/chores/RatesTab.tsx
//
// Parents-only admin panel: tune the ChoreQuest economy (streaks, interest,
// inspection bonuses, difficulty defaults) and apply one-off manual balance
// adjustments. Fully self-contained — extracted from ChoresPage, which
// previously held ~500 lines of local state (ratesDraft, adjXp/adjCoins/...)
// purely for this tab.

import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { ChoreQuestConfig } from '../../types';
import {
  DIFFICULTY_REWARDS,
  ensureProgress,
  getChoreQuestConfig,
  isoWeekId,
  progressTowardNextLevel,
} from '../../lib/quest';
import { cn } from '../../lib/cn';

function newId() {
  return crypto.randomUUID();
}

export function RatesTab({ cq }: { cq: ChoreQuestConfig }) {
  const { data, update, currentUser, getMember } = useApp();
  const me = currentUser;
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const screenTimeMap = data.screenTime || {};

  const [ratesDraft, setRatesDraft] = useState<ChoreQuestConfig | null>(null);
  const [adjKidId, setAdjKidId] = useState('');
  // String state so users can type "-" without the controlled Number() eating it
  const [adjXp, setAdjXp] = useState('');
  const [adjCoins, setAdjCoins] = useState('');
  const [adjScreen, setAdjScreen] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjMsg, setAdjMsg] = useState('');

  // Seed the draft (and default kid selection) once, on mount — this tab only
  // renders while `tab === 'rates'`, so mount/unmount already gates this.
  useEffect(() => {
    setRatesDraft(getChoreQuestConfig(data));
    const kids = (data.members || []).filter((m) => m.role === 'kid');
    setAdjKidId((prev) => prev || kids[0]?.id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draft = ratesDraft || cq;
  const set = (patch: Partial<ChoreQuestConfig>) => setRatesDraft({ ...draft, ...patch });
  const field = (
    label: string,
    key: keyof ChoreQuestConfig,
    opts?: { step?: number; min?: number; max?: number; hint?: string },
  ) => (
    <div key={key}>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      <input
        type="number"
        step={opts?.step ?? 1}
        min={opts?.min ?? 0}
        max={opts?.max}
        className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
        value={draft[key] as number}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<ChoreQuestConfig>)}
      />
      {opts?.hint ? <p className="text-[11px] text-muted mt-0.5">{opts.hint}</p> : null}
    </div>
  );

  const kids = (data.members || []).filter((m) => m.role === 'kid');
  const kidId = adjKidId || kids[0]?.id || '';
  const prog = ensureProgress(progressMap[kidId]);
  const coins = coinBalances[kidId] ?? 0;
  const screen = screenTimeMap[kidId] ?? 0;

  const applyAdjustment = () => {
    if (!kidId || !me) return;
    const xpD = Math.trunc(Number(adjXp) || 0);
    const coinD = Math.trunc(Number(adjCoins) || 0);
    const screenD = Math.trunc(Number(adjScreen) || 0);
    if (!xpD && !coinD && !screenD) return;
    const at = new Date().toISOString();
    const weekId = isoWeekId();
    const note = adjNote.trim() || 'Manual adjustment';
    update((d) => {
      let next = { ...d };
      if (xpD) {
        const prev = ensureProgress(d.memberProgress?.[kidId]);
        const newXp = Math.max(0, prev.xp + xpD);
        const level = progressTowardNextLevel(newXp).level;
        next = {
          ...next,
          memberProgress: {
            ...(next.memberProgress || {}),
            [kidId]: { xp: newXp, level },
          },
        };
      }
      if (coinD) {
        const prevC = next.coinBalances?.[kidId] ?? 0;
        const newC = Math.max(0, prevC + coinD);
        const entry = {
          id: `adjust:${kidId}:${at}`,
          memberId: kidId,
          delta: coinD,
          reason: 'adjust' as const,
          label: note,
          byId: me.id,
          at,
          weekId,
        };
        next = {
          ...next,
          coinBalances: {
            ...(next.coinBalances || {}),
            [kidId]: newC,
          },
          coinLedger: [entry, ...(next.coinLedger || [])].slice(0, 200),
        };
      }
      if (screenD) {
        const prevS = next.screenTime?.[kidId] ?? 0;
        const newS = Math.max(0, prevS + screenD);
        next = {
          ...next,
          screenTime: {
            ...(next.screenTime || {}),
            [kidId]: newS,
          },
          screenTimeLog: [
            {
              id: newId(),
              memberId: kidId,
              delta: screenD,
              reason: note,
              byId: me.id,
              at,
            },
            ...(next.screenTimeLog || []),
          ].slice(0, 100),
        };
      }
      return next;
    });
    const parts: string[] = [];
    if (xpD) parts.push(`${xpD > 0 ? '+' : ''}${xpD} XP`);
    if (coinD) parts.push(`${coinD > 0 ? '+' : ''}${coinD} coins`);
    if (screenD) parts.push(`${screenD > 0 ? '+' : ''}${screenD}m screen`);
    setAdjMsg(`Applied ${parts.join(', ')} to ${getMember(kidId)?.name || 'kid'}.`);
    setAdjXp('');
    setAdjCoins('');
    setAdjScreen('');
    setAdjNote('');
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-1">
          ChoreQuest rates
        </h2>
        <p className="text-xs text-muted mb-3">
          Tune the economy for your family. Changes apply to new streaks, interest, and inspection
          bonuses right away.
        </p>
      </div>
      <Card className="!p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          {field('Weekday quests for chest', 'streakTarget', { min: 1, hint: 'Default 5' })}
          {field('Chest coins', 'streakCoins', { hint: 'Default 40' })}
          {field('Chest XP', 'streakXp', { hint: 'Default 30' })}
          {field('Interest rate (0–1)', 'interestRate', {
            step: 0.01,
            min: 0,
            max: 1,
            hint: '0.1 = 10%',
          })}
          {field('Min balance for interest', 'interestMinBalance', { hint: 'Default 10' })}
          {field('Inspection coins (each kid)', 'inspectionCoins', { hint: 'Default 25' })}
          {field('Inspection XP (each kid)', 'inspectionXp', { hint: 'Default 15' })}
        </div>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide pt-2">
          Difficulty defaults (new quests)
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          {field('Easy XP', 'easyXp', { hint: `Base ${DIFFICULTY_REWARDS.easy.xp}` })}
          {field('Easy coins', 'easyCoins', { hint: `Base ${DIFFICULTY_REWARDS.easy.coins}` })}
          {field('Medium XP', 'mediumXp', { hint: `Base ${DIFFICULTY_REWARDS.medium.xp}` })}
          {field('Medium coins', 'mediumCoins', { hint: `Base ${DIFFICULTY_REWARDS.medium.coins}` })}
          {field('Epic XP', 'epicXp', { hint: `Base ${DIFFICULTY_REWARDS.epic.xp}` })}
          {field('Epic coins', 'epicCoins', { hint: `Base ${DIFFICULTY_REWARDS.epic.coins}` })}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            onClick={() => {
              update((d) => ({
                ...d,
                choreQuest: {
                  ...getChoreQuestConfig(d),
                  ...draft,
                },
              }));
              setRatesDraft(null);
            }}
          >
            Save rates
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setRatesDraft({ ...getChoreQuestConfig(null) });
            }}
          >
            Reset to defaults
          </Button>
        </div>
      </Card>

      {/* Manual balance adjustments — fix mistakes / test */}
      <div className="pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-1">
          Adjust balances
        </h2>
        <p className="text-xs text-muted mb-3">
          Add or subtract XP, coins, or screen minutes for a kid. Use negative numbers to
          remove. Written to the ledger so you can see what changed.
        </p>
        <Card className="!p-4 space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Kid</label>
            <div className="flex flex-wrap gap-2">
              {kids.map((k) => {
                const look = getMember(k.id) || k;
                const on = kidId === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => {
                      setAdjKidId(k.id);
                      setAdjMsg('');
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition-colors',
                      on
                        ? 'border-accent bg-accent/10 text-fg'
                        : 'border-border text-muted hover:bg-nav-hover',
                    )}
                  >
                    <Avatar {...look} size="sm" className="!w-7 !h-7 !text-sm" />
                    {look.name}
                  </button>
                );
              })}
            </div>
          </div>

          {kidId ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-inset border border-border px-2 py-2">
                <p className="text-lg font-bold text-fg tabular-nums">{prog.xp}</p>
                <p className="text-[11px] text-muted">XP · Lv {prog.level}</p>
              </div>
              <div className="rounded-xl bg-inset border border-border px-2 py-2">
                <p className="text-lg font-bold text-fg tabular-nums">{coins}</p>
                <p className="text-[11px] text-muted">Coins</p>
              </div>
              <div className="rounded-xl bg-inset border border-border px-2 py-2">
                <p className="text-lg font-bold text-sky-500 tabular-nums">{screen}m</p>
                <p className="text-[11px] text-muted">Screen bank</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No kids in the family yet.</p>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">XP delta</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={adjXp}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  // Allow empty, lone minus, or integer (pos/neg)
                  if (v === '' || v === '-' || /^-?\d+$/.test(v)) setAdjXp(v);
                }}
                placeholder="e.g. 50 or -20"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Coins delta</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={adjCoins}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === '' || v === '-' || /^-?\d+$/.test(v)) setAdjCoins(v);
                }}
                placeholder="e.g. 10 or -5"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Screen minutes delta</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="-?[0-9]*"
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={adjScreen}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (v === '' || v === '-' || /^-?\d+$/.test(v)) setAdjScreen(v);
                }}
                placeholder="e.g. 15 or -10"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Note (optional)</label>
            <input
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={adjNote}
              onChange={(e) => setAdjNote(e.target.value)}
              placeholder="e.g. Fix double-credit bug"
            />
          </div>

          {adjMsg ? <p className="text-xs text-accent">{adjMsg}</p> : null}

          <Button
            disabled={
              !kidId ||
              ![adjXp, adjCoins, adjScreen].some((s) => s !== '' && s !== '-' && Number(s) !== 0)
            }
            onClick={applyAdjustment}
          >
            Apply adjustment
          </Button>
        </Card>
      </div>
    </section>
  );
}
