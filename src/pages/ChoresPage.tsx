import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Coins,
  MonitorPlay,
  Play,
  Plus,
  Square,
  Sword,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import type {
  Quest,
  ScreenTimerSession,
} from '../types';
import { formatCountdown } from '../lib/screenTimer';
import {
  ensureProgress,
  ensureQuestCatalog,
  ensureRewardCatalog,
  getChoreQuestConfig,
  isoWeekId,
  progressTowardNextLevel,
  rewardsForDifficultyWithConfig,
} from '../lib/quest';
import { nameFlairLabel } from '../lib/flair';
import {
  claimStreakChest,
  daysUntilWeekEnd,
  ensureWeekRollover,
  markHouseInspection,
  projectedInterest,
  streakStatus,
} from '../lib/weekCycle';
import { cn } from '../lib/cn';
import { fireConfetti } from '../lib/confetti';
import { QuestFormModal } from './chores/QuestFormModal';
import { TemplateFormModal } from './chores/TemplateFormModal';
import { RatesTab } from './chores/RatesTab';
import { useQuestCatalogActions } from './chores/useQuestCatalogActions';
import { QuestsTab } from './chores/QuestsTab';
import { CatalogTab } from './chores/CatalogTab';
import { ShopTab } from './chores/ShopTab';
import { VaultTab } from './chores/VaultTab';
import { BoardTab } from './chores/BoardTab';
import type { TabId } from './chores/tabTypes';

function newId() {
  return crypto.randomUUID();
}

/** Bump when shipping a Chores/ChoreQuest UI change so deploy lag is obvious. */
const CHOREQUEST_UI_VERSION = 'picture-frame-1';

