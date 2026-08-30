import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Tv, Sparkles, Minus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';
import { cn } from '../lib/cn';

export function ChoresPage() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;

  const [choreTitle, setChoreTitle] = useState('');
  const [choreReward, setChoreReward] = useState(15);
  const [approvePick, setApprovePick] = useState<Record<string, string>>({});
  const [earnFlash, setEarnFlash] = useState<{ minutes: number; title: string } | null>(null);
  const [spendMember, setSpendMember] = useState('');
  const [spendMins, setSpendMins] = useState(30);
  const [spendNote, setSpendNote] = useState('');

  const members = data.members.filter((m) => m.role !== 'media');
  const kids = members.filter((m) => m.role === 'kid');
  const chores = data.chores || [];

  const addChore = () => {
    if (!choreTitle.trim() || !isParent) return;
    const reward = Math.max(0, Math.min(240, Math.round(choreReward) || 0));
    update((d) => ({
      ...d,
      chores: [
        {
          id: uid(),
          title: choreTitle.trim(),
          rewardMinutes: reward,
          status: 'open' as const,
          createdById: myId,
          createdAt: new Date().toISOString(),
        },
        ...(d.chores || []),
      ],
    }));
    setChoreTitle('');
  };

  /** Kid (or anyone) marks a chore finished — waits for parent approval. */
  const submitChore = (choreId: string) => {
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) => {
        if (c.id !== choreId || c.status !== 'open') return c;
        return {
          ...c,
          status: 'pending' as const,
          submittedById: myId,
          submittedAt: new Date().toISOString(),
        };
      }),
    }));
  };

  const cancelSubmit = (choreId: string) => {
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) => {
        if (c.id !== choreId || c.status !== 'pending') return c;
        if (!isParent && c.submittedById !== myId) return c;
        return {
          ...c,
          status: 'open' as const,
          submittedById: undefined,
          submittedAt: undefined,
        };
      }),
    }));
  };

  /** Parent approves and awards minutes to a chosen kid. */
  const approveChore = (choreId: string, forMemberId: string) => {
    if (!isParent || !forMemberId) return;
    let earned = 0;
    let title = '';
    update((d) => {
      const chore = (d.chores || []).find((c) => c.id === choreId);
      if (!chore || chore.status !== 'pending') return d;
      const reward = Math.max(0, chore.rewardMinutes || 0);
      const balances = { ...(d.screenTime || {}) };
      const log = [...(d.screenTimeLog || [])];
      if (reward > 0) {
        balances[forMemberId] = (balances[forMemberId] || 0) + reward;
        log.unshift({
          id: uid(),
          memberId: forMemberId,
          delta: reward,
          reason: `Chore approved: ${chore.title}`,
          byId: myId,
          at: new Date().toISOString(),
        });
      }
      if (forMemberId === myId) {
        earned = reward;
        title = chore.title;
      }
      return {
        ...d,
        screenTime: balances,
        screenTimeLog: log.slice(0, 80),
        chores: (d.chores || []).map((c) =>
          c.id === choreId
            ? {
                ...c,
                status: 'done' as const,
                approvedForId: forMemberId,
                approvedById: myId,
                approvedAt: new Date().toISOString(),
              }
            : c,
        ),
      };
    });
    if (earned > 0) {
      setEarnFlash({ minutes: earned, title });
      window.setTimeout(() => setEarnFlash(null), 3200);
    }
  };

  const reopenChore = (choreId: string) => {
    if (!isParent) return;
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) =>
        c.id === choreId
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

  const removeChore = (id: string) => {
    if (!isParent) return;
    update((d) => ({ ...d, chores: (d.chores || []).filter((c) => c.id !== id) }));
  };

  const setChoreRewardMinutes = (choreId: string, minutes: number) => {
    if (!isParent) return;
    const reward = Math.max(0, Math.min(240, Math.round(minutes) || 0));
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) => (c.id === choreId ? { ...c, rewardMinutes: reward } : c)),
    }));
  };

  const spendScreenTime = () => {
    if (!isParent || spendMins <= 0) return;
    const target = spendMember || kids[0]?.id;
    if (!target) return;
    const mins = Math.round(spendMins);
    update((d) => {
      const balances = { ...(d.screenTime || {}) };
      const current = balances[target] || 0;
      const next = Math.max(0, current - mins);
      const actual = current - next;
      if (actual <= 0) return d;
      balances[target] = next;
      const log = [
        {
          id: uid(),
          memberId: target,
          delta: -actual,
          reason: spendNote.trim() || 'Screen time used',
          byId: myId,
          at: new Date().toISOString(),
        },
        ...(d.screenTimeLog || []),
      ];
      return { ...d, screenTime: balances, screenTimeLog: log.slice(0, 80) };
    });
    setSpendNote('');
  };

  const adjustScreenTime = (memberId: string, delta: number, reason: string) => {
    if (!isParent || !delta) return;
    update((d) => {
      const balances = { ...(d.screenTime || {}) };
      balances[memberId] = Math.max(0, (balances[memberId] || 0) + delta);
      const log = [
        {
          id: uid(),
          memberId,
          delta,
          reason,
          byId: myId,
          at: new Date().toISOString(),
        },
        ...(d.screenTimeLog || []),
      ];
      return { ...d, screenTime: balances, screenTimeLog: log.slice(0, 80) };
    });
  };

  const screenTime = data.screenTime || {};
  const myMinutes = screenTime[myId] || 0;

  const openChores = chores.filter((c) => c.status === 'open' || !c.status);
  const pendingChores = chores.filter((c) => c.status === 'pending');
  const doneChores = chores.filter((c) => c.status === 'done');

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chores</h1>
        <p className="text-sm text-muted mt-1">Complete a chore, earn screen time.</p>
      </div>

      {earnFlash && (
        <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-pink-500/15 p-4 flex items-center gap-3">
          <span className="text-3xl">🎉</span>
          <div>
            <p className="font-bold text-fg text-lg">+{earnFlash.minutes} min screen time!</p>
            <p className="text-sm text-muted">Nice work on “{earnFlash.title}”</p>
          </div>
        </div>
      )}

      <Card className="!p-5 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border-indigo-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Tv className="w-5 h-5 text-indigo-500" />
          <h2 className="font-semibold text-fg">Screen time bank</h2>
          <Sparkles className="w-4 h-4 text-amber-400" />
        </div>
        {!isParent && (
          <div className="mb-4 p-4 rounded-2xl bg-surface border border-border flex items-center gap-4">
            <div className="text-4xl">⏱️</div>
            <div>
              <p className="text-3xl font-black text-indigo-500 tabular-nums">{myMinutes}</p>
              <p className="text-sm text-muted">minutes you’ve earned</p>
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-2">
          {(isParent ? members : kids.length ? kids : members.filter((m) => m.id === myId)).map((m) => {
            const mins = screenTime[m.id] || 0;
            const look = getMember(m.id) || m;
            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border',
                  m.id === myId ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-border bg-surface/50',
                )}
              >
                <Avatar {...look} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{m.name}</p>
                  <p className="text-xs text-muted">{mins} min</p>
                </div>
                <span className="text-lg font-bold tabular-nums text-indigo-500">{mins}</span>
              </div>
            );
          })}
        </div>

        {isParent && kids.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border space-y-3">
            <p className="text-sm font-medium text-fg">Spend screen time</p>
            <p className="text-xs text-muted">When a kid uses device time, subtract minutes here.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={spendMember || kids[0]?.id || ''}
                onChange={(e) => setSpendMember(e.target.value)}
                className="bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg flex-1"
              >
                {kids.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({screenTime[m.id] || 0} min)
                  </option>
                ))}
              </select>
              <Input
                type="number"
                min={1}
                max={480}
                value={spendMins}
                onChange={(e) => setSpendMins(Number(e.target.value))}
                className="sm:w-28"
              />
              <Input
                value={spendNote}
                onChange={(e) => setSpendNote(e.target.value)}
                placeholder="e.g. YouTube"
                className="flex-1"
              />
              <Button onClick={spendScreenTime}>
                <Minus className="w-4 h-4" /> Spend
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {kids.map((m) => (
                <button
                  key={m.id + 'bonus'}
                  type="button"
                  onClick={() => adjustScreenTime(m.id, 10, 'Parent bonus')}
                  className="text-xs px-2.5 py-1 rounded-full border border-border-strong text-muted hover:text-indigo-500 hover:border-indigo-500"
                >
                  +10 bonus for {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6 items-start">
        {isParent ? (
          <Card className="!p-5 lg:!p-6 space-y-4 lg:sticky lg:top-20">
            <h2 className="font-semibold text-fg">Add a chore</h2>
            <p className="text-xs text-muted -mt-2">Kids pick jobs, mark them finished, then you approve the minutes.</p>
            <Input
              value={choreTitle}
              onChange={(e) => setChoreTitle(e.target.value)}
              placeholder="e.g. Unload dishwasher"
              onKeyDown={(e) => e.key === 'Enter' && addChore()}
            />
            <div>
              <label className="text-xs text-muted mb-1.5 block flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5" /> Screen time reward (minutes)
              </label>
              <Input
                type="number"
                min={0}
                max={240}
                value={choreReward}
                onChange={(e) => setChoreReward(Number(e.target.value))}
              />
            </div>
            <Button onClick={addChore} className="w-full" disabled={!choreTitle.trim()}>
              <Plus className="w-4 h-4" /> Add chore
            </Button>
          </Card>
        ) : (
          <Card className="!p-5 text-sm text-muted space-y-2">
            <p>
              Pick any <strong className="text-fg">open</strong> chore, do it, then tap{' '}
              <strong className="text-fg">I finished this</strong>.
            </p>
            <p>A parent must approve before the minutes land in your bank.</p>
          </Card>
        )}

        <div className="space-y-3">
          {chores.length === 0 ? (
            <Card className="!p-8">
              <EmptyState
                icon={RefreshCw}
                title="No chores yet"
                description={
                  isParent
                    ? 'Add jobs and set how many screen-time minutes each is worth.'
                    : 'Ask a parent to add some chores.'
                }
              />
            </Card>
          ) : (
            <>
              {pendingChores.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-amber-500 flex items-center gap-2">
                    Waiting for approval ({pendingChores.length})
                  </h3>
                  {pendingChores.map((c) => {
                    const who = getMember(c.submittedById || '') || members.find((m) => m.id === c.submittedById);
                    const pick = approvePick[c.id] || c.submittedById || kids[0]?.id || '';
                    return (
                      <Card key={c.id} className="!p-4 border-amber-500/30 bg-amber-500/5 space-y-3">
                        <div className="flex items-start gap-3">
                          {who && <Avatar {...who} size="sm" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-fg">{c.title}</p>
                            <p className="text-sm text-muted">
                              {who?.name || 'Someone'} says they’re done ·{' '}
                              <span className="text-amber-500 font-medium">+{c.rewardMinutes || 0} min</span>
                            </p>
                          </div>
                        </div>
                        {isParent ? (
                          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                            <select
                              value={pick}
                              onChange={(e) => setApprovePick((prev) => ({ ...prev, [c.id]: e.target.value }))}
                              className="bg-input border border-border-strong rounded-xl px-3 py-2 text-sm text-fg flex-1"
                            >
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  Award to {m.name}
                                </option>
                              ))}
                            </select>
                            <Button onClick={() => approveChore(c.id, pick || c.submittedById || '')}>
                              Approve +{c.rewardMinutes || 0}
                            </Button>
                            <Button variant="secondary" onClick={() => cancelSubmit(c.id)}>
                              Send back
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            {c.submittedById === myId && (
                              <Button variant="secondary" size="sm" onClick={() => cancelSubmit(c.id)}>
                                Cancel
                              </Button>
                            )}
                            <p className="text-xs text-muted self-center">Waiting for a parent…</p>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              {openChores.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-fg">Open jobs ({openChores.length})</h3>
                  {openChores.map((c) => (
                    <Card key={c.id} className="!p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-fg">{c.title}</p>
                        <p className="text-sm text-amber-500 font-medium mt-0.5">
                          +{c.rewardMinutes || 0} min screen time
                        </p>
                        {isParent && (
                          <div className="flex items-center gap-2 mt-2">
                            <label className="text-xs text-muted">Reward</label>
                            <input
                              type="number"
                              min={0}
                              max={240}
                              value={c.rewardMinutes || 0}
                              onChange={(e) => setChoreRewardMinutes(c.id, Number(e.target.value))}
                              className="w-20 bg-input border border-border-strong rounded-lg px-2 py-1 text-sm text-fg"
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={() => submitChore(c.id)}>I finished this</Button>
                        {isParent && (
                          <button
                            type="button"
                            onClick={() => removeChore(c.id)}
                            className="p-2 text-faint hover:text-red-400 rounded-lg hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {doneChores.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted">Completed ({doneChores.length})</h3>
                  {doneChores.map((c) => {
                    const who = getMember(c.approvedForId || c.submittedById || '');
                    return (
                      <Card key={c.id} className="!p-4 opacity-70 flex items-center gap-3">
                        {who && <Avatar {...who} size="sm" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-fg line-through">{c.title}</p>
                          <p className="text-xs text-muted">
                            {who?.name || 'Someone'} earned +{c.rewardMinutes || 0} min
                          </p>
                        </div>
                        {isParent && (
                          <Button variant="secondary" size="sm" onClick={() => reopenChore(c.id)}>
                            Reopen
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
