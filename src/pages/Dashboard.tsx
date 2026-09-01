import { useEffect, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  StickyNote,
  MessageCircle,
  Coins,
  MonitorPlay,
  ShoppingCart,
  Newspaper,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Sword,
  Trophy,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { ProfileLookCard } from '../components/ProfileLookEditor';
import type { PresenceStatus, ViewId } from '../types';
import { FAMILY_LIST_ID, PRESENCE_OPTIONS } from '../types';
import { upcomingExpanded } from '../lib/recurrence';
import { ensureProgress, progressTowardNextLevel } from '../lib/quest';
import {
  STREAK_COINS,
  STREAK_XP,
  streakStatus,
  daysUntilWeekEnd,
} from '../lib/weekCycle';
import { cn } from '../lib/cn';

const COLOR_ICON: Record<string, string> = {
  indigo: 'bg-accent/15 text-accent',
  emerald: 'bg-sky-500/15 text-sky-500',
  amber: 'bg-amber-500/15 text-amber-500',
  pink: 'bg-pink-500/15 text-pink-500',
};

const DISMISS_ANN_KEY = 'fcc_dismissed_announcement';

type SectionId = 'stats' | 'chorequest' | 'presence' | 'digest' | 'events' | 'todos' | 'choresShop' | 'look';

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function Dashboard() {
  const {
    data,
    update,
    setView,
    getMember,
    currentUser,
    isParent,
    myHomescreenOrder,
    setMyHomescreenOrder,
  } = useApp();
  const { events, todos, notes, messages, members, settings } = data;
  const chores = data.chores || [];
  const shopping = data.shopping || [];
  const presence = data.presence || {};
  const now = new Date();
  const myId = currentUser?.id || settings.currentUserId;

  // Per-user order from context (synced under appearance[memberId].homescreenOrder)
  const order = myHomescreenOrder as SectionId[];

  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const screenTimeMap = data.screenTime || {};
  const myProgress = ensureProgress(progressMap[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);
  const myCoins = coinBalances[myId] ?? 0;
  const myScreen = screenTimeMap[myId] ?? 0;
  const myStreak = streakStatus(data.weekState, myId);
  const daysLeft = daysUntilWeekEnd();
  const openCount = chores.filter((c) => c.status === 'open' || !c.status).length;
  const kids = members.filter((m) => m.role === 'kid');

  const announcement = (settings.pinnedAnnouncement || '').trim();
  const [heroOpen, setHeroOpen] = useState(() => {
    if (!announcement) return true;
    try {
      return localStorage.getItem(DISMISS_ANN_KEY) !== announcement;
    } catch {
      return true;
    }
  });

  // Re-open hero when announcement text changes
  useEffect(() => {
    if (!announcement) return;
    try {
      if (localStorage.getItem(DISMISS_ANN_KEY) !== announcement) {
        setHeroOpen(true);
      }
    } catch {
      setHeroOpen(true);
    }
  }, [announcement]);

  const persistOrder = (next: SectionId[]) => {
    setMyHomescreenOrder(next);
  };

  const moveSection = (id: SectionId, dir: -1 | 1) => {
    const i = order.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    persistOrder(next);
  };

  /** Moves the combined Events + To-Dos row together, as one block. */
  const movePairSection = (dir: -1 | 1) => {
    const withoutPair = order.filter((x): x is SectionId => x !== 'events' && x !== 'todos');
    const pairIndex = Math.min(order.indexOf('events'), order.indexOf('todos'));
    const insertAt = Math.max(0, Math.min(withoutPair.length, pairIndex + dir));
    const next: SectionId[] = [
      ...withoutPair.slice(0, insertAt),
      'events',
      'todos',
      ...withoutPair.slice(insertAt),
    ];
    persistOrder(next);
  };

  const dismissHero = () => {
    setHeroOpen(false);
    if (announcement) {
      try {
        localStorage.setItem(DISMISS_ANN_KEY, announcement);
      } catch {
        /* ignore */
      }
    }
  };

  const upcoming = upcomingExpanded(events, now, 14).slice(0, 5);
  const weekStart = startOfWeekMonday(now);
  const weekEvents = upcomingExpanded(events, weekStart, 7);
  const unread = messages.filter((m) => m.toId === settings.currentUserId && !m.read).length;
  const openTasksCount = isParent
    ? todos.filter((t) => !t.completed).length
    : todos.filter((t) => !t.completed && (t.memberId === myId || t.memberId === FAMILY_LIST_ID)).length;
  const overdueTodos = todos.filter(
    (t) => !t.completed && t.dueAt && new Date(t.dueAt).getTime() < now.getTime(),
  );
  const pendingForParents = isParent ? chores.filter((c) => c.status === 'pending') : [];
  const myPending = chores.filter((c) => c.status === 'pending' && c.submittedById === myId);
  const myChores = isParent
    ? pendingForParents
    : [...myPending, ...chores.filter((c) => c.status === 'open' || !c.status)].slice(0, 5);
  const shopOpen = shopping.filter((s) => !s.bought).length;
  const hour = now.getHours();
  const greeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const progressMembers = isParent
    ? members.filter((m) => m.role !== 'media')
    : members.filter((m) => m.id === myId);
  const household = members.filter((m) => m.role !== 'media');

  const setMyStatus = (status: PresenceStatus) => {
    update((d) => ({
      ...d,
      presence: {
        ...(d.presence || {}),
        [myId]: { status, updatedAt: new Date().toISOString() },
      },
    }));
  };

  const myStatus = presence[myId]?.status;

  const cards: { icon: typeof Calendar; label: string; value: number; color: string; view: ViewId }[] = [
    { icon: Calendar, label: 'Upcoming', value: upcoming.length, color: 'indigo', view: 'calendar' },
    { icon: CheckSquare, label: 'Open tasks', value: openTasksCount, color: 'emerald', view: 'todos' },
    { icon: StickyNote, label: 'Notes', value: notes.length, color: 'amber', view: 'notes' },
    { icon: MessageCircle, label: 'Unread', value: unread, color: 'pink', view: 'messages' },
  ];

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(
    weekStart.getTime() + 6 * 86400000,
  ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const SectionChrome = ({ id, children }: { id: SectionId; children: React.ReactNode }) => (
    <div className="relative group/section">
      <div className="absolute -left-1 top-2 z-10 flex flex-col gap-0.5 opacity-70 sm:opacity-0 sm:group-hover/section:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => moveSection(id, -1)}
          className="p-1 rounded-md bg-surface border border-border text-muted hover:text-fg"
          title="Move up"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => moveSection(id, 1)}
          className="p-1 rounded-md bg-surface border border-border text-muted hover:text-fg"
          title="Move down"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="sm:pl-6">{children}</div>
    </div>
  );

  const SectionChromePair = ({ children }: { children: React.ReactNode }) => (
    <div className="relative group/section">
      <div className="absolute -left-1 top-2 z-10 flex flex-col gap-0.5 opacity-70 sm:opacity-0 sm:group-hover/section:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => movePairSection(-1)}
          className="p-1 rounded-md bg-surface border border-border text-muted hover:text-fg"
          title="Move up"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => movePairSection(1)}
          className="p-1 rounded-md bg-surface border border-border text-muted hover:text-fg"
          title="Move down"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="sm:pl-6 grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
    </div>
  );

  const sections: Record<SectionId, React.ReactNode> = {
    stats: (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="!p-4" onClick={() => setView(c.view)}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${COLOR_ICON[c.color]}`}>
                <c.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-fg">{c.value}</p>
                <p className="text-xs text-muted">{c.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    ),
    presence: (
      <Card className="!p-4 lg:!p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
          <div className="shrink-0">
            <h2 className="font-semibold text-fg text-sm mb-2">Where is everyone?</h2>
            <div className="flex flex-wrap gap-2">
              {household.map((m) => {
                const p = presence[m.id];
                const opt = PRESENCE_OPTIONS.find((o) => o.id === p?.status);
                const look = getMember(m.id) || m;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-inset border border-border"
                    title={p?.updatedAt ? `Updated ${new Date(p.updatedAt).toLocaleString()}` : undefined}
                  >
                    <Avatar {...look} size="sm" className="!w-10 !h-10 !text-xl" />
                    <span className="text-sm font-medium text-fg">{m.name}</span>
                    <span className="text-sm">{opt ? `${opt.emoji} ${opt.label}` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="lg:border-l lg:border-border lg:pl-8 flex-1">
            <p className="text-xs text-muted mb-2">Your status</p>
            <div className="flex flex-wrap gap-2">
              {PRESENCE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setMyStatus(o.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    myStatus === o.id
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border-strong text-muted hover:bg-nav-hover hover:text-fg',
                  )}
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    ),
    digest: (
      <Card className="!p-5 lg:!p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-fg flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-accent" />
            This week
            <span className="text-xs font-normal text-muted">({weekLabel})</span>
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Events</p>
            {weekEvents.length === 0 ? (
              <p className="text-muted">None scheduled</p>
            ) : (
              <ul className="space-y-1.5">
                {weekEvents.slice(0, 5).map((ev) => (
                  <li key={ev.id} className="text-fg">
                    <span className="text-muted">
                      {new Date(ev.instanceStart).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>{' '}
                    {ev.title}
                    {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Overdue tasks</p>
            {overdueTodos.length === 0 ? (
              <p className="text-muted">None — nice</p>
            ) : (
              <ul className="space-y-1.5">
                {overdueTodos.slice(0, 5).map((t) => (
                  <li key={t.id} className="text-fg">
                    {t.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              {isParent ? 'Chores to approve' : 'Chores'}
            </p>
            {myChores.length === 0 ? (
              <p className="text-muted">{isParent ? 'None waiting' : 'None open'}</p>
            ) : (
              <ul className="space-y-1.5">
                {myChores.map((c) => (
                  <li key={c.id} className="text-fg">
                    {c.title}
                    {c.status === 'pending' ? ' · pending' : ''}
                    {(c.rewardMinutes || 0) > 0 ? ` · +${c.rewardMinutes}m` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Also</p>
            <ul className="space-y-1.5 text-fg">
              <li>
                {unread} unread message{unread === 1 ? '' : 's'}
              </li>
              <li>
                {shopOpen} shopping item{shopOpen === 1 ? '' : 's'}
              </li>
              {announcement && <li className="text-muted line-clamp-2">📌 {announcement}</li>}
            </ul>
          </div>
        </div>
      </Card>
    ),
    events: (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-fg">Upcoming Events</h2>
          <button type="button" onClick={() => setView('calendar')} className="text-xs text-accent">
            See all →
          </button>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">No upcoming events. Enjoy the calm! ☀️</p>
        ) : (
          upcoming.map((ev) => {
            const m = getMember(ev.memberId);
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 p-3 rounded-xl border border-border mb-2"
                style={{
                  backgroundColor: (m?.color || '#6366f1') + '18',
                  borderLeftWidth: 4,
                  borderLeftColor: m?.color || '#6366f1',
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-fg">
                    {m?.emoji ? `${m.emoji} ` : ''}
                    {ev.title}
                    {ev.recurrence && ev.recurrence !== 'none' ? (
                      <span className="text-muted font-normal"> · repeats</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {new Date(ev.instanceStart).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {!ev.allDay &&
                      ` · ${new Date(ev.instanceStart).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`}
                  </p>
                </div>
                {m && <Avatar {...m} size="sm" />}
              </div>
            );
          })
        )}
      </Card>
    ),
    todos: (
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-fg">To-Dos by Person</h2>
          <button type="button" onClick={() => setView('todos')} className="text-xs text-accent">
            Open lists →
          </button>
        </div>
        {progressMembers.map((m) => {
          const look = getMember(m.id) || m;
          const open = todos.filter((t) => t.memberId === m.id && !t.completed).length;
          const total = todos.filter((t) => t.memberId === m.id).length;
          const pct = total ? Math.round(((total - open) / total) * 100) : 0;
          return (
            <div key={m.id} className="flex items-center gap-3 mb-3">
              <Avatar {...look} size="sm" />
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-fg-secondary">{m.name}</span>
                  <span className="text-muted text-xs">{open} open</span>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: pct + '%', backgroundColor: look.color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </Card>
    ),
    chorequest: (
      <Card className="!p-4 lg:!p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-fg flex items-center gap-2">
            <Sword className="w-4 h-4 text-accent" />
            ChoreQuest
            {currentUser?.role === 'kid' ? (
              <span className="text-xs font-normal text-muted">· for you</span>
            ) : null}
          </h2>
          <button type="button" onClick={() => setView('chores')} className="text-xs text-accent">
            Open board →
          </button>
        </div>

        {/* Personalized strip for the active profile */}
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

        {/* This-week streak for kids (and parents viewing as themselves) */}
        {currentUser?.role !== 'media' && (
          <div className="rounded-xl bg-inset border border-border px-3 py-2.5 mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                Weekday quests
              </span>
              <span className="font-medium text-fg">
                {Math.min(myStreak.completions, myStreak.target)}/{myStreak.target}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${Math.min(100, Math.round((myStreak.completions / myStreak.target) * 100))}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              {myStreak.claimed
                ? 'Weekend Chest claimed ✓'
                : myStreak.ready
                  ? `Chest ready · +${STREAK_COINS}c · +${STREAK_XP} XP — open Chores to claim`
                  : daysLeft === 0
                    ? 'Week ends today'
                    : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left this week`}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setView('chores')}
            className="rounded-xl bg-inset border border-border px-3 py-2 text-left hover:border-accent/40 transition-colors"
          >
            <p className="text-lg font-bold text-fg">{openCount}</p>
            <p className="text-[11px] text-muted">Open quests</p>
          </button>
          <button
            type="button"
            onClick={() => setView('chores')}
            className="rounded-xl bg-inset border border-border px-3 py-2 text-left hover:border-accent/40 transition-colors"
          >
            <p className="text-lg font-bold text-fg">
              {isParent ? pendingForParents.length : myPending.length}
            </p>
            <p className="text-[11px] text-muted">{isParent ? 'To approve' : 'My pending'}</p>
          </button>
          <div className="rounded-xl bg-inset border border-border px-3 py-2">
            <p className="text-lg font-bold text-amber-600">{myCoins}</p>
            <p className="text-[11px] text-muted">Your coins</p>
          </div>
          <div className="rounded-xl bg-inset border border-border px-3 py-2">
            <p className="text-lg font-bold text-sky-600">{myScreen}m</p>
            <p className="text-[11px] text-muted">Screen bank</p>
          </div>
        </div>

        {/* Parent: party snapshot */}
        {isParent && kids.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5" />
              Party
            </p>
            <div className="flex flex-wrap gap-2">
              {kids.map((k) => {
                const look = getMember(k.id) || k;
                const prog = ensureProgress(progressMap[k.id]);
                const bar = progressTowardNextLevel(prog.xp);
                const streak = streakStatus(data.weekState, k.id);
                return (
                  <div
                    key={k.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-inset border border-border"
                  >
                    <Avatar {...look} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-fg leading-tight">{k.name}</p>
                      <p className="text-[11px] text-muted">
                        Lv {bar.level} · {coinBalances[k.id] ?? 0}c · {screenTimeMap[k.id] ?? 0}m
                        {streak.ready ? ' · chest!' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Kid: next open quests for them */}
        {!isParent && currentUser?.role === 'kid' && (
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
    ),
    choresShop: (

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-fg flex items-center gap-2">
              <Sword className="w-4 h-4 text-accent" /> {isParent ? 'Chores to approve' : 'Chores'}
            </h2>
            <button type="button" onClick={() => setView('chores')} className="text-xs text-accent">
              All chores →
            </button>
          </div>
          {myChores.length === 0 ? (
            <p className="text-sm text-muted py-4 text-center">
              {isParent ? 'No chores waiting for approval.' : 'No open chores — check back soon.'}
            </p>
          ) : (
            myChores.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-accent/10 border border-accent/20 mb-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-fg">{c.title}</p>
                  <p className="text-xs text-muted">
                    {c.status === 'pending' ? 'Waiting for approval' : 'Open'}
                    {(c.xp || c.coins)
                      ? ` · +${c.xp ?? 0} XP · +${c.coins ?? 0}c`
                      : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </Card>
        <Card onClick={() => setView('shopping')}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-500">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-fg">{shopOpen}</p>
              <p className="text-xs text-muted">Shopping items needed</p>
            </div>
          </div>
        </Card>
      </div>
    ),
    look: <ProfileLookCard />,
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      {/* Slim date strip always visible */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted font-medium">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        {!heroOpen && announcement && (
          <button
            type="button"
            onClick={() => setHeroOpen(true)}
            className="text-xs text-accent hover:underline"
          >
            Show message
          </button>
        )}
      </div>

      {heroOpen && (
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-hero-from via-hero-via to-hero-to border border-hero-border p-6 lg:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <button
            type="button"
            onClick={dismissHero}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-hero-sub hover:bg-white/10"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative pr-8">
            <h1 className="text-2xl lg:text-3xl font-bold text-hero-title mb-2">
              Good {greeting}, {currentUser?.name || 'Family'}
            </h1>
            {announcement ? (
              <p className="text-hero-body text-sm max-w-lg">{announcement}</p>
            ) : (
              <p className="text-hero-body text-sm max-w-lg opacity-80">
                Welcome to your Family Command Centre.
              </p>
            )}
          </div>
        </section>
      )}

      {(() => {
        let pairRendered = false;
        return order.map((id) => {
          if (id === 'events' || id === 'todos') {
            if (pairRendered) return null;
            pairRendered = true;
            return (
              <SectionChromePair key="events-todos-pair">
                {sections.events}
                {sections.todos}
              </SectionChromePair>
            );
          }
          return (
            <SectionChrome key={id} id={id}>
              {sections[id]}
            </SectionChrome>
          );
        });
      })()}
    </div>
  );
}
