/**
 * Live quests board — open / pending / done + party levels.
 */
import { useMemo } from 'react';
import { Plus, Trophy } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  ensureProgress,
  progressTowardNextLevel,
} from '../../lib/quest';
import type { Quest } from '../../types';
import { QuestCard } from './QuestCard';

export function QuestsTab({
  onCreate,
  onEdit,
  onLevelUp,
}: {
  onCreate: () => void;
  onEdit: (q: Quest) => void;
  onLevelUp: (info: { name: string; level: number } | null) => void;
}) {
  const { data, currentUser, isParent, getMember } = useApp();
  const me = currentUser;
  const chores = data.chores || [];
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const screenTimeMap = data.screenTime || {};

  const kids = useMemo(
    () => (data.members || []).filter((m) => m.role === 'kid'),
    [data.members],
  );

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

  const openCreate = onCreate;
  const openEdit = onEdit;
  const setLevelUp = onLevelUp;

  return (
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
                  <QuestCard key={q.id} quest={q} mode="pending" onEdit={openEdit} onLevelUp={setLevelUp} />
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
                  <QuestCard key={q.id} quest={q} mode="open" onEdit={openEdit} onLevelUp={setLevelUp} />
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
                  <QuestCard key={q.id} quest={q} mode="done" onEdit={openEdit} onLevelUp={setLevelUp} />
                ))}
              </div>
            </section>
          )}
        </>
  );
}
