import { useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Plus,
  Sparkles,
  Sword,
  Trophy,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import type { Quest, QuestDifficulty } from '../types';
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_REWARDS,
  buildQuest,
  ensureProgress,
  isoWeekId,
  progressTowardNextLevel,
} from '../lib/quest';
import { cn } from '../lib/cn';

function newId() {
  return crypto.randomUUID();
}

export function ChoresPage() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;
  const chores = data.chores || [];
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('medium');
  const [levelUp, setLevelUp] = useState<{ name: string; level: number } | null>(null);

  const openQuests = useMemo(
    () => chores.filter((c) => c.status === 'open' || !c.status),
    [chores],
  );
  const pendingQuests = useMemo(
    () => chores.filter((c) => c.status === 'pending'),
    [chores],
  );
  const doneQuests = useMemo(
    () =>
      chores
        .filter((c) => c.status === 'done')
        .sort((a, b) => (b.approvedAt || '').localeCompare(a.approvedAt || ''))
        .slice(0, 12),
    [chores],
  );

  const myProgress = ensureProgress(progressMap[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);
  const myCoins = coinBalances[myId] ?? 0;

  const kids = useMemo(
    () => data.members.filter((m) => m.role === 'kid'),
    [data.members],
  );

  const createQuest = () => {
    if (!title.trim() || !me) return;
    const q = buildQuest({ title, difficulty, createdById: me.id });
    update((d) => ({
      ...d,
      chores: [q, ...(d.chores || [])],
    }));
    setTitle('');
    setDifficulty('medium');
    setCreateOpen(false);
  };

  const submitQuest = (quest: Quest) => {
    if (!me || me.role === 'media') return;
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) =>
        c.id === quest.id
          ? {
              ...c,
              status: 'pending' as const,
              submittedById: me.id,
              submittedAt: new Date().toISOString(),
            }
          : c,
      ),
    }));
  };

  const approveQuest = (quest: Quest) => {
    if (!me || !isParent) return;
    const forId = quest.submittedById || quest.approvedForId;
    if (!forId) return;

    const xpGain = quest.xp ?? DIFFICULTY_REWARDS[quest.difficulty || 'medium'].xp;
    const coinGain = quest.coins ?? DIFFICULTY_REWARDS[quest.difficulty || 'medium'].coins;
    const minutes = quest.rewardMinutes ?? 0;
    const at = new Date().toISOString();
    const weekId = isoWeekId();

    update((d) => {
      const prevProg = ensureProgress(d.memberProgress?.[forId]);
      const newXp = prevProg.xp + xpGain;
      const newLevel = progressTowardNextLevel(newXp).level;
      const leveledUp = newLevel > prevProg.level;

      const nextProgress = {
        ...(d.memberProgress || {}),
        [forId]: { xp: newXp, level: newLevel },
      };

      const prevCoins = d.coinBalances?.[forId] ?? 0;
      const nextBalances = {
        ...(d.coinBalances || {}),
        [forId]: prevCoins + coinGain,
      };

      const ledgerEntry = {
        id: `quest:${quest.id}:${forId}`,
        memberId: forId,
        delta: coinGain,
        reason: 'quest' as const,
        label: quest.title,
        refId: quest.id,
        byId: me.id,
        at,
        weekId,
      };

      const nextLedger = [ledgerEntry, ...(d.coinLedger || [])].slice(0, 200);

      let nextScreen = d.screenTime || {};
      let nextLog = d.screenTimeLog || [];
      if (minutes > 0) {
        nextScreen = {
          ...nextScreen,
          [forId]: (nextScreen[forId] || 0) + minutes,
        };
        nextLog = [
          {
            id: newId(),
            memberId: forId,
            delta: minutes,
            reason: `Quest: ${quest.title}`,
            byId: me.id,
            at,
          },
          ...nextLog,
        ].slice(0, 100);
      }

      if (leveledUp) {
        const kid = d.members.find((m) => m.id === forId);
        // Defer modal so state commit finishes first
        queueMicrotask(() => setLevelUp({ name: kid?.name || 'Hero', level: newLevel }));
      }

      return {
        ...d,
        chores: (d.chores || []).map((c) =>
          c.id === quest.id
            ? {
                ...c,
                status: 'done' as const,
                approvedForId: forId,
                approvedById: me.id,
                approvedAt: at,
              }
            : c,
        ),
        memberProgress: nextProgress,
        coinBalances: nextBalances,
        coinLedger: nextLedger,
        screenTime: nextScreen,
        screenTimeLog: nextLog,
      };
    });
  };

  const rejectQuest = (quest: Quest) => {
    if (!isParent) return;
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) =>
        c.id === quest.id
          ? {
              ...c,
              status: 'open' as const,
              submittedById: undefined,
              submittedAt: undefined,
            }
          : c,
      ),
    }));
  };

  const difficultyBadge = (d: QuestDifficulty) => {
    const meta = DIFFICULTY_REWARDS[d] || DIFFICULTY_REWARDS.medium;
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
          d === 'easy' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/25',
          d === 'medium' && 'bg-amber-500/10 text-amber-600 border-amber-500/25',
          d === 'epic' && 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/25',
        )}
      >
        <span>{meta.emoji}</span>
        {meta.label}
      </span>
    );
  };

  const QuestCard = ({
    quest,
    mode,
  }: {
    quest: Quest;
    mode: 'open' | 'pending' | 'done';
  }) => {
    const diff = quest.difficulty || 'medium';
    const meta = DIFFICULTY_REWARDS[diff] || DIFFICULTY_REWARDS.medium;
    const submitter = quest.submittedById ? getMember(quest.submittedById) : undefined;
    const forMember = quest.approvedForId ? getMember(quest.approvedForId) : submitter;

    return (
      <Card className="!p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-fg truncate">{quest.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {difficultyBadge(diff)}
              <span className="text-xs text-muted flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-accent" />
                +{quest.xp ?? meta.xp} XP
              </span>
              <span className="text-xs text-muted flex items-center gap-1">
                <Coins className="w-3 h-3 text-amber-500" />
                +{quest.coins ?? meta.coins}
              </span>
              {(quest.rewardMinutes || 0) > 0 && (
                <span className="text-xs text-muted">+{quest.rewardMinutes}m screen</span>
              )}
            </div>
          </div>
          {forMember && mode !== 'open' && (
            <Avatar {...forMember} size="sm" className="shrink-0" />
          )}
        </div>

        {mode === 'open' && me && me.role !== 'media' && (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() => submitQuest(quest)}
          >
            I finished this
          </Button>
        )}

        {mode === 'pending' && isParent && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted flex-1">
              {submitter ? `${submitter.name} is waiting` : 'Waiting for approval'}
              <span className="text-fg font-medium">
                {' '}
                · +{quest.xp ?? meta.xp} XP · +{quest.coins ?? meta.coins} coins
              </span>
            </p>
            <Button size="sm" onClick={() => approveQuest(quest)}>
              <Check className="w-3.5 h-3.5 mr-1" />
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => rejectQuest(quest)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {mode === 'pending' && !isParent && quest.submittedById === myId && (
          <p className="text-xs text-amber-600">Waiting for a parent to approve…</p>
        )}

        {mode === 'done' && (
          <p className="text-xs text-muted">
            Approved
            {forMember ? ` for ${forMember.name}` : ''}
            {quest.approvedAt
              ? ` · ${new Date(quest.approvedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
          </p>
        )}
      </Card>
    );
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header + kid progress */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Sword className="w-6 h-6 text-accent" />
            Chores
            <span className="text-sm font-medium text-muted">· ChoreQuest</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            Complete quests, earn XP and Treasure, level up.
          </p>
        </div>
        {isParent && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New quest
          </Button>
        )}
      </div>

      {/* Personal progress (kids + parents can see their own) */}
      {me && me.role !== 'media' && (
        <Card className="!p-4 lg:!p-5">
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
                <p className="text-sm font-semibold text-amber-600 flex items-center gap-1 shrink-0">
                  <Coins className="w-4 h-4" />
                  {myCoins}
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
        </Card>
      )}

      {/* Parent: household levels snapshot */}
      {isParent && kids.length > 0 && (
        <Card className="!p-4">
          <h2 className="text-sm font-semibold text-fg mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            Party levels
          </h2>
          <div className="flex flex-wrap gap-3">
            {kids.map((k) => {
              const look = getMember(k.id) || k;
              const prog = ensureProgress(progressMap[k.id]);
              const bar = progressTowardNextLevel(prog.xp);
              const coins = coinBalances[k.id] ?? 0;
              return (
                <div
                  key={k.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-inset border border-border"
                >
                  <Avatar {...look} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-fg leading-tight">{k.name}</p>
                    <p className="text-[11px] text-muted">
                      Lv {bar.level} · {coins} coins
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Pending approval — parents first */}
      {pendingQuests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {isParent ? 'Awaiting approval' : 'Pending'}
          </h2>
          {pendingQuests.map((q) => (
            <QuestCard key={q.id} quest={q} mode="pending" />
          ))}
        </section>
      )}

      {/* Open quests */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Open quests</h2>
        {openQuests.length === 0 ? (
          <Card className="!p-8 text-center">
            <p className="text-muted text-sm">
              {isParent
                ? 'No open quests. Post one to get the party moving.'
                : 'No open quests right now — check back soon.'}
            </p>
            {isParent && (
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" />
                New quest
              </Button>
            )}
          </Card>
        ) : (
          openQuests.map((q) => <QuestCard key={q.id} quest={q} mode="open" />)
        )}
      </section>

      {/* Recent done */}
      {doneQuests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recently completed</h2>
          {doneQuests.map((q) => (
            <QuestCard key={q.id} quest={q} mode="done" />
          ))}
        </section>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New quest">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">What needs doing?</label>
            <input
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vacuum the living room"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') createQuest();
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-2 block">Difficulty</label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTY_ORDER.map((d) => {
                const meta = DIFFICULTY_REWARDS[d];
                const selected = difficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      selected
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:bg-nav-hover',
                    )}
                  >
                    <p className="text-sm font-semibold text-fg">
                      {meta.emoji} {meta.label}
                    </p>
                    <p className="text-[11px] text-muted mt-1">
                      +{meta.xp} XP · +{meta.coins} coins
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createQuest} disabled={!title.trim()}>
              Post quest
            </Button>
          </div>
        </div>
      </Modal>

      {/* Level-up moment */}
      <Modal
        open={!!levelUp}
        onClose={() => setLevelUp(null)}
        title="Level up!"
      >
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
    </div>
  );
}
