import { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Check,
  Coins,
  MonitorPlay,
  Pencil,
  Plus,
  ShoppingBag,
  Sparkles,
  Sword,
  RotateCcw,
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
  FamilyData,
  Quest,
  QuestDifficulty,
  QuestTemplate,
  RedemptionRecord,
  RewardItem,
  RewardKind,
} from '../types';
import {
  DIFFICULTY_ORDER,
  DIFFICULTY_REWARDS,
  buildQuest,
  buildQuestFromTemplate,
  buildQuestTemplate,
  ensureProgress,
  ensureQuestCatalog,
  ensureRewardCatalog,
  getChoreQuestConfig,
  isoWeekId,
  progressTowardNextLevel,
  rewardsForDifficultyWithConfig,
} from '../lib/quest';
import {
  claimStreakChest,
  daysUntilWeekEnd,
  ensureWeekRollover,
  markHouseInspection,
  projectedInterest,
  recordWeekdayCompletion,
  streakStatus,
} from '../lib/weekCycle';
import type { ChoreQuestConfig } from '../types';
import { cn } from '../lib/cn';

function newId() {
  return crypto.randomUUID();
}

/** Bump when shipping a Chores/ChoreQuest UI change so deploy lag is obvious. */
const CHOREQUEST_UI_VERSION = 'catalog-1';

