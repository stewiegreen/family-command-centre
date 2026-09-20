/**
 * Leaderboard tab — ranked by level & XP.
 */
import { useMemo } from 'react';
import { Coins, Trophy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import {
  ensureProgress,
  getChoreQuestConfig,
  progressTowardNextLevel,
} from '../../lib/quest';
import { streakStatus } from '../../lib/weekCycle';
import { cn } from '../../lib/cn';

export function BoardTab() {
  const { data, currentUser, getMember } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const cq = getChoreQuestConfig(data);
  const weekState = data.weekState;

  const kids = useMemo(
    () => (data.members || []).filter((m) => m.role === 'kid'),
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
  }, [kids, progressMap, coinBalances, weekState, cq]);

  return (
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
  );
}
