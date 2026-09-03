import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import {
  Calendar,
  Check,
  CheckSquare,
  StickyNote,
  MessageCircle,
  Coins,
  MonitorPlay,
  Plus,
  ShoppingCart,
  Newspaper,
  Sparkles,
  GripVertical,
  Columns2,
  Square,
  Sword,
  Trophy,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { ProfileLookCard } from '../components/ProfileLookEditor';
import type { CalendarEvent, ExpandedEvent, FamilyData, PresenceStatus, Quest, ViewId } from '../types';
import { FAMILY_LIST_ID, PRESENCE_OPTIONS } from '../types';
import { upcomingExpanded } from '../lib/recurrence';
import {
  pairOrReorder,
  popOutToFullRow,
  isPaired,
  type HomescreenWidgetId,
} from '../lib/homescreen';
import {
  ensureProgress,
  getChoreQuestConfig,
  isoWeekId,
  progressTowardNextLevel,
} from '../lib/quest';
import {
  daysUntilWeekEnd,
  recordWeekdayCompletion,
  streakStatus,
} from '../lib/weekCycle';
import { cn } from '../lib/cn';

const COLOR_ICON: Record<string, string> = {
  indigo: 'bg-accent/15 text-accent',
  emerald: 'bg-sky-500/15 text-sky-500',
  amber: 'bg-amber-500/15 text-amber-500',
  pink: 'bg-pink-500/15 text-pink-500',
};

const DISMISS_ANN_KEY = 'fcc_dismissed_announcement';

type SectionId = HomescreenWidgetId;

const SECTION_LABELS: Record<SectionId, string> = {
  stats: 'Quick stats',
  chorequest: 'ChoreQuest',
  presence: 'Where is everyone',
  digest: 'This week',
  events: 'Upcoming Events',
  todos: 'My to-dos',
  chores: 'Chores',
  shopping: 'Shopping',
  look: 'Profile look',
};

function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}