type TabId = 'quests' | 'catalog' | 'shop' | 'vault' | 'board' | 'rates';

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
  const [createOpen, setCreateOpen] = useState(false);
  const [editQuest, setEditQuest] = useState<Quest | null>(null);
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('medium');
  const [customRewards, setCustomRewards] = useState(false);
  const [customXp, setCustomXp] = useState(25);
  const [customCoins, setCustomCoins] = useState(12);
  const [alsoSaveToCatalog, setAlsoSaveToCatalog] = useState(false);
  const [levelUp, setLevelUp] = useState<{ name: string; level: number } | null>(null);
  const [ratesDraft, setRatesDraft] = useState<ChoreQuestConfig | null>(null);
  const [shopEditOpen, setShopEditOpen] = useState(false);
  const [catalogEditOpen, setCatalogEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<QuestTemplate | null>(null);
  const [tplTitle, setTplTitle] = useState('');
  const [tplDifficulty, setTplDifficulty] = useState<QuestDifficulty>('medium');
  const [tplCustom, setTplCustom] = useState(false);
  const [tplXp, setTplXp] = useState(25);
  const [tplCoins, setTplCoins] = useState(12);
  const [showArchivedTemplates, setShowArchivedTemplates] = useState(false);
  const [chestMsg, setChestMsg] = useState<string | null>(null);

  // Idempotent weekly rollover (safe if app wasn't opened all weekend)
  useEffect(() => {
    if (!me) return;
    update((d) => ensureWeekRollover(d, me.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (tab === 'rates' && isParent) {
      setRatesDraft(getChoreQuestConfig(data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
        .slice(0, 40),
    [chores],
  );

  const myProgress = ensureProgress(progressMap[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);
  const myCoins = coinBalances[myId] ?? 0;
  const screenTimeMap = data.screenTime || {};
  const myScreen = screenTimeMap[myId] ?? 0;
  const cq = getChoreQuestConfig(data);
  const weekState = data.weekState;
  const myStreak = streakStatus(weekState, myId, cq);
  const interestPreview = projectedInterest(myCoins, cq);
  const daysLeft = daysUntilWeekEnd();
  const inspectionPassed = !!weekState?.houseInspectionPassed;

  const kids = useMemo(
    () => data.members.filter((m) => m.role === 'kid'),
    [data.members],
  );

  const leaderboard = useMemo(() => {
    return kids
      .map((k) => {
        const prog = ensureProgress(progressMap[k.id]);
        const bar = progressTowardNextLevel(prog.xp);
        const streak = streakStatus(weekState, k.id, cq);
        return {
          member: k,
          xp: prog.xp,
          level: bar.level,
          coins: coinBalances[k.id] ?? 0,
          weekQuests: streak.completions,
          chestClaimed: streak.claimed,
        };
      })
      .sort((a, b) => b.level - a.level || b.xp - a.xp || b.weekQuests - a.weekQuests);
  }, [kids, progressMap, coinBalances, weekState]);

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
    setCustomRewards(false);
    const r = rewardsForDifficultyWithConfig('medium', cq);
    setCustomXp(r.xp);
    setCustomCoins(r.coins);
    setCreateOpen(true);
  };

  const openEdit = (q: Quest) => {
    setEditQuest(q);
    setTitle(q.title);
    setDifficulty(q.difficulty || 'medium');
    const base = rewardsForDifficultyWithConfig(q.difficulty || 'medium', cq);
    const isCustom = (q.xp ?? base.xp) !== base.xp || (q.coins ?? base.coins) !== base.coins;
    setCustomRewards(isCustom);
    setCustomXp(q.xp ?? base.xp);
    setCustomCoins(q.coins ?? base.coins);
    setCreateOpen(true);
  };

  const saveQuest = () => {
    if (!title.trim() || !me) return;
    const meta = rewardsForDifficultyWithConfig(difficulty, cq);
    const xp = customRewards ? customXp : meta.xp;
    const coins = customRewards ? customCoins : meta.coins;
    if (editQuest) {
      update((d) => ({
        ...d,
        chores: (d.chores || []).map((c) =>
          c.id === editQuest.id
            ? {
                ...c,
                title: title.trim(),
                difficulty,
                xp: Math.max(0, Math.floor(xp)),
                coins: Math.max(0, Math.floor(coins)),
                rewardMinutes: 0,
              }
            : c,
        ),
      }));
    } else {
      const q = buildQuest({
        title,
        difficulty,
        createdById: me.id,
        xp: customRewards ? xp : undefined,
        coins: customRewards ? coins : undefined,
        config: cq,
      });
      update((d) => {
        let next: FamilyData = {
          ...d,
          chores: [q, ...(d.chores || [])],
        };
        // Optionally also add a reusable template to the master catalog
        if (alsoSaveToCatalog && isParent) {
          const list = ensureQuestCatalog(d.questCatalog);
          const tpl = buildQuestTemplate({
            title,
            difficulty,
            xp: customRewards ? xp : undefined,
            coins: customRewards ? coins : undefined,
            sort: list.length * 10 + 10,
          });
          next = { ...next, questCatalog: [...list, tpl] };
        }
        return next;
      });
    }
    setTitle('');
    setDifficulty('medium');
    setCustomRewards(false);
    setAlsoSaveToCatalog(false);
    setEditQuest(null);
    setCreateOpen(false);
  };

  /* ─── Quest catalog (templates) ─────────────────────────── */

  const activeTemplates = useMemo(
    () =>
      questCatalog
        .filter((t) => t.active)
        .slice()
        .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title)),
    [questCatalog],
  );
  const archivedTemplates = useMemo(
    () =>
      questCatalog
        .filter((t) => !t.active)
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title)),
    [questCatalog],
  );

  const openCatalogCreate = () => {
    setEditTemplate(null);
    setTplTitle('');
    setTplDifficulty('medium');
    setTplCustom(false);
    const r = rewardsForDifficultyWithConfig('medium', cq);
    setTplXp(r.xp);
    setTplCoins(r.coins);
    setCatalogEditOpen(true);
  };

  const openCatalogEdit = (t: QuestTemplate) => {
    setEditTemplate(t);
    setTplTitle(t.title);
    setTplDifficulty(t.difficulty || 'medium');
    const base = rewardsForDifficultyWithConfig(t.difficulty || 'medium', cq);
    const isCustom =
      (t.xp != null && t.xp !== base.xp) || (t.coins != null && t.coins !== base.coins);
    setTplCustom(isCustom);
    setTplXp(t.xp ?? base.xp);
    setTplCoins(t.coins ?? base.coins);
    setCatalogEditOpen(true);
  };

  const saveTemplate = () => {
    if (!tplTitle.trim() || !isParent) return;
    const now = new Date().toISOString();
    update((d) => {
      const list = ensureQuestCatalog(d.questCatalog);
      if (editTemplate) {
        return {
          ...d,
          questCatalog: list.map((t) =>
            t.id === editTemplate.id
              ? {
                  ...t,
                  title: tplTitle.trim(),
                  difficulty: tplDifficulty,
                  xp: tplCustom ? Math.max(0, Math.floor(tplXp)) : undefined,
                  coins: tplCustom ? Math.max(0, Math.floor(tplCoins)) : undefined,
                  updatedAt: now,
                }
              : t,
          ),
        };
      }
      const tpl = buildQuestTemplate({
        title: tplTitle,
        difficulty: tplDifficulty,
        xp: tplCustom ? tplXp : undefined,
        coins: tplCustom ? tplCoins : undefined,
        sort: list.length * 10 + 10,
      });
      return { ...d, questCatalog: [...list, tpl] };
    });
    setCatalogEditOpen(false);
    setEditTemplate(null);
  };

  const archiveTemplate = (t: QuestTemplate) => {
    if (!isParent) return;
    if (!confirm(`Archive “${t.title}” from the catalog? (You can restore it later.)`)) return;
    update((d) => ({
      ...d,
      questCatalog: ensureQuestCatalog(d.questCatalog).map((x) =>
        x.id === t.id ? { ...x, active: false, updatedAt: new Date().toISOString() } : x,
      ),
    }));
  };

  const restoreTemplate = (t: QuestTemplate) => {
    if (!isParent) return;
    update((d) => ({
      ...d,
      questCatalog: ensureQuestCatalog(d.questCatalog).map((x) =>
        x.id === t.id ? { ...x, active: true, updatedAt: new Date().toISOString() } : x,
      ),
    }));
  };

  const deleteTemplateForever = (t: QuestTemplate) => {
    if (!isParent) return;
    if (!confirm(`Permanently delete “${t.title}”? This cannot be undone.`)) return;
    update((d) => ({
      ...d,
      questCatalog: ensureQuestCatalog(d.questCatalog).filter((x) => x.id !== t.id),
    }));
  };

  /** Post a template onto the live quest board (does not remove from catalog). */
  const postTemplate = (t: QuestTemplate) => {
    if (!isParent || !me) return;
    const q = buildQuestFromTemplate(t, me.id, cq);
    update((d) => ({
      ...d,
      chores: [q, ...(d.chores || [])],
    }));
    // Switch to quests so they see it appear
    setTab('quests');
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
        id: `quest:${quest.id}:${forId}:${at}`,
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

      let result: FamilyData = {
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
      // Count toward weekday streak (Mon–Fri only; no-op on weekends)
      result = recordWeekdayCompletion(result, forId, new Date(at));
      return result;
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

  /** Put a finished quest back on the open board (daily/weekly chores). */
  const reopenQuest = (quest: Quest) => {
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
              approvedForId: undefined,
              approvedById: undefined,
              approvedAt: undefined,
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


  /** Spend accrued screen-time minutes (TV / games). */
  const spendScreenTime = (memberId: string, minutes: number, label?: string) => {
    if (!me) return;
    const mins = Math.floor(minutes);
    if (mins <= 0) return;
    const bal = (data.screenTime || {})[memberId] ?? 0;
    if (bal < mins) {
      alert(`Only ${bal} minutes available.`);
      return;
    }
    const who = getMember(memberId);
    const name = who?.name || 'them';
    if (!confirm(`Use ${mins} min of screen time for ${name}?`)) return;
    const at = new Date().toISOString();
    update((d) => {
      const current = (d.screenTime || {})[memberId] ?? 0;
      if (current < mins) return d;
      return {
        ...d,
        screenTime: {
          ...(d.screenTime || {}),
          [memberId]: current - mins,
        },
        screenTimeLog: [
          {
            id: newId(),
            memberId,
            delta: -mins,
            reason: label || `Used ${mins} min screen time`,
            byId: me.id,
            at,
          },
          ...(d.screenTimeLog || []),
        ].slice(0, 100),
      };
    });
  };

  const [spendOpen, setSpendOpen] = useState(false);
  const [spendMins, setSpendMins] = useState(30);
  const [spendMemberId, setSpendMemberId] = useState(myId);

  const claimChest = () => {
    if (!me) return;
    update((d) => {
      const res = claimStreakChest(d, myId, me.id);
      if (!res.ok) {
        queueMicrotask(() => setChestMsg(res.error || 'Could not open chest'));
        return d;
      }
      queueMicrotask(() =>
        setChestMsg(`Weekend Chest opened! +${cq.streakCoins} coins · +${cq.streakXp} XP`),
      );
      return res.data;
    });
  };

  const onHouseInspection = () => {
    if (!isParent || !me) return;
    if (!confirm('Mark the house as passed inspection? Every kid gets a bonus.')) return;
    update((d) => markHouseInspection(d, me.id));
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
      <Card className="!p-4 flex flex-col gap-3 h-full">
        <div className="flex items-start gap-3">
          <div className="text-2xl w-10 h-10 rounded-xl bg-inset flex items-center justify-center shrink-0">
            {meta.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-fg leading-tight">{quest.title}</p>
              <div className="flex items-center gap-0.5 shrink-0">
                {forMember && mode !== 'open' && <Avatar {...forMember} size="sm" />}
                {isParent && (
                  <>
                    {mode !== 'done' && (
                      <button
                        type="button"
                        onClick={() => openEdit(quest)}
                        className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
                        title="Edit quest"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
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
              </div>
            </div>
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
        </div>

        {mode === 'open' && me && me.role !== 'media' && (
          <Button size="sm" variant="secondary" className="mt-auto self-stretch" onClick={() => submitQuest(quest)}>
            I finished this
          </Button>
        )}

        {mode === 'pending' && isParent && (
          <div className="mt-auto space-y-2">
            <p className="text-xs text-muted">
              {submitter ? `${submitter.name} is waiting` : 'Waiting for approval'}
              <span className="text-fg font-medium">
                {' '}
                · +{quest.xp ?? meta.xp} XP · +{quest.coins ?? meta.coins} coins
              </span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => approveQuest(quest)}>
                <Check className="w-3.5 h-3.5 mr-1" />
                Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => rejectQuest(quest)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {mode === 'pending' && !isParent && quest.submittedById === myId && (
          <p className="text-xs text-amber-600 mt-auto">Waiting for a parent to approve…</p>
        )}

        {mode === 'done' && (
          <div className="mt-auto space-y-2">
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
            {isParent && (
              <Button size="sm" variant="secondary" className="w-full" onClick={() => reopenQuest(quest)}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Post again
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'quests', label: 'Quests' },
    ...(isParent
      ? [{ id: 'catalog' as const, label: 'Catalog', count: activeTemplates.length }]
      : []),
    { id: 'shop', label: 'Shop' },
    {
      id: 'vault',
      label: 'Vault',
      count: isParent ? pendingRedemptions.length : myPendingRedemptions.length,
    },
    { id: 'board', label: 'Board' },
    ...(isParent ? [{ id: 'rates' as const, label: 'Rates' }] : []),
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
        {isParent && tab === 'catalog' && (
          <Button onClick={openCatalogCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add template
          </Button>
        )}
        {isParent && tab === 'shop' && (
          <Button onClick={openShopCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add reward
          </Button>
        )}
      </div>

      {/* Progress + currencies */}
      {me && me.role !== 'media' && (
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

          {/* Two currencies: Treasure coins + Screen time bank */}
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

          {(myScreen > 0 || isParent) && (
            <div className="flex flex-wrap gap-2">
              {[15, 30, 60].map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant="secondary"
                  disabled={myScreen < m}
                  onClick={() => spendScreenTime(myId, m)}
                >
                  Use {m}m
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSpendMemberId(myId);
                  setSpendMins(Math.min(30, Math.max(5, myScreen || 30)));
                  setSpendOpen(true);
                }}
              >
                Custom…
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* This week progress */}
      {me && me.role !== 'media' && (
        <Card className="!p-4 lg:!p-5 space-y-3">
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

          {/* Interest + inspection */}
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
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

          {chestMsg && (
            <p className="text-sm text-accent font-medium">{chestMsg}</p>
          )}
        </Card>
      )}

      {/* Tabs — scrollable so Catalog stays visible on narrow screens */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-2 p-1.5 rounded-xl bg-inset border border-border min-w-max">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
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
        <>
          {isParent && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setTab('catalog')}>
                <BookMarked className="w-3.5 h-3.5 mr-1.5" />
                Catalog
                {activeTemplates.length > 0 ? ` (${activeTemplates.length})` : ''}
              </Button>
              {activeTemplates.length > 0 && (
                <p className="text-xs text-muted self-center">
                  Post reusable chores from your master list
                </p>
              )}
            </div>
          )}
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
                          Lv {bar.level} · {coins}c · {(screenTimeMap[k.id] ?? 0)}m
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
              <div className="grid sm:grid-cols-2 gap-3">
                {pendingQuests.map((q) => (
                  <QuestCard key={q.id} quest={q} mode="pending" />
                ))}
              </div>
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
              <div className="grid sm:grid-cols-2 gap-3">
                {openQuests.map((q) => (
                  <QuestCard key={q.id} quest={q} mode="open" />
                ))}
              </div>
            )}
          </section>

          {doneQuests.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Recently completed
              </h2>
              <p className="text-xs text-muted -mt-1">
                Daily or weekly chores? Use <span className="font-medium text-fg">Post again</span> to put them back on the board.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {doneQuests.map((q) => (
                  <QuestCard key={q.id} quest={q} mode="done" />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── CATALOG TAB (parents) ───────────────────────────── */}
      {tab === 'catalog' && isParent && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-1 flex items-center gap-2">
              <BookMarked className="w-4 h-4" />
              Quest catalog
            </h2>
            <p className="text-xs text-muted">
              Your master chore list. Templates stay here until you post them to the live board.
              Archive to hide without deleting.
            </p>
          </div>

          {activeTemplates.length === 0 ? (
            <Card className="!p-6 text-center">
              <p className="text-muted text-sm">No templates yet. Build your master list once, post when needed.</p>
              <Button className="mt-4" onClick={openCatalogCreate}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add template
              </Button>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {activeTemplates.map((t) => {
                const meta = rewardsForDifficultyWithConfig(t.difficulty, cq);
                const xp = t.xp ?? meta.xp;
                const coins = t.coins ?? meta.coins;
                return (
                  <Card key={t.id} className="!p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-fg leading-snug">{t.title}</p>
                        <p className="text-xs text-muted mt-1">
                          {meta.emoji} {meta.label} · +{xp} XP · +{coins}c
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => postTemplate(t)}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Post to board
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openCatalogEdit(t)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => archiveTemplate(t)}>
                        Archive
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {archivedTemplates.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                className="text-xs text-muted hover:text-fg underline-offset-2 hover:underline"
                onClick={() => setShowArchivedTemplates((v) => !v)}
              >
                {showArchivedTemplates ? 'Hide' : 'Show'} archived ({archivedTemplates.length})
              </button>
              {showArchivedTemplates && (
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  {archivedTemplates.map((t) => {
                    const meta = rewardsForDifficultyWithConfig(t.difficulty, cq);
                    return (
                      <Card key={t.id} className="!p-4 opacity-80 space-y-2">
                        <p className="font-medium text-fg text-sm">{t.title}</p>
                        <p className="text-[11px] text-muted">
                          {meta.emoji} {meta.label} · archived
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => restoreTemplate(t)}>
                            Restore
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteTemplateForever(t)}>
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
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
            Screen-time items add minutes to your bank instantly. Spend them above when you watch or play.
            Other rewards wait in the Vault for a parent.
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

      {/* ── LEADERBOARD TAB ────────────────────────────────── */}
      {tab === 'board' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
              <Trophy className="w-4 h-4 text-accent" />
              Leaderboard
            </h2>
            <p className="text-xs text-muted">Ranked by level &amp; XP</p>
          </div>

          {leaderboard.length === 0 ? (
            <Card className="!p-8 text-center">
              <p className="text-sm text-muted">No kids on the party yet.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((row, i) => {
                const look = getMember(row.member.id) || row.member;
                const rank = i + 1;
                const medal =
                  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                const isMe = row.member.id === myId;
                return (
                  <Card
                    key={row.member.id}
                    className={cn(
                      '!p-3 sm:!p-4 flex items-center gap-3',
                      isMe && 'border-accent/40 bg-accent/5',
                    )}
                  >
                    <div className="w-8 text-center shrink-0">
                      {medal ? (
                        <span className="text-xl">{medal}</span>
                      ) : (
                        <span className="text-sm font-bold text-muted">#{rank}</span>
                      )}
                    </div>
                    <Avatar {...look} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-fg truncate">
                        {row.member.name}
                        {isMe ? <span className="text-muted font-normal"> · you</span> : null}
                      </p>
                      <p className="text-xs text-muted">
                        Level {row.level} · {row.xp} XP
                        {row.weekQuests > 0
                          ? ` · ${row.weekQuests} quest${row.weekQuests === 1 ? '' : 's'} this week`
                          : ''}
                        {row.chestClaimed ? ' · chest ✓' : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-fg">Lv {row.level}</p>
                      <p className="text-[11px] text-amber-600 flex items-center gap-0.5 justify-end">
                        <Coins className="w-3 h-3" />
                        {row.coins}
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted text-center pt-1">
            Rankings use level and XP — spending coins does not drop your place.
          </p>
        </section>
      )}


      {/* ── RATES TAB (parents) ─────────────────────────────── */}
      {tab === 'rates' && isParent && (
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
          {(() => {
            const draft = ratesDraft || cq;
            const set = (patch: Partial<ChoreQuestConfig>) =>
              setRatesDraft({ ...draft, ...patch });
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
            return (
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
            );
          })()}
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
                const meta = rewardsForDifficultyWithConfig(d, cq);
                const selected = difficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDifficulty(d);
                      if (!customRewards) {
                        const r = rewardsForDifficultyWithConfig(d, cq);
                        setCustomXp(r.xp);
                        setCustomCoins(r.coins);
                      }
                    }}
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
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={customRewards}
              onChange={(e) => {
                const on = e.target.checked;
                setCustomRewards(on);
                if (!on) {
                  const r = rewardsForDifficultyWithConfig(difficulty, cq);
                  setCustomXp(r.xp);
                  setCustomCoins(r.coins);
                }
              }}
            />
            Custom XP / coins (advanced)
          </label>
          {customRewards && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">XP</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                  value={customXp}
                  onChange={(e) => setCustomXp(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Coins</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                  value={customCoins}
                  onChange={(e) => setCustomCoins(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          )}
          {!editQuest && isParent && (
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={alsoSaveToCatalog}
                onChange={(e) => setAlsoSaveToCatalog(e.target.checked)}
              />
              Also save to catalog (reusable template)
            </label>
          )}
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

      {/* Catalog template modal */}
      <Modal
        open={catalogEditOpen}
        onClose={() => {
          setCatalogEditOpen(false);
          setEditTemplate(null);
        }}
        title={editTemplate ? 'Edit template' : 'New template'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Chore name</label>
            <input
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={tplTitle}
              onChange={(e) => setTplTitle(e.target.value)}
              placeholder="e.g. Empty the dishwasher"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTemplate();
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-2 block">Difficulty</label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTY_ORDER.map((d) => {
                const meta = rewardsForDifficultyWithConfig(d, cq);
                const selected = tplDifficulty === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setTplDifficulty(d);
                      if (!tplCustom) {
                        const r = rewardsForDifficultyWithConfig(d, cq);
                        setTplXp(r.xp);
                        setTplCoins(r.coins);
                      }
                    }}
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
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={tplCustom}
              onChange={(e) => {
                const on = e.target.checked;
                setTplCustom(on);
                if (!on) {
                  const r = rewardsForDifficultyWithConfig(tplDifficulty, cq);
                  setTplXp(r.xp);
                  setTplCoins(r.coins);
                }
              }}
            />
            Custom XP / coins (advanced)
          </label>
          {tplCustom && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">XP</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                  value={tplXp}
                  onChange={(e) => setTplXp(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Coins</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                  value={tplCoins}
                  onChange={(e) => setTplCoins(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCatalogEditOpen(false);
                setEditTemplate(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveTemplate} disabled={!tplTitle.trim()}>
              {editTemplate ? 'Save changes' : 'Add to catalog'}
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

      {/* Spend screen time */}
      <Modal open={spendOpen} onClose={() => setSpendOpen(false)} title="Use screen time">
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
                <option value={myId}>{me?.name || 'Me'} (you)</option>
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
                spendScreenTime(spendMemberId, spendMins);
                setSpendOpen(false);
              }}
              disabled={spendMins <= 0 || (screenTimeMap[spendMemberId] ?? 0) < spendMins}
            >
              Use {spendMins || 0} min
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
