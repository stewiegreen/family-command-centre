import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckSquare, RefreshCw, Users, User, Tv, Sparkles, Minus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';
import type { ChoreCadence, Priority } from '../types';
import { FAMILY_LIST_ID } from '../types';
import { cn } from '../lib/cn';

type Tab = 'mine' | 'family' | 'chores';

export function TodosPage() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const [tab, setTab] = useState<Tab>('mine');
  const [activeId, setActiveId] = useState(isParent ? data.settings.currentUserId : myId);

  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [assignId, setAssignId] = useState(myId);

  const [choreTitle, setChoreTitle] = useState('');
  const [choreCadence, setChoreCadence] = useState<ChoreCadence>('weekly');
  const [choreRotation, setChoreRotation] = useState<string[]>([]);
  const [choreReward, setChoreReward] = useState(15);
  const [earnFlash, setEarnFlash] = useState<{ minutes: number; title: string } | null>(null);
  const [spendMember, setSpendMember] = useState('');
  const [spendMins, setSpendMins] = useState(30);
  const [spendNote, setSpendNote] = useState('');

  useEffect(() => {
    const openMine = () => setTab('mine');
    const openChores = () => setTab('chores');
    window.addEventListener('fcc:quick-add', openMine);
    window.addEventListener('fcc:open-chores', openChores);
    return () => {
      window.removeEventListener('fcc:quick-add', openMine);
      window.removeEventListener('fcc:open-chores', openChores);
    };
  }, []);

  const members = data.members.filter((m) => m.role !== 'media');
  const chores = data.chores || [];

  const listId = tab === 'family' ? FAMILY_LIST_ID : isParent ? activeId : myId;
  const list = data.todos.filter((t) => t.memberId === listId);
  const open = list.filter((t) => !t.completed);
  const done = list.filter((t) => t.completed);

  const addTodo = () => {
    if (!text.trim()) return;
    const memberId = tab === 'family' ? FAMILY_LIST_ID : isParent ? assignId : myId;
    update((d) => ({
      ...d,
      todos: [
        {
          id: uid(),
          text: text.trim(),
          memberId,
          createdById: myId,
          completed: false,
          priority,
          createdAt: new Date().toISOString(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        },
        ...d.todos,
      ],
    }));
    setText('');
    setDueAt('');
  };

  const toggleTodo = (id: string) => {
    update((d) => ({
      ...d,
      todos: d.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    }));
  };

  const removeTodo = (id: string, t: (typeof data.todos)[0]) => {
    const creator = data.members.find((m) => m.id === t.createdById);
    const fromParent =
      creator && creator.role === 'parent' && t.createdById !== t.memberId && t.memberId !== FAMILY_LIST_ID;
    if (!isParent && fromParent) return;
    if (!isParent && t.createdById !== myId && t.memberId !== myId && t.memberId !== FAMILY_LIST_ID) return;
    update((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== id) }));
  };

  const clearDoneTodos = () => {
    update((d) => ({
      ...d,
      todos: d.todos.filter(
        (t) =>
          !(t.memberId === listId && t.completed && (isParent || t.createdById === myId || t.memberId === FAMILY_LIST_ID)),
      ),
    }));
  };

  const toggleRotationMember = (id: string) => {
    setChoreRotation((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addChore = () => {
    if (!choreTitle.trim() || choreRotation.length === 0 || !isParent) return;
    const reward = Math.max(0, Math.min(240, Math.round(choreReward) || 0));
    update((d) => ({
      ...d,
      chores: [
        {
          id: uid(),
          title: choreTitle.trim(),
          rotation: [...choreRotation],
          turnIndex: 0,
          cadence: choreCadence,
          rewardMinutes: reward,
          createdById: myId,
          createdAt: new Date().toISOString(),
        },
        ...(d.chores || []),
      ],
    }));
    setChoreTitle('');
    setChoreRotation([]);
  };

  const completeChore = (choreId: string) => {
    let earned = 0;
    let title = '';
    update((d) => {
      const chore = (d.chores || []).find((c) => c.id === choreId);
      if (!chore || chore.rotation.length === 0) return d;
      const whoseTurn = chore.rotation[chore.turnIndex % chore.rotation.length];
      // Only the person whose turn it is earns (or a parent completing for them still advances)
      const earnerId = whoseTurn;
      const reward = Math.max(0, chore.rewardMinutes || 0);
      const balances = { ...(d.screenTime || {}) };
      const log = [...(d.screenTimeLog || [])];
      if (reward > 0) {
        balances[earnerId] = (balances[earnerId] || 0) + reward;
        log.unshift({
          id: uid(),
          memberId: earnerId,
          delta: reward,
          reason: `Chore: ${chore.title}`,
          byId: myId,
          at: new Date().toISOString(),
        });
        if (earnerId === myId) {
          earned = reward;
          title = chore.title;
        }
      }
      return {
        ...d,
        screenTime: balances,
        screenTimeLog: log.slice(0, 80),
        chores: (d.chores || []).map((c) => {
          if (c.id !== choreId) return c;
          return {
            ...c,
            turnIndex: (c.turnIndex + 1) % c.rotation.length,
            lastCompletedAt: new Date().toISOString(),
            lastCompletedById: myId,
          };
        }),
      };
    });
    if (earned > 0) {
      setEarnFlash({ minutes: earned, title });
      window.setTimeout(() => setEarnFlash(null), 3200);
    }
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
  const kids = members.filter((m) => m.role === 'kid');
  const myMinutes = screenTime[myId] || 0;

  const tabs: { id: Tab; label: string; icon: typeof User; hint: string }[] = [
    { id: 'mine', label: 'Personal', icon: User, hint: 'Assigned to one person' },
    { id: 'family', label: 'Family', icon: Users, hint: 'Anyone can complete' },
    { id: 'chores', label: 'Chores', icon: RefreshCw, hint: 'Rotating household jobs' },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">To-Dos & chores</h1>
          <p className="text-sm text-muted mt-1">
            {tab === 'chores'
              ? 'Rotating jobs for the household.'
              : tab === 'family'
                ? 'Shared tasks for everyone.'
                : 'Personal lists by family member.'}
          </p>
        </div>
        {(tab === 'mine' || tab === 'family') && done.length > 0 && (
          <button type="button" onClick={clearDoneTodos} className="text-sm text-muted hover:text-fg self-start">
            Clear done ({done.length})
          </button>
        )}
      </div>

      {/* Tabs — roomier on desktop */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium border transition-colors',
              tab === t.id
                ? 'border-indigo-500 bg-indigo-500/15 text-indigo-500'
                : 'border-border-strong text-muted hover:bg-nav-hover hover:text-fg',
            )}
          >
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
            <span className="hidden lg:inline text-xs font-normal opacity-70">· {t.hint}</span>
          </button>
        ))}
      </div>

      {/* Parent: whose personal list */}
      {tab === 'mine' && isParent && (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setActiveId(m.id);
                setAssignId(m.id);
              }}
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-2 rounded-2xl text-sm border transition-colors',
                activeId === m.id
                  ? 'border-indigo-500 bg-indigo-500/15 text-indigo-500'
                  : 'border-border-strong text-muted hover:bg-nav-hover',
              )}
            >
              <Avatar {...m} size="sm" className="!w-7 !h-7" />
              {m.name}
              <span className="text-xs opacity-70">
                {data.todos.filter((t) => t.memberId === m.id && !t.completed).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* —— Personal & Family —— */}
      {(tab === 'mine' || tab === 'family') && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
          <Card className="!p-5 lg:!p-6 space-y-4 lg:sticky lg:top-20">
            <h2 className="font-semibold text-fg">
              {tab === 'family' ? 'Add family task' : 'Add task'}
            </h2>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tab === 'family' ? 'e.g. Clean the garage this weekend' : 'What needs doing?'}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
              <div className="min-w-0">
                <label className="text-xs text-muted mb-1.5 block">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full max-w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="text-xs text-muted mb-1.5 block">Due (optional)</label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full max-w-full min-w-0 bg-input border border-border-strong rounded-xl px-2 sm:px-3 py-2.5 text-sm text-fg"
                />
              </div>
            </div>
            {tab === 'mine' && isParent && (
              <div>
                <label className="text-xs text-muted mb-1.5 block">Assign to</label>
                <select
                  value={assignId}
                  onChange={(e) => setAssignId(e.target.value)}
                  className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button onClick={addTodo} className="w-full">
              <Plus className="w-4 h-4" /> Add task
            </Button>
          </Card>

          <div className="space-y-3">
            {list.length === 0 ? (
              <Card className="!p-8">
                <EmptyState
                  icon={CheckSquare}
                  title={tab === 'family' ? 'No family tasks' : 'No tasks yet'}
                  description={
                    tab === 'family'
                      ? 'Add something the whole household can help with.'
                      : 'Add a task using the form.'
                  }
                />
              </Card>
            ) : (
              <>
                {open.length > 0 && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted px-1">
                    Open · {open.length}
                  </p>
                )}
                {[...open, ...done].map((t) => {
                  const creator = data.members.find((m) => m.id === t.createdById);
                  const fromParent =
                    creator &&
                    creator.role === 'parent' &&
                    t.createdById !== t.memberId &&
                    t.memberId !== FAMILY_LIST_ID;
                  const canDelete =
                    isParent ||
                    t.memberId === FAMILY_LIST_ID ||
                    (!fromParent && (t.createdById === myId || t.memberId === myId));
                  return (
                    <Card
                      key={t.id}
                      className={cn(
                        '!p-4 flex items-start gap-4',
                        t.completed && 'opacity-55',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTodo(t.id)}
                        className={cn(
                          'mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors',
                          t.completed
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-border-strong hover:border-emerald-500',
                        )}
                      >
                        {t.completed && <span className="text-xs">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0 py-0.5">
                        <p className={cn('text-base font-medium', t.completed && 'line-through text-muted')}>
                          {t.text}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                          <span
                            className="text-[11px] font-semibold uppercase tracking-wide"
                            style={{
                              color: { low: '#64748b', medium: '#f59e0b', high: '#ef4444' }[t.priority],
                            }}
                          >
                            {t.priority}
                          </span>
                          {t.dueAt && (
                            <span className="text-xs text-muted">
                              Due{' '}
                              {new Date(t.dueAt).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => removeTodo(t.id, t)}
                          className="p-2 text-faint hover:text-red-400 rounded-lg hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* —— Chores + screen time —— */}
      {tab === 'chores' && (
        <div className="space-y-6">
          {/* Celebrate earn */}
          {earnFlash && (
            <div className="rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-pink-500/15 p-4 flex items-center gap-3 animate-in">
              <span className="text-3xl">🎉</span>
              <div>
                <p className="font-bold text-fg text-lg">+{earnFlash.minutes} min screen time!</p>
                <p className="text-sm text-muted">Nice work on “{earnFlash.title}”</p>
              </div>
            </div>
          )}

          {/* Balances */}
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
                const look = getMember?.(m.id) || m;
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
                <p className="text-xs text-muted">
                  When a kid uses device time, subtract minutes here. Kids can’t change balances.
                </p>
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
                    placeholder="Minutes"
                  />
                  <Input
                    value={spendNote}
                    onChange={(e) => setSpendNote(e.target.value)}
                    placeholder="e.g. YouTube, game"
                    className="flex-1"
                  />
                  <Button
                    onClick={() => {
                      if (!spendMember && kids[0]) setSpendMember(kids[0].id);
                      spendScreenTime();
                    }}
                  >
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
                <h2 className="font-semibold text-fg">New rotating chore</h2>
                <Input
                  value={choreTitle}
                  onChange={(e) => setChoreTitle(e.target.value)}
                  placeholder="e.g. Dishes, Take out bins"
                  onKeyDown={(e) => e.key === 'Enter' && addChore()}
                />
                <div>
                  <label className="text-xs text-muted mb-1.5 block">How often</label>
                  <select
                    value={choreCadence}
                    onChange={(e) => setChoreCadence(e.target.value as ChoreCadence)}
                    className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="once">Each time (no schedule)</option>
                  </select>
                </div>
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
                  <p className="text-[11px] text-faint mt-1">Kids earn this when the chore is marked done.</p>
                </div>
                <div>
                  <label className="text-xs text-muted mb-2 block">Rotation order — tap names in order</label>
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleRotationMember(m.id)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-2xl text-sm border transition-colors',
                          choreRotation.includes(m.id)
                            ? 'border-indigo-500 bg-indigo-500/15 text-indigo-500'
                            : 'border-border-strong text-muted hover:bg-nav-hover',
                        )}
                      >
                        <Avatar {...(getMember?.(m.id) || m)} size="sm" className="!w-6 !h-6" />
                        {m.name}
                        {choreRotation.includes(m.id) && (
                          <span className="text-[11px] font-bold w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                            {choreRotation.indexOf(m.id) + 1}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={addChore}
                  className="w-full"
                  disabled={!choreTitle.trim() || choreRotation.length === 0}
                >
                  <Plus className="w-4 h-4" /> Add chore
                </Button>
              </Card>
            ) : (
              <Card className="!p-5 text-sm text-muted space-y-2">
                <p>
                  Finish chores when it’s <strong className="text-fg">your turn</strong> to earn screen time minutes.
                </p>
                <p>Parents decide how many minutes each chore is worth — only they can spend your balance.</p>
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
                        ? 'Create a chore, set a screen-time reward, and choose who rotates.'
                        : 'Ask a parent to set up the household rotation.'
                    }
                  />
                </Card>
              ) : (
                chores.map((c) => {
                  const whoseId = c.rotation[c.turnIndex % c.rotation.length];
                  const who = getMember?.(whoseId) || data.members.find((m) => m.id === whoseId);
                  const myTurn = whoseId === myId;
                  const reward = c.rewardMinutes || 0;
                  return (
                    <Card
                      key={c.id}
                      className={cn(
                        '!p-5 flex flex-col gap-4',
                        myTurn && 'ring-2 ring-indigo-500/40 border-indigo-500/30',
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {who && <Avatar {...who} size="sm" className="!w-10 !h-10" />}
                          <div className="min-w-0">
                            <p className="text-lg font-semibold text-fg">{c.title}</p>
                            <p className="text-sm text-muted mt-0.5">
                              {myTurn ? (
                                <span className="text-indigo-500 font-medium">Your turn</span>
                              ) : (
                                <>{who?.name || 'Someone'}&apos;s turn</>
                              )}
                              <span className="text-faint"> · </span>
                              <span className="capitalize">{c.cadence}</span>
                            </p>
                            {reward > 0 && (
                              <p className="text-sm font-semibold text-amber-500 mt-1 flex items-center gap-1">
                                <Tv className="w-3.5 h-3.5" /> +{reward} min screen time
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {c.rotation.map((rid, i) => {
                                const m = getMember?.(rid) || data.members.find((x) => x.id === rid);
                                if (!m) return null;
                                const active = i === c.turnIndex % c.rotation.length;
                                return (
                                  <span
                                    key={rid}
                                    className={cn(
                                      'text-xs px-2.5 py-1 rounded-full font-medium',
                                      active ? 'bg-indigo-500 text-white' : 'bg-surface-2 text-muted',
                                    )}
                                  >
                                    {m.name}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
                          <Button
                            size="md"
                            variant={myTurn ? 'primary' : 'secondary'}
                            onClick={() => completeChore(c.id)}
                            className="flex-1 sm:flex-none"
                          >
                            Done{myTurn && reward > 0 ? ` · +${reward}` : ''}
                          </Button>
                          {isParent && (
                            <button
                              type="button"
                              onClick={() => removeChore(c.id)}
                              className="p-2 text-faint hover:text-red-400 rounded-lg hover:bg-red-500/10 self-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {isParent && (
                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <label className="text-xs text-muted shrink-0">Reward (min)</label>
                          <input
                            type="number"
                            min={0}
                            max={240}
                            value={reward}
                            onChange={(e) => setChoreRewardMinutes(c.id, Number(e.target.value))}
                            className="w-20 bg-input border border-border-strong rounded-lg px-2 py-1.5 text-sm text-fg"
                          />
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