/** Stable chrome — outside Dashboard so inputs don't remount on keystroke. */
function SectionChrome({
  id,
  paired,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onPopOut,
  partnerOptions,
  onChoosePartner,
  children,
}: {
  id: SectionId;
  paired: boolean;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: (id: SectionId) => void;
  onDragOver: (e: DragEvent, id: SectionId) => void;
  onDrop: (id: SectionId) => void;
  onDragEnd: () => void;
  onPopOut: (id: SectionId) => void;
  partnerOptions: { id: SectionId; label: string }[];
  onChoosePartner: (fromId: SectionId, toId: SectionId) => void;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        'relative group/section transition-opacity min-h-0 flex flex-col',
        paired && 'h-full',
        dragging && 'opacity-40',
        dragOver && 'ring-2 ring-accent/50 rounded-2xl',
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        onDragStart(id);
      }}
      onDragOver={(e) => onDragOver(e, id)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(id);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-end gap-1 mb-1 shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (paired) {
                onPopOut(id);
              } else {
                setMenuOpen((v) => !v);
              }
            }}
            className="p-1 rounded-md text-faint hover:text-fg hover:bg-nav-hover"
            title={paired ? 'Make full width' : 'Share row with another card'}
          >
            {paired ? (
              <Square className="w-3.5 h-3.5" />
            ) : (
              <Columns2 className="w-3.5 h-3.5" />
            )}
          </button>
          {menuOpen && !paired && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-xl border border-border bg-surface shadow-lg overflow-hidden">
                <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-faint border-b border-border">
                  Share row with…
                </p>
                {partnerOptions.length === 0 ? (
                  <p className="px-3 py-2.5 text-xs text-muted">No other cards free right now.</p>
                ) : (
                  partnerOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChoosePartner(id, opt.id);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-fg hover:bg-nav-hover"
                    >
                      {opt.label}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <span
          className="p-1 rounded-md text-faint cursor-grab active:cursor-grabbing hover:text-fg hover:bg-nav-hover"
          title="Drag onto another card to share its row"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </span>
      </div>
      <div
        className={cn(
          'min-w-0 flex flex-col',
          paired && 'flex-1 [&>*]:h-full',
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Dashboard() {
  const {
    data,
    update,
    setView,
    getMember,
    currentUser,
    isParent,
    myHomescreenRows,
    setMyHomescreenRows,
  } = useApp();
  const { events, todos, notes, messages, members, settings } = data;
  const chores = data.chores || [];
  const shopping = data.shopping || [];
  const presence = data.presence || {};
  const now = new Date();
  const myId = currentUser?.id || settings.currentUserId;

  // Per-user layout: rows of 1 (full width) or 2 (shared) card ids.
  const rows = myHomescreenRows;

  const [dragId, setDragId] = useState<SectionId | null>(null);
  const [overId, setOverId] = useState<SectionId | null>(null);

  const onSectionDragStart = (id: SectionId) => setDragId(id);
  const onSectionDragOver = (e: DragEvent, id: SectionId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverId(id);
  };
  /** Dropping (or picking from the menu) always pairs fromId into toId's row. */
  const pairSections = (fromId: SectionId, toId: SectionId) => {
    if (fromId === toId) return;
    setMyHomescreenRows(pairOrReorder(rows, fromId, toId));
  };
  const onSectionDrop = (toId: SectionId) => {
    const fromId = dragId;
    setDragId(null);
    setOverId(null);
    if (!fromId) return;
    pairSections(fromId, toId);
  };
  const onSectionDragEnd = () => {
    setDragId(null);
    setOverId(null);
  };
  const onPopOut = (id: SectionId) => {
    setMyHomescreenRows(popOutToFullRow(rows, id));
  };
  /** Other cards currently alone in their row — valid drop/pick targets to share a row with. */
  const soloPartnersFor = (id: SectionId): { id: SectionId; label: string }[] =>
    rows
      .filter((row) => row.length === 1 && row[0] !== id)
      .map((row) => ({ id: row[0]!, label: SECTION_LABELS[row[0]!] }));

  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const screenTimeMap = data.screenTime || {};
  const cq = getChoreQuestConfig(data);
  const myProgress = ensureProgress(progressMap[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);
  const myCoins = coinBalances[myId] ?? 0;
  const myScreen = screenTimeMap[myId] ?? 0;
  const myStreak = streakStatus(data.weekState, myId, cq);
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

  const [shopDraft, setShopDraft] = useState('');
  const [todoDraft, setTodoDraft] = useState('');
  const [eventDraft, setEventDraft] = useState('');
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [evTitle, setEvTitle] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evNotes, setEvNotes] = useState('');

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

  /* ── Inline home actions ─────────────────────────────── */
  const openShopItems = useMemo(
    () => (shopping || []).filter((s) => !s.bought),
    [shopping],
  );

  /** To-dos for the active profile (+ shared family list). */
  const myOpenTodos = useMemo(() => {
    return todos.filter(
      (td) =>
        !td.completed &&
        (td.memberId === myId || td.memberId === FAMILY_LIST_ID),
    );
  }, [todos, myId]);

  const addShopItem = () => {
    const text = shopDraft.trim();
    if (!text) return;
    update((d) => ({
      ...d,
      shopping: [
        {
          id: crypto.randomUUID(),
          text,
          claimedById: undefined,
          bought: false,
          createdById: myId,
          createdAt: new Date().toISOString(),
        },
        ...(d.shopping || []),
      ],
    }));
    setShopDraft('');
  };

  const toggleBought = (id: string) => {
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) =>
        s.id === id ? { ...s, bought: !s.bought } : s,
      ),
    }));
  };

  const toggleTodo = (id: string) => {
    update((d) => ({
      ...d,
      todos: d.todos.map((td) => {
        if (td.id !== id) return td;
        const next = !td.completed;
        return { ...td, completed: next, status: next ? ('done' as const) : ('todo' as const) };
      }),
    }));
  };

  const addMyTodo = () => {
    const text = todoDraft.trim();
    if (!text) return;
    update((d) => ({
      ...d,
      todos: [
        {
          id: crypto.randomUUID(),
          text,
          memberId: myId,
          createdById: myId,
          completed: false,
          status: 'todo' as const,
          priority: 'medium' as const,
          createdAt: new Date().toISOString(),
        },
        ...d.todos,
      ],
    }));
    setTodoDraft('');
  };

  /** Quick all-day event for today from the home card. */
  const addQuickEvent = () => {
    const title = eventDraft.trim();
    if (!title) return;
    const startLocal = new Date();
    startLocal.setHours(12, 0, 0, 0);
    const endExclusive = new Date(startLocal);
    endExclusive.setDate(endExclusive.getDate() + 1);
    endExclusive.setHours(0, 0, 0, 0);
    update((d) => ({
      ...d,
      events: [
        ...d.events,
        {
          id: crypto.randomUUID(),
          title,
          start: startLocal.toISOString(),
          end: endExclusive.toISOString(),
          allDay: true,
          memberId: myId,
          memberIds: [myId],
        },
      ],
    }));
    setEventDraft('');
  };

  const openEventEdit = (ev: ExpandedEvent | CalendarEvent) => {
    // Prefer master event from data so edits persist on the series
    const masterId = 'masterId' in ev && ev.masterId ? ev.masterId : ev.id;
    const master = data.events.find((e) => e.id === masterId) || ev;
    setEditEvent(master);
    setEvTitle(master.title);
    setEvLocation(master.location || '');
    setEvNotes(master.notes || '');
  };

  const saveEventEdit = () => {
    if (!editEvent || !evTitle.trim()) return;
    update((d) => ({
      ...d,
      events: d.events.map((e) =>
        e.id === editEvent.id
          ? {
              ...e,
              title: evTitle.trim(),
              location: evLocation.trim() || undefined,
              notes: evNotes.trim() || undefined,
            }
          : e,
      ),
    }));
    setEditEvent(null);
  };

  const submitQuestHome = (quest: Quest) => {
    if (!currentUser || currentUser.role === 'media') return;
    update((d) => ({
      ...d,
      chores: (d.chores || []).map((c) =>
        c.id === quest.id
          ? {
              ...c,
              status: 'pending' as const,
              submittedById: currentUser.id,
              submittedAt: new Date().toISOString(),
            }
          : c,
      ),
    }));
  };

  const approveQuestHome = (quest: Quest) => {
    if (!isParent || !currentUser) return;
    const forId = quest.submittedById || quest.approvedForId;
    if (!forId) return;
    const xpGain = quest.xp ?? 0;
    const coinGain = quest.coins ?? 0;
    const at = new Date().toISOString();
    const weekId = isoWeekId();
    update((d) => {
      const prevProg = ensureProgress(d.memberProgress?.[forId]);
      const newXp = prevProg.xp + xpGain;
      const newLevel = progressTowardNextLevel(newXp).level;
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
        byId: currentUser.id,
        at,
        weekId,
      };
      let result: FamilyData = {
        ...d,
        chores: (d.chores || []).map((c) =>
          c.id === quest.id
            ? {
                ...c,
                status: 'done' as const,
                approvedForId: forId,
                approvedById: currentUser.id,
                approvedAt: at,
                rewardMinutes: 0,
              }
            : c,
        ),
        memberProgress: nextProgress,
        coinBalances: nextBalances,
        coinLedger: [ledgerEntry, ...(d.coinLedger || [])].slice(0, 200),
      };
      result = recordWeekdayCompletion(result, forId, new Date(at));
      return result;
    });
  };

  const rejectQuestHome = (quest: Quest) => {
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


  const cards: { icon: typeof Calendar; label: string; value: number; color: string; view: ViewId }[] = [
    { icon: Calendar, label: 'Upcoming', value: upcoming.length, color: 'indigo', view: 'calendar' },
    { icon: CheckSquare, label: 'Open tasks', value: openTasksCount, color: 'emerald', view: 'todos' },
    { icon: StickyNote, label: 'Notes', value: notes.length, color: 'amber', view: 'notes' },
    { icon: MessageCircle, label: 'Unread', value: unread, color: 'pink', view: 'messages' },
  ];

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(
    weekStart.getTime() + 6 * 86400000,
  ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const sections: Record<SectionId, ReactNode> = {
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
      <Card className="!p-4">
        <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-6">
          <div className="min-w-0 shrink-0">
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
          <div className="lg:border-l lg:border-border lg:pl-6 min-w-0">
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
                  <li key={`${ev.masterId}-${ev.instanceStart}`}>
                    <button
                      type="button"
                      onClick={() => openEventEdit(ev)}
                      className="text-left w-full hover:text-accent transition-colors"
                    >
                      <span className="text-muted">
                        {new Date(ev.instanceStart).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>{' '}
                      <span className="text-fg underline-offset-2 hover:underline">{ev.title}</span>
                      {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
                    </button>
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
                {overdueTodos.slice(0, 5).map((td) => (
                  <li key={td.id}>
                    <button
                      type="button"
                      onClick={() => toggleTodo(td.id)}
                      className="text-left w-full text-fg hover:text-accent"
                      title="Mark done"
                    >
                      {td.text}
                    </button>
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
              <ul className="space-y-2">
                {myChores.slice(0, 4).map((c) => (
                  <li key={c.id} className="text-fg">
                    <p className="text-sm">{c.title}{c.status === 'pending' ? ' · pending' : ''}</p>
                    {isParent && c.status === 'pending' && (
                      <div className="flex gap-1.5 mt-1">
                        <Button size="sm" className="!px-2 !py-1 text-xs" onClick={() => approveQuestHome(c)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => rejectQuestHome(c)}>
                          Reject
                        </Button>
                      </div>
                    )}
                    {!isParent && (c.status === 'open' || !c.status) && (
                      <Button size="sm" variant="secondary" className="!px-2 !py-1 text-xs mt-1" onClick={() => submitQuestHome(c)}>
                        Done
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Also</p>
            <ul className="space-y-1.5 text-fg">
              <li>
                <button type="button" className="hover:text-accent" onClick={() => setView('messages')}>
                  {unread} unread message{unread === 1 ? '' : 's'}
                </button>
              </li>
              <li>
                <button type="button" className="hover:text-accent" onClick={() => setView('shopping')}>
                  {shopOpen} shopping item{shopOpen === 1 ? '' : 's'}
                </button>
              </li>
              {announcement && <li className="text-muted line-clamp-2">📌 {announcement}</li>}
            </ul>
          </div>
        </div>
      </Card>
    ),
    events: (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-fg">Upcoming Events</h2>
          <button type="button" onClick={() => setView('calendar')} className="text-xs text-accent">
            Calendar →
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            placeholder="Add an event for today…"
            value={eventDraft}
            onChange={(e) => setEventDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addQuickEvent();
            }}
          />
          <Button size="sm" onClick={addQuickEvent} disabled={!eventDraft.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[11px] text-faint mb-2">Quick add creates an all-day event for today. Open Calendar for times.</p>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">No upcoming events. Enjoy the calm! ☀️</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2 pr-0.5">
            {upcoming.map((ev) => {
              const m = getMember(ev.memberId);
              const when = new Date(ev.instanceStart || ev.start);
              return (
                <button
                  key={`${ev.masterId || ev.id}-${ev.instanceStart || ev.start}`}
                  type="button"
                  onClick={() => openEventEdit(ev)}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border hover:border-accent/40 hover:bg-nav-hover/40 transition-colors"
                  style={{
                    backgroundColor: (m?.color || '#6366f1') + '14',
                    borderLeftWidth: 4,
                    borderLeftColor: m?.color || '#6366f1',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-fg truncate">{ev.title}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {when.toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: ev.allDay ? undefined : 'numeric',
                        minute: ev.allDay ? undefined : '2-digit',
                      })}
                      {m ? ` · ${m.name}` : ''}
                      {ev.location ? ` · ${ev.location}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-accent shrink-0 mt-0.5">Edit</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    ),

    todos: (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-fg flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-accent" />
            My to-dos
          </h2>
          <button type="button" onClick={() => setView('todos')} className="text-xs text-accent">
            All lists →
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            placeholder="Add a to-do for me…"
            value={todoDraft}
            onChange={(e) => setTodoDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addMyTodo();
            }}
          />
          <Button size="sm" onClick={addMyTodo} disabled={!todoDraft.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted mb-2">
          Your tasks and the family list — tap to complete.
        </p>
        {myOpenTodos.length === 0 ? (
          <p className="text-sm text-muted py-3 text-center">Nothing on your list. Nice work.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {myOpenTodos.slice(0, 12).map((td) => (
              <button
                key={td.id}
                type="button"
                onClick={() => toggleTodo(td.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-nav-hover/50 text-left transition-colors"
              >
                <span className="w-5 h-5 rounded-md border border-border-strong flex items-center justify-center shrink-0">
                  {/* open circle */}
                </span>
                <span className="text-sm text-fg flex-1 min-w-0 truncate">{td.text}</span>
                {td.memberId === FAMILY_LIST_ID && (
                  <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">Family</span>
                )}
              </button>
            ))}
          </div>
        )}
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
                  ? `Chest ready · +${cq.streakCoins}c · +${cq.streakXp} XP — open Chores to claim`
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
                const streak = streakStatus(data.weekState, k.id, cq);
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
    chores: (
      <Card className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-fg flex items-center gap-2">
            <Sword className="w-4 h-4 text-accent" />
            {isParent ? 'Chores to approve' : 'My quests'}
          </h2>
          <button type="button" onClick={() => setView('chores')} className="text-xs text-accent">
            Board →
          </button>
        </div>
        {myChores.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center flex-1 flex items-center justify-center">
            {isParent ? 'No quests waiting for approval.' : 'No open quests — check back soon.'}
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 flex-1 min-h-0">
            {myChores.map((c) => {
              const submitter = c.submittedById ? getMember(c.submittedById) : undefined;
              return (
                <div
                  key={c.id}
                  className="p-3 rounded-xl border border-border bg-inset/50 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-fg">{c.title}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {c.status === 'pending'
                          ? submitter
                            ? `${submitter.name} finished this`
                            : 'Pending approval'
                          : 'Open'}
                        {(c.xp || c.coins) ? ` · +${c.xp ?? 0} XP · +${c.coins ?? 0}c` : ''}
                      </p>
                    </div>
                    {submitter && c.status === 'pending' && <Avatar {...submitter} size="sm" />}
                  </div>
                  {isParent && c.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => approveQuestHome(c)}>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rejectQuestHome(c)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                  {!isParent && c.status === 'open' && (
                    <Button size="sm" variant="secondary" className="w-full" onClick={() => submitQuestHome(c)}>
                      I finished this
                    </Button>
                  )}
                  {!isParent && c.status === 'pending' && c.submittedById === myId && (
                    <p className="text-xs text-amber-600">Waiting for a parent…</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    ),

    shopping: (
      <Card className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-fg flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-sky-500" />
            Shopping
          </h2>
          <button type="button" onClick={() => setView('shopping')} className="text-xs text-accent">
            Full list →
          </button>
        </div>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            placeholder="Add to shopping list…"
            value={shopDraft}
            onChange={(e) => setShopDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addShopItem();
            }}
          />
          <Button size="sm" onClick={addShopItem} disabled={!shopDraft.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {openShopItems.length === 0 ? (
          <p className="text-sm text-muted py-3 text-center flex-1 flex items-center justify-center">List is empty.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-1.5 flex-1 min-h-0">
            {openShopItems.slice(0, 20).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleBought(s.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-nav-hover/50 text-left transition-colors"
              >
                <span className="w-5 h-5 rounded-md border border-border-strong shrink-0" />
                <span className="text-sm text-fg flex-1 min-w-0 truncate">
                  {s.quantity ? `${s.quantity} ` : ''}
                  {s.text}
                </span>
                {s.store ? <span className="text-[11px] text-muted shrink-0">{s.store}</span> : null}
              </button>
            ))}
          </div>
        )}
      </Card>
    ),

    look: <ProfileLookCard />,
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-6">
      {/* Slim date strip always visible */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted font-medium">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-[11px] text-faint mt-0.5 hidden sm:block">
            Drag cards to reorder · use the width icon to full / half
          </p>
        </div>
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

      <div className="space-y-2">
        {rows.map((row, ri) => (
          <div
            key={`row-${ri}-${row.join('-')}`}
            className={cn(
              'grid gap-2 items-stretch',
              row.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1',
            )}
          >
            {row.map((id) => (
              <SectionChrome
                key={id}
                id={id}
                paired={isPaired(rows, id)}
                dragging={dragId === id}
                dragOver={overId === id && dragId !== id}
                onDragStart={onSectionDragStart}
                onDragOver={onSectionDragOver}
                onDrop={onSectionDrop}
                onDragEnd={onSectionDragEnd}
                onPopOut={onPopOut}
                partnerOptions={soloPartnersFor(id)}
                onChoosePartner={pairSections}
              >
                {sections[id]}
              </SectionChrome>
            ))}
          </div>
        ))}
      </div>
      {/* Quick event edit from home */}
      <Modal
        open={!!editEvent}
        onClose={() => setEditEvent(null)}
        title="Edit event"
      >
        {editEvent && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Title</label>
              <input
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Location</label>
              <input
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
                value={evLocation}
                onChange={(e) => setEvLocation(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Notes</label>
              <textarea
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent min-h-[80px]"
                value={evNotes}
                onChange={(e) => setEvNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <p className="text-xs text-muted">
              For time, recurrence, or who&apos;s assigned, use{' '}
              <button type="button" className="text-accent" onClick={() => { setEditEvent(null); setView('calendar'); }}>
                Calendar
              </button>
              .
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setEditEvent(null)}>
                Cancel
              </Button>
              <Button onClick={saveEventEdit} disabled={!evTitle.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
