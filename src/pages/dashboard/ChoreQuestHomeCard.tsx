/**
 * Homescreen ChoreQuest widget (parent overview / kid status + screen timer flip).
 */
import { Coins, MonitorPlay, Package, Sword, Trophy } from 'lucide-react';
import { FlipCard } from '../../components/FlipCard';
import { ScreenTimerCard } from '../../components/ScreenTimerCard';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  ensureProgress,
  getChoreQuestConfig,
  progressTowardNextLevel,
} from '../../lib/quest';
import { streakStatus } from '../../lib/weekCycle';
import type { FamilyData, Quest } from '../../types';

type MemberLite = {
  id: string;
  name: string;
  role?: string;
  color?: string;
  emoji?: string;
  avatarPortraitId?: string | null;
  avatarFlairShape?: string;
  avatarFlairColor?: string;
  initials?: string;
};

export function ChoreQuestHomeCard({
  isParent,
  currentUser,
  myId,
  chores,
  kids,
  pendingForParents,
  myPending,
  openCount,
  progressMap,
  coinBalances,
  screenTimeMap,
  redemptions,
  weekState,
  cq,
  getMember,
  onOpenChores,
  onApprove,
}: {
  isParent: boolean;
  currentUser: MemberLite | null | undefined;
  myId: string;
  chores: Quest[];
  kids: MemberLite[];
  pendingForParents: Quest[];
  myPending: Quest[];
  openCount: number;
  progressMap: NonNullable<FamilyData['memberProgress']>;
  coinBalances: Record<string, number>;
  screenTimeMap: Record<string, number>;
  redemptions: FamilyData['redemptions'];
  weekState: FamilyData['weekState'];
  cq: ReturnType<typeof getChoreQuestConfig>;
  getMember: (id: string) => MemberLite | undefined;
  onOpenChores: () => void;
  onApprove: (quest: Quest) => void;
}) {
  const myProgress = ensureProgress(progressMap?.[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);
  const myCoins = coinBalances[myId] ?? 0;
  const myScreen = screenTimeMap[myId] ?? 0;
  const vaultPending = (redemptions || []).filter((r) => r.status === 'pending').length;

  return (
      <FlipCard
        storageKey="chorequest-timer"
        frontLabel="Quests"
        backLabel="Timer"
        frontBadge={
          isParent && pendingForParents.length > 0
            ? `${pendingForParents.length} to approve`
            : undefined
        }
        front={isParent ? (
      <Card className="!p-4 lg:!p-5 space-y-4 h-full flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-fg flex items-center gap-2 text-lg">
            <Sword className="w-4 h-4 text-accent" />
            ChoreQuest
            <span className="text-sm font-normal text-muted">· kids overview</span>
          </h2>
          <button type="button" onClick={() => onOpenChores()} className="text-xs text-accent shrink-0">
            Open board →
          </button>
        </div>

        {/* Snapshot totals */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-inset border border-border px-3 py-2">
            <p className="text-lg font-bold text-fg">{pendingForParents.length}</p>
            <p className="text-[11px] text-muted">To approve</p>
          </div>
          <div className="rounded-xl bg-inset border border-border px-3 py-2">
            <p className="text-lg font-bold text-fg">{openCount}</p>
            <p className="text-[11px] text-muted">Open quests</p>
          </div>
          <div className="rounded-xl bg-inset border border-border px-3 py-2">
            <p className="text-lg font-bold text-amber-600">
              {vaultPending}
            </p>
            <p className="text-[11px] text-muted">Vault pending</p>
          </div>
        </div>

        {/* Per-kid economy */}
        {kids.length === 0 ? (
          <p className="text-sm text-muted">No kid profiles yet.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" />
              Party progress
            </p>
            {kids.map((k) => {
              const look = getMember(k.id) || k;
              const prog = ensureProgress(progressMap[k.id]);
              const bar = progressTowardNextLevel(prog.xp);
              const coins = coinBalances[k.id] ?? 0;
              const screen = screenTimeMap[k.id] ?? 0;
              const streak = streakStatus(weekState, k.id, cq);
              const kidPending = chores.filter(
                (c) => c.status === 'pending' && c.submittedById === k.id,
              ).length;
              return (
                <div
                  key={k.id}
                  className="rounded-2xl border border-border bg-inset/60 px-3 py-2.5 space-y-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <Avatar {...look} size="sm" />
                      <span className="absolute -bottom-1 -right-1 min-w-[1.1rem] h-4 px-0.5 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center border-2 border-surface">
                        {bar.level}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-fg truncate">{look.name}</p>
                        <div className="flex items-center gap-2 shrink-0 text-[11px] font-medium">
                          <span className="text-amber-600 flex items-center gap-0.5">
                            <Coins className="w-3 h-3" />
                            {coins}
                          </span>
                          <span className="text-sky-600 flex items-center gap-0.5">
                            <MonitorPlay className="w-3 h-3" />
                            {screen}m
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 mt-1 rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${bar.pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">
                        {prog.xp} XP · {bar.intoLevel}/{bar.needed} to Lv {bar.level + 1}
                        {streak.ready ? ' · weekend chest ready' : streak.claimed ? ' · chest claimed' : ''}
                        {kidPending > 0 ? ` · ${kidPending} awaiting approval` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Vault — pending redemptions by kid */}
        {(() => {
          const pendingVault = (redemptions || []).filter((r) => r.status === 'pending');
          if (pendingVault.length === 0) {
            return (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />
                  Vault
                </p>
                <p className="text-sm text-muted">No pending vault items.</p>
              </div>
            );
          }
          return (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                Vault · pending
              </p>
              <ul className="space-y-1.5">
                {pendingVault.slice(0, 8).map((r) => {
                  const who = getMember(r.memberId);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-xl border border-border bg-inset px-2.5 py-2"
                    >
                      {who ? <Avatar {...who} size="sm" className="!w-7 !h-7 !text-sm" /> : null}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-fg truncate">
                          <span className="font-medium">{who?.name || 'Kid'}</span>
                          <span className="text-muted"> · {r.label}</span>
                        </p>
                        <p className="text-[11px] text-muted">
                          {r.coinCost}c
                          {r.screenMinutes ? ` · ${r.screenMinutes}m screen` : ''}
                          {' · '}
                          {new Date(r.requestedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {pendingVault.length > 8 && (
                <button
                  type="button"
                  onClick={() => onOpenChores()}
                  className="text-xs text-accent mt-2"
                >
                  +{pendingVault.length - 8} more on the board →
                </button>
              )}
            </div>
          );
        })()}

        {/* Approve queue teaser */}
        {pendingForParents.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Needs approval
            </p>
            <ul className="space-y-1.5">
              {pendingForParents.slice(0, 4).map((c) => {
                const submitter = c.submittedById ? getMember(c.submittedById) : undefined;
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-2"
                  >
                    {submitter && <Avatar {...submitter} size="sm" className="!w-7 !h-7 !text-sm" />}
                    <span className="text-sm text-fg flex-1 min-w-0 truncate">{c.title}</span>
                    <Button
                      size="sm"
                      className="!px-2 !py-1 text-xs shrink-0"
                      onClick={() => onApprove(c)}
                    >
                      Approve
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>
    ) : (
      <Card className="!p-4 lg:!p-5 h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-fg flex items-center gap-2 text-lg">
            <Sword className="w-4 h-4 text-accent" />
            ChoreQuest
            {currentUser?.role === 'kid' ? (
              <span className="text-xs font-normal text-muted">· for you</span>
            ) : null}
          </h2>
          <button type="button" onClick={() => onOpenChores()} className="text-xs text-accent">
            Open board →
          </button>
        </div>

        {currentUser && currentUser.role !== 'media' && (
          <div className="flex items-center gap-3 mb-4">
            <div className="relative shrink-0">
              <Avatar {...(getMember(myId) || currentUser)} size="md" />
              <span className="absolute -bottom-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface">
                {myBar.level}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-fg truncate">
                {currentUser.name}
                <span className="text-muted font-normal"> · Level {myBar.level}</span>
              </p>
              <div className="h-2 mt-1 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${myBar.pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted mt-0.5">
                {myBar.intoLevel}/{myBar.needed} XP to next level
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-sm font-semibold text-amber-600 flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />
                {myCoins}
              </span>
              <span className="text-sm font-semibold text-sky-600 flex items-center gap-1">
                <MonitorPlay className="w-3.5 h-3.5" />
                {myScreen}m
              </span>
            </div>
          </div>
        )}

        {currentUser?.role === 'kid' && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl bg-inset border border-border px-3 py-2">
              <p className="text-lg font-bold text-fg">{openCount}</p>
              <p className="text-[11px] text-muted">Open</p>
            </div>
            <div className="rounded-xl bg-inset border border-border px-3 py-2">
              <p className="text-lg font-bold text-fg">{myPending.length}</p>
              <p className="text-[11px] text-muted">Pending</p>
            </div>
            <div className="rounded-xl bg-inset border border-border px-3 py-2">
              <p className="text-lg font-bold text-sky-600">{myScreen}m</p>
              <p className="text-[11px] text-muted">Screen bank</p>
            </div>
          </div>
        )}

        {currentUser?.role === 'kid' && (
          <div>
            {chores.filter((c) => c.status === 'open' || !c.status).slice(0, 3).length === 0 ? (
              <p className="text-sm text-muted">No open quests right now.</p>
            ) : (
              <ul className="space-y-1.5">
                {chores
                  .filter((c) => c.status === 'open' || !c.status)
                  .slice(0, 3)
                  .map((c) => (
                    <li key={c.id} className="text-sm text-fg flex items-center justify-between gap-2">
                      <span className="truncate">{c.title}</span>
                      <span className="text-xs text-muted shrink-0">
                        +{c.xp ?? 0} XP · +{c.coins ?? 0}c
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </Card>
        )}
        back={<ScreenTimerCard />}
      />
  );
}
