import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Pencil,
  Plus,
  ShoppingBag,
  Sparkles,
  Sword,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import type {
  Quest,
  QuestDifficulty,
  RedemptionRecord,
  RewardItem,
  RewardKind,
} from '../types';
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_REWARDS,
  buildQuest,
  ensureProgress,
  ensureRewardCatalog,
  isoWeekId,
  progressTowardNextLevel,
} from '../lib/quest';
import { cn } from '../lib/cn';

function newId() {
  return crypto.randomUUID();
}

type TabId = 'quests' | 'shop' | 'vault';

const KIND_LABEL: Record<RewardKind, string> = {
  screen_time: 'Screen time',
  treat: 'Treat',
  choice: 'Choice',
  late_bed: 'Late bedtime',
  allowance: 'Allowance',
  custom: 'Custom',
};

export function ChoresPage() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;
  const chores = data.chores || [];
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const catalog = ensureRewardCatalog(data.rewardCatalog);
  const redemptions = data.redemptions || [];

  // Seed catalog into family data once if empty
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editQuest, setEditQuest] = useState<Quest | null>(null);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('medium');
  const [levelUp, setLevelUp] = useState<{ name: string; level: number } | null>(null);
  const [shopEditOpen, setShopEditOpen] = useState(false);
  const [shopForm, setShopForm] = useState<{
    id?: string;
    label: string;
    icon: string;
    kind: RewardKind;
    coinCost: number;
    screenMinutes: number;
    featured: boolean;
  }>({
    label: '',
    icon: '🎁',
    kind: 'custom',
    coinCost: 20,
    screenMinutes: 0,
    featured: false,
  });

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

  const pendingRedemptions = useMemo(
    () =>
      redemptions
        .filter((r) => r.status === 'pending')
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [redemptions],
  );
  const myPendingRedemptions = useMemo(
    () => pendingRedemptions.filter((r) => r.memberId === myId),
    [pendingRedemptions, myId],
  );
  const recentRedemptions = useMemo(
    () =>
      redemptions
        .filter((r) => r.status !== 'pending')
        .sort((a, b) => (b.fulfilledAt || b.requestedAt).localeCompare(a.fulfilledAt || a.requestedAt))
        .slice(0, 15),
    [redemptions],
  );

  const activeShop = useMemo(
    () =>
      catalog
        .filter((r) => r.active)
        .slice()
        .sort((a, b) => a.sort - b.sort || a.coinCost - b.coinCost),
    [catalog],
  );

  /* ─── Quest CRUD ───────────────────────────────────────── */

  const openCreate = () => {
    setEditQuest(null);
    setTitle('');
    setDifficulty('medium');
    setCreateOpen(true);
  };

  const openEdit = (q: Quest) => {
    setEditQuest(q);
    setTitle(q.title);
    setDifficulty(q.difficulty || 'medium');
    setCreateOpen(true);
  };

  const saveQuest = () => {
    if (!title.trim() || !me) return;
    if (editQuest) {
      const meta = DIFFICULTY_REWARDS[difficulty];
      update((d) => ({
        ...d,
        chores: (d.chores || []).map((c) =>
          c.id === editQuest.id
            ? {
                ...c,
                title: title.trim(),
                difficulty,
                xp: meta.xp,
                coins: meta.coins,
                rewardMinutes: 0,
              }
            : c,
        ),
      }));
    } else {
      const q = buildQuest({ title, difficulty, createdById: me.id });
      update((d) => ({
        ...d,
        chores: [q, ...(d.chores || [])],
      }));
    }
    setTitle('');
    setDifficulty('medium');
    setEditQuest(null);
    setCreateOpen(false);
  };

  const deleteQuest = (quest: Quest) => {
    if (!isParent) return;
    if (!confirm(`Delete “${quest.title}”?`)) return;
    update((d) => ({
      ...d,
      chores: (d.chores || []).filter((c) => c.id !== quest.id),
    }));
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

      if (leveledUp) {
        const kid = d.members.find((m) => m.id === forId);
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
                rewardMinutes: 0,
              }
            : c,
        ),
        memberProgress: nextProgress,
        coinBalances: nextBalances,
        coinLedger: nextLedger,
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

  /* ─── Shop / redeem / vault ────────────────────────────── */

  const redeem = (item: RewardItem) => {
    if (!me || me.role === 'media') return;
    const balance = coinBalances[myId] ?? 0;
    if (balance < item.coinCost) return;
    if (!confirm(`Spend ${item.coinCost} coins on “${item.label}”?`)) return;

    const at = new Date().toISOString();
    const weekId = isoWeekId();
    const redemptionId = newId();
    const isScreen = item.kind === 'screen_time' && (item.screenMinutes || 0) > 0;

    update((d) => {
      const bal = d.coinBalances?.[myId] ?? 0;
      if (bal < item.coinCost) return d;

      const nextBalances = {
        ...(d.coinBalances || {}),
        [myId]: bal - item.coinCost,
      };

      const spendEntry = {
        id: `redeem:${redemptionId}`,
        memberId: myId,
        delta: -item.coinCost,
        reason: 'redeem' as const,
        label: item.label,
        refId: redemptionId,
        byId: me.id,
        at,
        weekId,
      };

      const record: RedemptionRecord = {
        id: redemptionId,
        memberId: myId,
        rewardItemId: item.id,
        label: item.label,
        kind: item.kind,
        coinCost: item.coinCost,
        screenMinutes: item.screenMinutes,
        status: isScreen ? 'fulfilled' : 'pending',
        requestedAt: at,
        fulfilledAt: isScreen ? at : undefined,
        fulfilledById: isScreen ? me.id : undefined,
      };

      let nextScreen = d.screenTime || {};
      let nextLog = d.screenTimeLog || [];
      if (isScreen) {
        const mins = item.screenMinutes || 0;
        nextScreen = {
          ...nextScreen,
          [myId]: (nextScreen[myId] || 0) + mins,
        };
        nextLog = [
          {
            id: newId(),
            memberId: myId,
            delta: mins,
            reason: `Redeemed: ${item.label}`,
            byId: me.id,
            at,
          },
          ...nextLog,
        ].slice(0, 100);
      }

      return {
        ...d,
        coinBalances: nextBalances,
        coinLedger: [spendEntry, ...(d.coinLedger || [])].slice(0, 200),
        redemptions: [record, ...(d.redemptions || [])].slice(0, 100),
        screenTime: nextScreen,
        screenTimeLog: nextLog,
        rewardCatalog: ensureRewardCatalog(d.rewardCatalog),
      };
    });
  };

  const fulfillRedemption = (r: RedemptionRecord) => {
    if (!isParent || !me) return;
    update((d) => ({
      ...d,
      redemptions: (d.redemptions || []).map((x) =>
        x.id === r.id
          ? {
              ...x,
              status: 'fulfilled' as const,
              fulfilledAt: new Date().toISOString(),
              fulfilledById: me.id,
            }
          : x,
      ),
    }));
  };

  const cancelRedemption = (r: RedemptionRecord) => {
    if (!isParent || !me) return;
    if (!confirm(`Cancel “${r.label}” and refund ${r.coinCost} coins?`)) return;
    const at = new Date().toISOString();
    const weekId = isoWeekId();

    update((d) => {
      if (r.status !== 'pending') return d;
      const bal = d.coinBalances?.[r.memberId] ?? 0;
      return {
        ...d,
        coinBalances: {
          ...(d.coinBalances || {}),
          [r.memberId]: bal + r.coinCost,
        },
        coinLedger: [
          {
            id: `refund:${r.id}`,
            memberId: r.memberId,
            delta: r.coinCost,
            reason: 'adjust' as const,
            label: `Refund: ${r.label}`,
            refId: r.id,
            byId: me.id,
            at,
            weekId,
          },
          ...(d.coinLedger || []),
        ].slice(0, 200),
        redemptions: (d.redemptions || []).map((x) =>
          x.id === r.id ? { ...x, status: 'cancelled' as const, fulfilledAt: at, fulfilledById: me.id } : x,
        ),
      };
    });
  };

  const openShopCreate = () => {
    setShopForm({
      label: '',
      icon: '🎁',
      kind: 'custom',
      coinCost: 20,
      screenMinutes: 0,
      featured: false,
    });
    setShopEditOpen(true);
  };

  const openShopEdit = (item: RewardItem) => {
    setShopForm({
      id: item.id,
      label: item.label,
      icon: item.icon,
      kind: item.kind,
      coinCost: item.coinCost,
      screenMinutes: item.screenMinutes || 0,
      featured: !!item.featured,
    });
    setShopEditOpen(true);
  };

  const saveShopItem = () => {
    if (!shopForm.label.trim() || !isParent) return;
    update((d) => {
      const list = ensureRewardCatalog(d.rewardCatalog);
      if (shopForm.id) {
        return {
          ...d,
          rewardCatalog: list.map((r) =>
            r.id === shopForm.id
              ? {
                  ...r,
                  label: shopForm.label.trim(),
                  icon: shopForm.icon || '🎁',
                  kind: shopForm.kind,
                  coinCost: Math.max(1, Math.floor(shopForm.coinCost) || 1),
                  screenMinutes:
                    shopForm.kind === 'screen_time'
                      ? Math.max(0, Math.floor(shopForm.screenMinutes) || 0)
                      : undefined,
                  featured: shopForm.featured,
                }
              : r,
          ),
        };
      }
      const item: RewardItem = {
        id: newId(),
        label: shopForm.label.trim(),
        icon: shopForm.icon || '🎁',
        kind: shopForm.kind,
        coinCost: Math.max(1, Math.floor(shopForm.coinCost) || 1),
        screenMinutes:
          shopForm.kind === 'screen_time'
            ? Math.max(0, Math.floor(shopForm.screenMinutes) || 0)
            : undefined,
        featured: shopForm.featured,
        active: true,
        sort: list.length * 10 + 10,
      };
      return { ...d, rewardCatalog: [...list, item] };
    });
    setShopEditOpen(false);
  };

  const deactivateShopItem = (item: RewardItem) => {
    if (!isParent) return;
    if (!confirm(`Remove “${item.label}” from the shop?`)) return;
    update((d) => ({
      ...d,
      rewardCatalog: ensureRewardCatalog(d.rewardCatalog).map((r) =>
        r.id === item.id ? { ...r, active: false } : r,
      ),
    }));
  };

  /* ─── UI helpers ───────────────────────────────────────── */

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
          <div className="min-w-0 flex-1">
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
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {forMember && mode !== 'open' && <Avatar {...forMember} size="sm" />}
            {isParent && mode !== 'done' && (
              <>
                <button
                  type="button"
                  onClick={() => openEdit(quest)}
                  className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
                  title="Edit quest"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuest(quest)}
                  className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-nav-hover"
                  title="Delete quest"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {isParent && mode === 'done' && (
              <button
                type="button"
                onClick={() => deleteQuest(quest)}
                className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-nav-hover"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {mode === 'open' && me && me.role !== 'media' && (
          <Button size="sm" variant="secondary" className="self-start" onClick={() => submitQuest(quest)}>
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

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'quests', label: 'Quests' },
    { id: 'shop', label: 'Shop' },
    {
      id: 'vault',
      label: 'Vault',
      count: isParent ? pendingRedemptions.length : myPendingRedemptions.length,
    },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
            <Sword className="w-6 h-6 text-accent" />
            Chores
            <span className="text-sm font-medium text-muted">· ChoreQuest</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            Complete quests, earn Treasure, spend it in the shop.
          </p>
        </div>
        {isParent && tab === 'quests' && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New quest
          </Button>
        )}
        {isParent && tab === 'shop' && (
          <Button onClick={openShopCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add reward
          </Button>
        )}
      </div>

      {/* Progress */}
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

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-inset border border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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

      {/* ── QUESTS TAB ─────────────────────────────────────── */}
      {tab === 'quests' && (
        <>
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
                  <Button className="mt-4" onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-1.5" />
                    New quest
                  </Button>
                )}
              </Card>
            ) : (
              openQuests.map((q) => <QuestCard key={q.id} quest={q} mode="open" />)
            )}
          </section>

          {doneQuests.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Recently completed
              </h2>
              {doneQuests.map((q) => (
                <QuestCard key={q.id} quest={q} mode="done" />
              ))}
            </section>
          )}
        </>
      )}

      {/* ── SHOP TAB ───────────────────────────────────────── */}
      {tab === 'shop' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Reward shop
            </h2>
            <p className="text-sm font-semibold text-amber-600 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              {myCoins} coins
            </p>
          </div>

          {activeShop.length === 0 ? (
            <Card className="!p-8 text-center">
              <p className="text-muted text-sm">Shop is empty.</p>
              {isParent && (
                <Button className="mt-4" onClick={openShopCreate}>
                  Add reward
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {activeShop.map((item) => {
                const canAfford = myCoins >= item.coinCost;
                return (
                  <Card
                    key={item.id}
                    className={cn('!p-4 flex flex-col gap-3', item.featured && 'border-accent/40')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl w-10 h-10 rounded-xl bg-inset flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-fg leading-tight">
                          {item.label}
                          {item.featured && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-accent font-bold">
                              Featured
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted mt-0.5">{KIND_LABEL[item.kind]}</p>
                        <p className="text-sm font-semibold text-amber-600 mt-1 flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          {item.coinCost}
                          {item.kind === 'screen_time' && item.screenMinutes
                            ? ` · ${item.screenMinutes}m`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      {me && me.role !== 'media' && (
                        <Button
                          size="sm"
                          disabled={!canAfford}
                          onClick={() => redeem(item)}
                          className="flex-1"
                        >
                          {canAfford ? 'Redeem' : 'Need more coins'}
                        </Button>
                      )}
                      {isParent && (
                        <>
                          <button
                            type="button"
                            onClick={() => openShopEdit(item)}
                            className="p-2 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deactivateShopItem(item)}
                            className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-nav-hover"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted text-center pt-2">
            Screen-time rewards apply instantly. Everything else waits in the Vault for a parent.
          </p>
        </section>
      )}

      {/* ── VAULT TAB ──────────────────────────────────────── */}
      {tab === 'vault' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
              {isParent ? 'Pending fulfillment' : 'Your pending rewards'}
            </h2>
            {(isParent ? pendingRedemptions : myPendingRedemptions).length === 0 ? (
              <Card className="!p-6 text-center">
                <p className="text-sm text-muted">Nothing waiting — vault is clear.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(isParent ? pendingRedemptions : myPendingRedemptions).map((r) => {
                  const who = getMember(r.memberId);
                  return (
                    <Card key={r.id} className="!p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {who && <Avatar {...who} size="sm" />}
                        <div className="min-w-0">
                          <p className="font-medium text-fg truncate">{r.label}</p>
                          <p className="text-xs text-muted">
                            {who?.name || 'Someone'} · {r.coinCost} coins ·{' '}
                            {new Date(r.requestedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      {isParent && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" onClick={() => fulfillRedemption(r)}>
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Fulfilled
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelRedemption(r)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {recentRedemptions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
                Recent history
              </h2>
              <div className="space-y-2">
                {recentRedemptions
                  .filter((r) => isParent || r.memberId === myId)
                  .map((r) => {
                    const who = getMember(r.memberId);
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-inset border border-border text-sm"
                      >
                        <span className="text-lg">{r.kind === 'screen_time' ? '📱' : '🎁'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-fg truncate">
                            {r.label}
                            <span className="text-muted">
                              {' '}
                              · {who?.name}
                            </span>
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-xs font-medium shrink-0',
                            r.status === 'fulfilled' ? 'text-emerald-600' : 'text-muted',
                          )}
                        >
                          {r.status === 'fulfilled' ? 'Done' : 'Cancelled'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Create / edit quest modal */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditQuest(null);
        }}
        title={editQuest ? 'Edit quest' : 'New quest'}
      >
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
                if (e.key === 'Enter') saveQuest();
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
                      selected ? 'border-accent bg-accent/10' : 'border-border hover:bg-nav-hover',
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
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setEditQuest(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveQuest} disabled={!title.trim()}>
              {editQuest ? 'Save changes' : 'Post quest'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Shop item modal */}
      <Modal open={shopEditOpen} onClose={() => setShopEditOpen(false)} title={shopForm.id ? 'Edit reward' : 'Add reward'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Label</label>
            <input
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={shopForm.label}
              onChange={(e) => setShopForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Pick the movie"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Icon (emoji)</label>
              <input
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={shopForm.icon}
                onChange={(e) => setShopForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Coin cost</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={shopForm.coinCost}
                onChange={(e) =>
                  setShopForm((f) => ({ ...f, coinCost: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Kind</label>
            <select
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={shopForm.kind}
              onChange={(e) =>
                setShopForm((f) => ({ ...f, kind: e.target.value as RewardKind }))
              }
            >
              {(Object.keys(KIND_LABEL) as RewardKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {shopForm.kind === 'screen_time' && (
            <div>
              <label className="text-xs text-muted mb-1 block">Screen minutes</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={shopForm.screenMinutes}
                onChange={(e) =>
                  setShopForm((f) => ({ ...f, screenMinutes: Number(e.target.value) || 0 }))
                }
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={shopForm.featured}
              onChange={(e) => setShopForm((f) => ({ ...f, featured: e.target.checked }))}
            />
            Featured (highlight as aspirational, e.g. Weekend Pass)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShopEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveShopItem} disabled={!shopForm.label.trim()}>
              {shopForm.id ? 'Save' : 'Add to shop'}
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
    </div>
  );
}
