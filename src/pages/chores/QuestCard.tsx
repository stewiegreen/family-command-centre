// src/pages/chores/QuestCard.tsx
//
// One quest tile on the board, in any of its three states. Owns the full
// quest lifecycle (submit/approve/reject/reopen/delete) via useApp() — the
// only thing it can't own is opening the shared edit modal (that state lives
// in ChoresPage) or the level-up celebration (shared across the whole page),
// so those come in as callback props.

import { Check, Pencil, RotateCcw, Sparkles, Coins, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { FamilyData, Quest, QuestDifficulty } from '../../types';
import {
  DIFFICULTY_REWARDS,
  ensureProgress,
  isoWeekId,
  progressTowardNextLevel,
} from '../../lib/quest';
import { creditMemberForQuest } from '../../lib/todoQuest';
import { actingMember } from '../../lib/actingMember';
import { recordWeekdayCompletion } from '../../lib/weekCycle';
import { cn } from '../../lib/cn';

function DifficultyBadge({ d }: { d: QuestDifficulty }) {
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
}

export function QuestCard({
  quest,
  mode,
  onEdit,
  onLevelUp,
}: {
  quest: Quest;
  mode: 'open' | 'pending' | 'done';
  onEdit: (quest: Quest) => void;
  onLevelUp: (payload: { name: string; level: number }) => void;
}) {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;

  const diff = quest.difficulty || 'medium';
  const meta = DIFFICULTY_REWARDS[diff] || DIFFICULTY_REWARDS.medium;
  const submitter = quest.submittedById ? getMember(quest.submittedById) : undefined;
  const forMember = quest.approvedForId ? getMember(quest.approvedForId) : submitter;
  const creditId = creditMemberForQuest(data, quest) || quest.submittedById;
  const creditMember = creditId ? getMember(creditId) : undefined;

  const deleteQuest = () => {
    if (!isParent) return;
    if (!confirm(`Delete “${quest.title}”?`)) return;
    update((d) => ({
      ...d,
      chores: (d.chores || []).filter((c) => c.id !== quest.id),
    }));
  };

  const submitQuest = () => {
    update((d) => {
      // Resolve actor inside the updater — never close over React `me` after a profile switch.
      const actor = actingMember(d);
      if (!actor || actor.role === 'media') return d;
      return {
        ...d,
        chores: (d.chores || []).map((c) =>
          c.id === quest.id
            ? {
                ...c,
                status: 'pending' as const,
                submittedById: actor.id,
                submittedAt: new Date().toISOString(),
              }
            : c,
        ),
      };
    });
  };

  const approveQuest = () => {
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
        queueMicrotask(() => onLevelUp({ name: kid?.name || 'Hero', level: newLevel }));
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

  const rejectQuest = () => {
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
  const reopenQuest = () => {
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
                      onClick={() => onEdit(quest)}
                      className="p-1.5 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
                      title="Edit quest"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={deleteQuest}
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
            <DifficultyBadge d={diff} />
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
        <Button size="sm" variant="secondary" className="mt-auto self-stretch" onClick={submitQuest}>
          I finished this
        </Button>
      )}

      {mode === 'pending' && isParent && (
        <div className="mt-auto space-y-2">
          <p className="text-xs text-muted">
            {submitter ? `${submitter.name} is waiting` : 'Waiting for approval'}
            {creditMember && (
              <span className="text-fg font-medium">
                {' '}
                · rewards → {creditMember.name}
              </span>
            )}
            <span className="text-fg font-medium">
              {' '}
              · +{quest.xp ?? meta.xp} XP · +{quest.coins ?? meta.coins} coins
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={approveQuest}>
              <Check className="w-3.5 h-3.5 mr-1" />
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={rejectQuest}>
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
            <Button size="sm" variant="secondary" className="w-full" onClick={reopenQuest}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Post again
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
