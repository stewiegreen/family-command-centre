import { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Check,
  Coins,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  ShoppingBag,
  Sparkles,
  Square,
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
  ScreenTimerSession,
} from '../types';
import { formatCountdown } from '../lib/screenTimer';
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
import { creditMemberForQuest } from '../lib/todoQuest';
import {
  AVATAR_FLAIR_COLORS,
  AVATAR_FLAIR_SHAPES,
  NAME_FLAIR_MAX,
  nameFlairLabel,
  sanitizeNameFlair,
} from '../lib/flair';
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
const CHOREQUEST_UI_VERSION = 'shop-sort-3';

type TabId = 'quests' | 'catalog' | 'shop' | 'vault' | 'board' | 'rates';

const KIND_LABEL: Record<RewardKind, string> = {
  screen_time: 'Screen time',
  treat: 'Treat',
  choice: 'Choice',
  late_bed: 'Late bedtime',
  allowance: 'Allowance',
  avatar_flair: 'Avatar flair',
  name_flair: 'Name flair',
  custom: 'Custom',
};

export function ChoresPage() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;
  const shopRecipients = useMemo(
    () => (data.members || []).filter((m) => m.role !== 'media'),
    [data.members],
  );
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
  const [repeatable, setRepeatable] = useState(true);
  const [customXp, setCustomXp] = useState(25);
  const [customCoins, setCustomCoins] = useState(12);
  const [alsoSaveToCatalog, setAlsoSaveToCatalog] = useState(false);
  const [levelUp, setLevelUp] = useState<{ name: string; level: number } | null>(null);
  const [ratesDraft, setRatesDraft] = useState<ChoreQuestConfig | null>(null);
  const [styleModal, setStyleModal] = useState<'avatar' | 'name' | null>(null);
  const [adjKidId, setAdjKidId] = useState('');
  const [adjXp, setAdjXp] = useState(0);
  const [adjCoins, setAdjCoins] = useState(0);
  const [adjScreen, setAdjScreen] = useState(0);
  const [adjNote, setAdjNote] = useState('');
  const [adjMsg, setAdjMsg] = useState('');
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
  /** Shop item id → member id who receives screen time (defaults to self). */
  const [screenGiftFor, setScreenGiftFor] = useState<Record<string, string>>({});

  // Idempotent weekly rollover (safe if app wasn't opened all weekend)
  useEffect(() => {
    if (!me) return;
    update((d) => ensureWeekRollover(d, me.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (tab === 'rates' && isParent) {
      setRatesDraft(getChoreQuestConfig(data));
      const kids = (data.members || []).filter((m) => m.role === 'kid');
      setAdjKidId((prev) => prev || kids[0]?.id || '');
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
        .filter((c) => c.status === 'done' && c.repeatable === false)
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
        .sort((a, b) => {
          // Featured pinned first, then cheapest → most expensive
          const fa = a.featured ? 0 : 1;
          const fb = b.featured ? 0 : 1;
          if (fa !== fb) return fa - fb;
          const ca = Number(a.coinCost) || 0;
          const cb = Number(b.coinCost) || 0;
          if (ca !== cb) return ca - cb;
          return (Number(a.sort) || 0) - (Number(b.sort) || 0) || a.label.localeCompare(b.label);
        }),
    [catalog],
  );

  /* ─── Quest CRUD ───────────────────────────────────────── */

  const openCreate = () => {
    setEditQuest(null);
    setTitle('');
    setDifficulty('medium');
    setCustomRewards(false);
    setRepeatable(true);
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
    setRepeatable(q.repeatable !== false);
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
                repeatable,
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
        repeatable,
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
    setRepeatable(true);
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
    // Credit the kid who owns the linked todo — not a parent who marked the todo done.
    const forId = creditMemberForQuest(data, quest) || quest.submittedById || quest.approvedForId;
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
                status: c.repeatable !== false ? ('open' as const) : ('done' as const),
                submittedById: undefined,
                submittedAt: undefined,
                approvedForId: forId,
                approvedById: me.id,
                approvedAt: at,
                rewardMinutes: 0,
                lastCompletedAt: at,
                lastCompletedById: forId,
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

    const isScreen = item.kind === 'screen_time' && (item.screenMinutes || 0) > 0;
    const forId =
      isScreen
        ? screenGiftFor[item.id] || myId
        : myId;
    const forMember = getMember(forId);
    const forName = forMember?.name || 'them';
    const isGift = isScreen && forId !== myId;

    const confirmMsg = isGift
      ? `Spend ${item.coinCost} coins on “${item.label}” for ${forName}?`
      : `Spend ${item.coinCost} coins on “${item.label}”?`;
    if (!confirm(confirmMsg)) return;

    const at = new Date().toISOString();
    const weekId = isoWeekId();
    const redemptionId = newId();

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
        label: isGift ? `${item.label} → ${forName}` : item.label,
        refId: redemptionId,
        byId: me.id,
        at,
        weekId,
      };

      const isFlair = item.kind === 'avatar_flair' || item.kind === 'name_flair';
      const autoDone = isScreen || isFlair;

      const record: RedemptionRecord = {
        id: redemptionId,
        memberId: myId,
        forMemberId: isScreen ? forId : undefined,
        rewardItemId: item.id,
        label: item.label,
        kind: item.kind,
        coinCost: item.coinCost,
        screenMinutes: item.screenMinutes,
        status: autoDone ? 'fulfilled' : 'pending',
        requestedAt: at,
        fulfilledAt: autoDone ? at : undefined,
        fulfilledById: autoDone ? me.id : undefined,
      };

      let nextScreen = d.screenTime || {};
      let nextLog = d.screenTimeLog || [];
      if (isScreen) {
        const mins = item.screenMinutes || 0;
        const beneficiary = forId;
        nextScreen = {
          ...nextScreen,
          [beneficiary]: (nextScreen[beneficiary] || 0) + mins,
        };
        nextLog = [
          {
            id: newId(),
            memberId: beneficiary,
            delta: mins,
            reason: isGift
              ? `Gift from ${me.name}: ${item.label}`
              : `Redeemed: ${item.label}`,
            byId: me.id,
            at,
          },
          ...nextLog,
        ].slice(0, 100);
      }

      let nextAppearance = d.appearance || {};
      if (isFlair) {
        const prev = nextAppearance[myId] || {};
        nextAppearance = {
          ...nextAppearance,
          [myId]: {
            ...prev,
            ...(item.kind === 'avatar_flair' ? { unlockAvatarFlair: true } : {}),
            ...(item.kind === 'name_flair' ? { unlockNameFlair: true } : {}),
          },
        };
      }

      return {
        ...d,
        coinBalances: nextBalances,
        coinLedger: [spendEntry, ...(d.coinLedger || [])].slice(0, 200),
        redemptions: [record, ...(d.redemptions || [])].slice(0, 100),
        screenTime: nextScreen,
        screenTimeLog: nextLog,
        appearance: nextAppearance,
        rewardCatalog: ensureRewardCatalog(d.rewardCatalog),
      };
    });

    // After unlock, open the picker so they can choose immediately
    if (item.kind === 'avatar_flair') setStyleModal('avatar');
    if (item.kind === 'name_flair') setStyleModal('name');
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
              {quest.repeatable !== false && (
                <span className="text-xs text-muted">♻ Repeatable</span>
              )}
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
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
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
              {(data.appearance?.[myId]?.unlockAvatarFlair ||
                data.appearance?.[myId]?.unlockNameFlair) && (
                <div className="flex gap-1.5">
                  {data.appearance?.[myId]?.unlockAvatarFlair ? (
                    <button
                      type="button"
                      onClick={() => setStyleModal('avatar')}
                      className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover"
                    >
                      Avatar flair
                    </button>
                  ) : null}
                  {data.appearance?.[myId]?.unlockNameFlair ? (
                    <button
                      type="button"
                      onClick={() => setStyleModal('name')}
                      className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover"
                    >
                      Name flair
                    </button>
                  ) : null}
                </div>
              )}
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
                    name={look.name}
                    emoji={look.emoji}
                    color={look.color}
                    initials={look.initials}
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
        <>
          {!isParent && kids.length > 0 && (
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
                      {item.kind === 'screen_time' && me && me.role !== 'media' && (
                        <select
                          className="shrink-0 max-w-[8rem] rounded-lg border border-border bg-inset px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
                          value={screenGiftFor[item.id] || myId}
                          onChange={(e) =>
                            setScreenGiftFor((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          title="Give screen time to"
                        >
                          {shopRecipients.map((m) => {
                            const look = getMember(m.id) || m;
                            return (
                              <option key={m.id} value={m.id}>
                                {(look.emoji ? `${look.emoji} ` : '') + look.name}
                                {m.id === myId ? ' (me)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      {me && me.role !== 'media' && (() => {
                        const unlockedAvatar =
                          item.kind === 'avatar_flair' &&
                          !!data.appearance?.[myId]?.unlockAvatarFlair;
                        const unlockedName =
                          item.kind === 'name_flair' &&
                          !!data.appearance?.[myId]?.unlockNameFlair;
                        if (unlockedAvatar || unlockedName) {
                          return (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1"
                              onClick={() =>
                                setStyleModal(unlockedAvatar ? 'avatar' : 'name')
                              }
                            >
                              Customize
                            </Button>
                          );
                        }
                        return (
                          <Button
                            size="sm"
                            disabled={!canAfford}
                            onClick={() => redeem(item)}
                            className="flex-1"
                          >
                            {canAfford
                              ? item.kind === 'screen_time' &&
                                (screenGiftFor[item.id] || myId) !== myId
                                ? 'Gift'
                                : 'Redeem'
                              : 'Need more coins'}
                          </Button>
                        );
                      })()}
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
                            {who?.name || 'Someone'}
                            {r.forMemberId && r.forMemberId !== r.memberId
                              ? ` → ${getMember(r.forMemberId)?.name || 'someone'}`
                              : ''}{' '}
                            · {r.coinCost} coins ·{' '}
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
                              {r.forMemberId && r.forMemberId !== r.memberId
                                ? ` → ${getMember(r.forMemberId)?.name || 'someone'}`
                                : ''}
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
              {(() => {
                const kids = (data.members || []).filter((m) => m.role === 'kid');
                const kidId = adjKidId || kids[0]?.id || '';
                const prog = ensureProgress(progressMap[kidId]);
                const coins = coinBalances[kidId] ?? 0;
                const screen = screenTimeMap[kidId] ?? 0;
                return (
                  <>
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
                          type="number"
                          step={1}
                          className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                          value={adjXp}
                          onChange={(e) => setAdjXp(Number(e.target.value))}
                          placeholder="e.g. 50 or -20"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted mb-1 block">Coins delta</label>
                        <input
                          type="number"
                          step={1}
                          className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                          value={adjCoins}
                          onChange={(e) => setAdjCoins(Number(e.target.value))}
                          placeholder="e.g. 10 or -5"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted mb-1 block">Screen minutes delta</label>
                        <input
                          type="number"
                          step={1}
                          className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                          value={adjScreen}
                          onChange={(e) => setAdjScreen(Number(e.target.value))}
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

                    {adjMsg ? (
                      <p className="text-xs text-accent">{adjMsg}</p>
                    ) : null}

                    <Button
                      disabled={!kidId || (adjXp === 0 && adjCoins === 0 && adjScreen === 0)}
                      onClick={() => {
                        if (!kidId || !me) return;
                        const xpD = Math.trunc(adjXp);
                        const coinD = Math.trunc(adjCoins);
                        const screenD = Math.trunc(adjScreen);
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
                        setAdjXp(0);
                        setAdjCoins(0);
                        setAdjScreen(0);
                        setAdjNote('');
                      }}
                    >
                      Apply adjustment
                    </Button>
                  </>
                );
              })()}
            </Card>
          </div>
        </section>
      )}


      {/* Style picker — avatar / name flair (no separate page) */}
      <Modal
        open={styleModal !== null}
        onClose={() => setStyleModal(null)}
        title={styleModal === 'avatar' ? 'Avatar flair' : styleModal === 'name' ? 'Name flair' : 'Style'}
      >
        {styleModal === 'avatar' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Shape + ring colour around your avatar. Your profile emoji and name stay the same.
            </p>
            <div className="flex justify-center py-2">
              <Avatar
                {...(me || {})}
                name={me?.name}
                size="lg"
                avatarFlairShape={data.appearance?.[myId]?.avatarFlairShape || me?.avatarFlairShape}
                avatarFlairColor={data.appearance?.[myId]?.avatarFlairColor || me?.avatarFlairColor}
              />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Shape</p>
              <div className="grid grid-cols-2 gap-2">
                {AVATAR_FLAIR_SHAPES.map((s) => {
                  const on =
                    (data.appearance?.[myId]?.avatarFlairShape || 'circle') === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        update((d) => {
                          const prev = d.appearance?.[myId] || {};
                          return {
                            ...d,
                            appearance: {
                              ...(d.appearance || {}),
                              [myId]: { ...prev, avatarFlairShape: s.id },
                            },
                          };
                        });
                      }}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 text-sm transition-colors',
                        on ? 'border-accent bg-accent/10' : 'border-border hover:bg-nav-hover',
                      )}
                    >
                      <span className="mr-1.5">{s.preview}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Ring colour
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {AVATAR_FLAIR_COLORS.map((c) => {
                  const current = data.appearance?.[myId]?.avatarFlairColor || '';
                  const on = current === c.hex || (!current && !c.hex);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => {
                        update((d) => {
                          const prev = d.appearance?.[myId] || {};
                          return {
                            ...d,
                            appearance: {
                              ...(d.appearance || {}),
                              [myId]: {
                                ...prev,
                                avatarFlairColor: c.hex || undefined,
                              },
                            },
                          };
                        });
                      }}
                      className={cn(
                        'h-9 rounded-lg border-2 flex items-center justify-center text-[10px] font-medium',
                        on ? 'border-accent scale-105' : 'border-border',
                      )}
                      style={
                        c.hex
                          ? { backgroundColor: c.hex }
                          : undefined
                      }
                    >
                      {!c.hex ? (
                        <span className="text-muted">Off</span>
                      ) : (
                        <span className="sr-only">{c.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button className="w-full" onClick={() => setStyleModal(null)}>
              Done
            </Button>
          </div>
        )}
        {styleModal === 'name' && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Write your own title under your name (max {NAME_FLAIR_MAX} characters). This is{' '}
              <span className="text-fg font-medium">not</span> a rename — everyone still sees you as{' '}
              <span className="text-fg font-medium">{me?.name}</span>.
            </p>
            <div className="rounded-xl border border-border bg-inset px-4 py-3 text-center">
              <p className="text-lg font-semibold text-fg">{me?.name}</p>
              {nameFlairLabel(data.appearance?.[myId]?.nameFlairText) ? (
                <p
                  className="text-sm mt-0.5 font-medium"
                  style={{
                    color: data.appearance?.[myId]?.nameFlairColor || undefined,
                  }}
                >
                  {nameFlairLabel(data.appearance?.[myId]?.nameFlairText)}
                </p>
              ) : (
                <p className="text-xs text-muted mt-0.5">No flair yet</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">
                Your flair{' '}
                <span className="tabular-nums">
                  ({(data.appearance?.[myId]?.nameFlairText || '').length}/{NAME_FLAIR_MAX})
                </span>
              </label>
              <input
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                maxLength={NAME_FLAIR_MAX}
                placeholder="e.g. Sock Slayer"
                value={data.appearance?.[myId]?.nameFlairText || ''}
                onChange={(e) => {
                  const next = sanitizeNameFlair(e.target.value);
                  update((d) => {
                    const prev = d.appearance?.[myId] || {};
                    return {
                      ...d,
                      appearance: {
                        ...(d.appearance || {}),
                        [myId]: {
                          ...prev,
                          nameFlairText: next || undefined,
                        },
                      },
                    };
                  });
                }}
              />
              <p className="text-[11px] text-muted mt-1">
                Tip: keep it fun. Parents can clear it if needed.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Flair colour
              </p>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                {AVATAR_FLAIR_COLORS.map((c) => {
                  const current = data.appearance?.[myId]?.nameFlairColor || '';
                  const on = current === c.hex || (!current && !c.hex);
                  return (
                    <button
                      key={`name-${c.id}`}
                      type="button"
                      title={c.label}
                      onClick={() => {
                        update((d) => {
                          const prev = d.appearance?.[myId] || {};
                          return {
                            ...d,
                            appearance: {
                              ...(d.appearance || {}),
                              [myId]: {
                                ...prev,
                                nameFlairColor: c.hex || undefined,
                              },
                            },
                          };
                        });
                      }}
                      className={cn(
                        'h-9 rounded-lg border-2 flex items-center justify-center text-[10px] font-medium',
                        on ? 'border-accent scale-105' : 'border-border',
                      )}
                      style={c.hex ? { backgroundColor: c.hex } : undefined}
                    >
                      {!c.hex ? (
                        <span className="text-muted">Def</span>
                      ) : (
                        <span className="sr-only">{c.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted mt-1">
                “Def” uses the normal accent colour.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  update((d) => {
                    const prev = d.appearance?.[myId] || {};
                    return {
                      ...d,
                      appearance: {
                        ...(d.appearance || {}),
                        [myId]: {
                          ...prev,
                          nameFlairText: undefined,
                          nameFlairColor: undefined,
                        },
                      },
                    };
                  });
                }}
              >
                Clear
              </Button>
              <Button className="flex-1" onClick={() => setStyleModal(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
              checked={repeatable}
              onChange={(e) => setRepeatable(e.target.checked)}
            />
            Repeatable quest — stays available after approval
          </label>
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