export function ChoresPage() {
  const { data, update, currentUser, isParent, getMember, setView } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;
  const chores = data.chores || [];
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const catalog = ensureRewardCatalog(data.rewardCatalog);
  const questCatalog = ensureQuestCatalog(data.questCatalog);
  const redemptions = data.redemptions || [];

  // Seed shop catalog into family data once if empty
  useEffect(() => {
    if (!data.rewardCatalog || data.rewardCatalog.length === 0) {
      update((d) => {
        if (d.rewardCatalog && d.rewardCatalog.length > 0) return d;
        return { ...d, rewardCatalog: ensureRewardCatalog(d.rewardCatalog) };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState<TabId>('quests');
  /** Quest create/edit modal — form fields themselves live inside QuestFormModal. */
  const [createOpen, setCreateOpen] = useState(false);
  const [editQuest, setEditQuest] = useState<Quest | null>(null);
  const openCreate = () => {
    setEditQuest(null);
    setCreateOpen(true);
  };
  const openEdit = (q: Quest) => {
    setEditQuest(q);
    setCreateOpen(true);
  };

  const [levelUp, setLevelUp] = useState<{ name: string; level: number } | null>(null);

  // Celebrate when the level-up modal opens (parent approve path, or self-detect below)
  useEffect(() => {
    if (!levelUp) return;
    fireConfetti({ count: 200, power: 18, origin: { x: 0.5, y: 0.35 } });
    // second smaller burst a beat later
    const t = window.setTimeout(
      () => fireConfetti({ count: 80, power: 12, origin: { x: 0.5, y: 0.5 } }),
      350,
    );
    return () => window.clearTimeout(t);
  }, [levelUp]);

  // Kid on their own device: detect level increase after parent approves elsewhere
  const lastLevelRef = useRef<number | null>(null);


  // Idempotent weekly rollover (safe if app wasn't opened all weekend)
  useEffect(() => {
    if (!me) return;
    update((d) => ensureWeekRollover(d, me.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);



  const myProgress = ensureProgress(progressMap[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);

  useEffect(() => {
    if (!me) return;
    // Only celebrate for the kid (or non-parent) whose level rose on this device
    const level = myProgress.level;
    const prev = lastLevelRef.current;
    if (prev != null && level > prev) {
      setLevelUp({ name: me.name || 'Hero', level });
      // confetti fired by the levelUp effect above
    }
    lastLevelRef.current = level;
  }, [me?.id, myProgress.level, me?.name]);

  const myCoins = coinBalances[myId] ?? 0;
  const screenTimeMap = data.screenTime || {};
  const myScreen = screenTimeMap[myId] ?? 0;
  const cq = getChoreQuestConfig(data);
  const catalogActions = useQuestCatalogActions(cq, setTab);
  const weekState = data.weekState;
  const myStreak = streakStatus(weekState, myId, cq);
  const interestPreview = projectedInterest(myCoins, cq);
  const daysLeft = daysUntilWeekEnd();
  const inspectionPassed = !!weekState?.houseInspectionPassed;

  const kids = useMemo(
    () => data.members.filter((m) => m.role === 'kid'),
    [data.members],
  );




  /* ─── Quest catalog (templates) ─────────────────────────── */











  /** Spend accrued screen-time minutes (TV / games). */
  const [spendOpen, setSpendOpen] = useState(false);
  const [spendMins, setSpendMins] = useState(30);
  const [timerLabel, setTimerLabel] = useState('');
  const [timerNow, setTimerNow] = useState(Date.now());
  /** Who the "Use Screen Time" controls target (kid for parents; self for kids). */
  const [spendMemberId, setSpendMemberId] = useState(() => {
    if (isParent) {
      const firstKid = data.members.find((m) => m.role === 'kid');
      return firstKid?.id || myId;
    }
    return myId;
  });

  // Keep selection valid if members list changes
  useEffect(() => {
    if (isParent) {
      if (!kids.some((k) => k.id === spendMemberId)) {
        setSpendMemberId(kids[0]?.id || myId);
      }
    } else if (spendMemberId !== myId) {
      setSpendMemberId(myId);
    }
  }, [isParent, kids, spendMemberId, myId]);

  const spendBalance = screenTimeMap[spendMemberId] ?? 0;
  const screenTimers = data.screenTimers || {};
  const activeTimer = screenTimers[spendMemberId];

  useEffect(() => {
    if (!activeTimer && !Object.keys(screenTimers).length) return;
    const id = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTimer, Object.keys(screenTimers).length]);

  const timerRemainingSec = useMemo(() => {
    if (!activeTimer) return 0;
    return Math.max(0, Math.ceil((new Date(activeTimer.endsAt).getTime() - timerNow) / 1000));
  }, [activeTimer, timerNow]);

  /** Debit bank up front, run countdown; stop early refunds whole unused minutes. */
  const startScreenTimer = (memberId: string, minutes: number, label?: string) => {
    if (!me) return;
    const m = Math.floor(minutes);
    if (m <= 0) return;
    const bal = (data.screenTime || {})[memberId] ?? 0;
    if (bal < m) {
      alert(`Only ${bal} minutes available.`);
      return;
    }
    if (screenTimers[memberId]) {
      alert('A timer is already running for this person. Stop it first.');
      return;
    }
    const startedAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + m * 60_000).toISOString();
    const session: ScreenTimerSession = {
      memberId,
      byId: me.id,
      startedAt,
      endsAt,
      totalMin: m,
      label: (label || '').trim() || undefined,
    };
    update((d) => {
      const current = (d.screenTime || {})[memberId] ?? 0;
      if (current < m) return d;
      return {
        ...d,
        screenTime: { ...(d.screenTime || {}), [memberId]: current - m },
        screenTimeLog: [
          {
            id: newId(),
            memberId,
            delta: -m,
            reason: `Timer: ${(label || '').trim() || 'screen time'} (${m}m)`,
            byId: me.id,
            at: startedAt,
          },
          ...(d.screenTimeLog || []),
        ].slice(0, 100),
        screenTimers: { ...(d.screenTimers || {}), [memberId]: session },
      };
    });
  };

  const stopScreenTimer = (memberId: string) => {
    if (!me) return;
    const sess = (data.screenTimers || {})[memberId];
    if (!sess) return;
    const leftSec = Math.max(0, new Date(sess.endsAt).getTime() - Date.now());
    const refund = Math.floor(leftSec / 60_000);
    if (!confirm(refund > 0 ? `Stop timer and refund ${refund} unused minute(s)?` : 'Stop timer?')) {
      return;
    }
    update((d) => {
      const nextTimers = { ...(d.screenTimers || {}) };
      delete nextTimers[memberId];
      const st = { ...(d.screenTime || {}) };
      let log = d.screenTimeLog || [];
      if (refund > 0) {
        st[memberId] = (st[memberId] ?? 0) + refund;
        log = [
          {
            id: newId(),
            memberId,
            delta: refund,
            reason: `Timer stopped early — refund ${refund}m`,
            byId: me.id,
            at: new Date().toISOString(),
          },
          ...log,
        ].slice(0, 100);
      }
      return { ...d, screenTimers: nextTimers, screenTime: st, screenTimeLog: log };
    });
  };



  const catalogCount = (questCatalog || []).filter((t) => !t.archived).length;
  const vaultCount = (redemptions || []).filter((r) =>
    r.status === 'pending' && (isParent || r.memberId === myId),
  ).length;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'quests', label: 'Quests' },
    ...(isParent
      ? [{ id: 'catalog' as const, label: 'Catalog', count: catalogCount }]
      : []),
    { id: 'shop', label: 'Shop' },
    {
      id: 'vault',
      label: 'Vault',
      count: vaultCount || undefined,
    },
    { id: 'board', label: 'Board' },
    ...(isParent ? [{ id: 'rates' as const, label: 'Rates' }] : []),
  ];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Sword className="w-6 h-6 text-accent" />
            Chores
            <span className="text-sm font-medium text-muted">· ChoreQuest</span>
          </h1>
          {me && me.role !== 'media' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar
                  {...me}
                  size="sm"
                  avatarFlairShape={me.avatarFlairShape}
                  avatarFlairColor={me.avatarFlairColor}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{me.name}</p>
                  {nameFlairLabel(me.nameFlairText) ? (
                    <p
                      className={cn(
                        'text-[11px] truncate font-medium',
                        !me.nameFlairColor && 'text-accent',
                      )}
                      style={me.nameFlairColor ? { color: me.nameFlairColor } : undefined}
                    >
                      {nameFlairLabel(me.nameFlairText)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
        {isParent && tab === 'quests' && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New quest
          </Button>
        )}
        {isParent && tab === 'catalog' && (
          <Button onClick={catalogActions.openCatalogCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add template
          </Button>
        )}
      </div>

      {/* Progress + currencies (kids only — parents don't earn XP/coins/screen bank) */}
      {me && me.role !== 'media' && !isParent && (
        <Card className="!p-4 lg:!p-5 space-y-3">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar {...me} size="lg" />
              <span className="absolute -bottom-1 -right-1 min-w-[1.5rem] h-6 px-1 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center border-2 border-surface">
                {myBar.level}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-semibold text-fg truncate">
                  Level {myBar.level}
                  <span className="text-muted font-normal text-sm"> · {myProgress.xp} XP</span>
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${myBar.pct}%` }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {myBar.intoLevel} / {myBar.needed} XP to level {myBar.level + 1}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-inset border border-border px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted mb-0.5">Treasure</p>
              <p className="text-lg font-bold text-amber-600 flex items-center gap-1.5">
                <Coins className="w-4 h-4" />
                {myCoins}
              </p>
              <p className="text-[11px] text-muted mt-0.5">Earn from quests · spend in shop</p>
            </div>
            <div className="rounded-xl bg-inset border border-border px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted mb-0.5">Screen time</p>
              <p className="text-lg font-bold text-sky-600 flex items-center gap-1.5">
                <MonitorPlay className="w-4 h-4" />
                {myScreen}
                <span className="text-sm font-semibold">min</span>
              </p>
              <p className="text-[11px] text-muted mt-0.5">Buy with coins · spend to watch/play</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Use Screen Time</p>
            <p className="text-[11px] text-faint">
              Starts a timer and spends from your bank; stop early to refund unused minutes.
            </p>
            {screenTimers[myId] ? (
              <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-center space-y-2">
                <p className="text-3xl font-bold tabular-nums text-fg">
                  {formatCountdown(
                    Math.max(
                      0,
                      Math.ceil((new Date(screenTimers[myId]!.endsAt).getTime() - timerNow) / 1000),
                    ),
                  )}
                </p>
                <Button size="sm" variant="secondary" onClick={() => stopScreenTimer(myId)}>
                  <Square className="w-3.5 h-3.5" /> Stop · refund leftover
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      disabled={myScreen < m}
                      onClick={() => setSpendMins(m)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs border tabular-nums',
                        spendMins === m
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border text-muted hover:text-fg',
                        myScreen < m && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={myScreen < spendMins || spendMins <= 0}
                  onClick={() => startScreenTimer(myId, spendMins)}
                >
                  <Play className="w-3.5 h-3.5" /> Start · spend {Math.floor(spendMins)}m
                </Button>
                {myScreen <= 0 && (
                  <p className="text-xs text-warn">No minutes in the bank — buy some in the shop.</p>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {/* Parents: Use Screen Time — same timer model as home card (spend + countdown + refund) */}
      {isParent && kids.length > 0 && (
        <Card className="!p-4 lg:!p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-sky-600 shrink-0" />
              <h2 className="text-sm font-semibold text-fg">Use Screen Time</h2>
            </div>
            <span className="text-xs text-muted tabular-nums">{spendBalance}m bank</span>
          </div>
          <p className="text-[11px] text-muted">
            Pick who is watching, start a timer from their bank. Stop early to refund unused minutes —
            fairer than deducting a fixed block all at once.
          </p>
          <div
            className={cn(
              'grid gap-2 w-full',
              kids.length === 1 && 'grid-cols-1',
              kids.length === 2 && 'grid-cols-2',
              kids.length >= 3 && 'grid-cols-3',
            )}
          >
            {kids.map((k) => {
              const look = getMember(k.id) || k;
              const bal = screenTimeMap[k.id] ?? 0;
              const selected = spendMemberId === k.id;
              const running = !!screenTimers[k.id];
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setSpendMemberId(k.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-colors min-h-[3.25rem]',
                    selected
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-inset hover:bg-nav-hover hover:border-border-strong',
                  )}
                >
                  <Avatar
                    {...look}
                    size="md"
                    className="!w-11 !h-11 !text-2xl !rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg truncate">
                      {look.name}
                      {running ? ' ⏱' : ''}
                    </p>
                    <p
                      className={cn(
                        'text-[11px] tabular-nums font-medium',
                        bal > 0 ? 'text-sky-600' : 'text-faint',
                      )}
                    >
                      {bal}m bank
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {activeTimer ? (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-center space-y-2">
              <p className="text-xs text-muted">
                {activeTimer.label || 'Screen time'} · {getMember(activeTimer.memberId)?.name}
              </p>
              <p
                className={cn(
                  'text-4xl font-bold tabular-nums tracking-tight',
                  timerRemainingSec <= 60 ? 'text-warn' : 'text-fg',
                )}
              >
                {formatCountdown(timerRemainingSec)}
              </p>
              <Button size="sm" variant="secondary" onClick={() => stopScreenTimer(spendMemberId)}>
                <Square className="w-3.5 h-3.5" /> Stop · refund leftover
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={m > spendBalance}
                    onClick={() => setSpendMins(m)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs border tabular-nums',
                      spendMins === m
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-border text-muted hover:text-fg',
                      m > spendBalance && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={spendBalance || 1}
                  value={spendMins}
                  onChange={(e) => setSpendMins(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent tabular-nums"
                />
                <input
                  value={timerLabel}
                  onChange={(e) => setTimerLabel(e.target.value)}
                  placeholder="What? (Nintendo…)"
                  className="flex-1 min-w-0 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={spendBalance < spendMins || spendMins <= 0}
                onClick={() => startScreenTimer(spendMemberId, spendMins, timerLabel)}
              >
                <Play className="w-3.5 h-3.5" /> Start · spend {Math.floor(spendMins)}m
              </Button>
              {spendBalance <= 0 && (
                <p className="text-xs text-warn">No minutes in the bank — earn some in ChoreQuest first.</p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* This week progress */}
      {me && me.role !== 'media' && (
        <Card className="!p-4 lg:!p-5 space-y-3">
          {!isParent && (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg">This week</h2>
                <span className="text-xs text-muted">
                  {daysLeft === 0 ? 'Week ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} until payout`}
                </span>
              </div>

              {/* Streak */}
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-muted">Weekday quests</span>
                  <span className="font-medium text-fg">
                    {Math.min(myStreak.completions, myStreak.target)}/{myStreak.target}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((myStreak.completions / myStreak.target) * 100))}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {myStreak.claimed ? (
                    <span className="text-xs text-emerald-600 font-medium">Weekend Chest claimed ✓</span>
                  ) : myStreak.ready ? (
                    <Button size="sm" onClick={claimChest}>
                      Open Weekend Chest · +{cq.streakCoins} coins · +{cq.streakXp} XP
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">
                      Finish {Math.max(0, myStreak.target - myStreak.completions)} more weekday quest
                      {myStreak.target - myStreak.completions === 1 ? '' : 's'} for the chest
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Interest + inspection */}
          <div className={cn('grid sm:grid-cols-2 gap-3', !isParent && 'pt-1')}>
            <div className="rounded-xl bg-inset border border-border px-3 py-2.5">
              <p className="text-xs text-muted mb-0.5">Projected interest</p>
              <p className="text-sm font-semibold text-fg">
                {interestPreview > 0 ? (
                  <>
                    +{interestPreview} coins{' '}
                    <span className="text-muted font-normal">
                      ({Math.round(cq.interestRate * 100)}% if you hold {myCoins})
                    </span>
                  </>
                ) : (
                  <span className="text-muted font-normal">Hold ≥{cq.interestMinBalance} coins to earn interest</span>
                )}
              </p>
            </div>
            <div className="rounded-xl bg-inset border border-border px-3 py-2.5">
              <p className="text-xs text-muted mb-0.5">House inspection</p>
              {inspectionPassed ? (
                <p className="text-sm font-semibold text-emerald-600">Passed · bonuses paid</p>
              ) : isParent ? (
                <Button size="sm" variant="secondary" onClick={onHouseInspection}>
                  Mark house clean · +{cq.inspectionCoins}c / +{cq.inspectionXp} XP each
                </Button>
              ) : (
                <p className="text-sm text-muted">Waiting on a parent</p>
              )}
            </div>
          </div>

          {chestMsg && !isParent && (
            <p className="text-sm text-accent font-medium">{chestMsg}</p>
          )}
        </Card>
      )}

      {/* Tabs — evenly spaced, scrollable as a fallback on very narrow screens */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-1 p-1.5 rounded-xl bg-inset border border-border min-w-max sm:min-w-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 rounded-lg px-3 py-2.5 text-sm font-medium text-center transition-colors whitespace-nowrap',
                tab === t.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-accent text-white text-[11px]">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── QUESTS TAB ─────────────────────────────────────── */}
      {tab === 'quests' && (
        <QuestsTab onCreate={openCreate} onEdit={openEdit} onLevelUp={setLevelUp} />
      )}

      {/* ── CATALOG TAB (parents) ───────────────────────────── */}
      {tab === 'catalog' && isParent && (
        <CatalogTab catalogActions={catalogActions} />
      )}

      {/* ── SHOP TAB ───────────────────────────────────────── */}
      {tab === 'shop' && (
        <ShopTab />
      )}

      {/* ── VAULT TAB ──────────────────────────────────────── */}
      {tab === 'vault' && (
        <VaultTab />
      )}

      {/* ── LEADERBOARD TAB ────────────────────────────────── */}
      {tab === 'board' && (
        <BoardTab />
      )}


      {/* ── RATES TAB (parents) ─────────────────────────────── */}
      {tab === 'rates' && isParent && <RatesTab cq={cq} />}

      <TemplateFormModal
        open={catalogActions.catalogEditOpen}
        onClose={catalogActions.closeCatalogModal}
        editTemplate={catalogActions.editTemplate}
      />

      <QuestFormModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditQuest(null);
        }}
        editQuest={editQuest}
        cq={cq}
      />
      {/* Shop item modal */}
      {/* Spend screen time */}
      <Modal open={spendOpen} onClose={() => setSpendOpen(false)} title="Use Screen Time">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Minutes come from the screen-time bank (bought with Treasure in the shop).
          </p>
          {isParent && kids.length > 0 && (
            <div>
              <label className="text-xs text-muted mb-1 block">Who</label>
              <select
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={spendMemberId}
                onChange={(e) => setSpendMemberId(e.target.value)}
              >
                {kids.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} · {(screenTimeMap[k.id] ?? 0)}m left
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-muted mb-1 block">Minutes to use</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={spendMins}
              onChange={(e) => setSpendMins(Number(e.target.value) || 0)}
            />
            <p className="text-xs text-muted mt-1">
              Available:{' '}
              {(screenTimeMap[spendMemberId] ?? 0)} min
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSpendOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                startScreenTimer(spendMemberId, spendMins, timerLabel);
                setSpendOpen(false);
              }}
              disabled={spendMins <= 0 || (screenTimeMap[spendMemberId] ?? 0) < spendMins}
            >
              Start timer · {spendMins || 0} min
            </Button>
          </div>
        </div>
      </Modal>

      {/* Level-up */}
      <Modal open={!!levelUp} onClose={() => setLevelUp(null)} title="Level up!">
        {levelUp && (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">⭐</div>
            <p className="text-lg font-bold text-fg">
              {levelUp.name} reached level {levelUp.level}!
            </p>
            <p className="text-sm text-muted">Keep the quests coming.</p>
            <Button className="mt-2" onClick={() => setLevelUp(null)}>
              Awesome
            </Button>
          </div>
        )}
      </Modal>

      <p className="text-[10px] text-muted/60 text-center pt-2 select-none" title="ChoreQuest UI build">
        ChoreQuest · {CHOREQUEST_UI_VERSION}
      </p>
    </div>
  );
}
