import { ScreenTimerCard } from '../components/ScreenTimerCard';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Calendar,
  Check,
  CheckSquare,
  StickyNote,
  MessageCircle,
  Plus,
  ShoppingCart,
  Newspaper,
  Sword,
  X,
  Eye,
  EyeOff,
  LayoutGrid,
  Megaphone,
  Home,
  BookOpen,
  Lock,
  GraduationCap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cloudCreateJournalEntry } from '../lib/firebase';
import {
  getWeather,
  weatherDayTip,
  type WeatherSnapshot,
} from '../lib/weather';
import { WeatherCard } from '../components/WeatherCard';

import { uid } from '../lib/uid';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { ProfileLookCard } from '../components/ProfileLookEditor';
import { LightsCard } from '../components/LightsCard';
import { ContinueReadingCard } from '../components/ContinueReadingCard';
import { RecommendationsCard } from '../components/RecommendationsCard';
import { PictureFrameCard } from '../components/PictureFrameCard';
import type { CalendarEvent, ExpandedEvent, FamilyData, JournalVisibility, Note, PresenceStatus, Quest, ViewId } from '../types';
import { applyTodoStatus, creditMemberForQuest } from '../lib/todoQuest';
import { actingMember, actingMemberId } from '../lib/actingMember';
import {
  blocksForKidDate,
  dayCompletionState,
  localDateStr as schoolLocalDate,
  completeStudyBlock,
} from '../lib/school';
import { FAMILY_LIST_ID, PRESENCE_OPTIONS } from '../types';
import { upcomingExpanded } from '../lib/recurrence';
import {
  applyHomescreenDrop,
  isPaired,
  cyclePairWidth,
  pairWidthMode,
  rowUsesThirds,
  cardColSpanClass,
  visibleHomescreenRows,
  HOMESCREEN_WIDGETS,
  type HomescreenDropPlacement,
} from '../lib/homescreen';
import {
  ensureProgress,
  getChoreQuestConfig,
  isoWeekId,
  progressTowardNextLevel,
} from '../lib/quest';
import {
  recordWeekdayCompletion,
  streakStatus,
} from '../lib/weekCycle';
import { cn } from '../lib/cn';

import {
  SECTION_LABELS,
  HOME_EVENTS_FILTER_KEY,
  COLOR_ICON,
  DISMISS_ANN_KEY,
  HOME_JOURNAL_MOODS,
  homeJournalPrompt,
  startOfWeekMonday,
  eventAssigneeIds,
  loadHomeEventsFilter,
  type SectionId,
} from './dashboard/constants';
import { SectionChrome } from './dashboard/SectionChrome';
import { EventsHomeCard } from './dashboard/EventsHomeCard';
import { TodosHomeCard } from './dashboard/TodosHomeCard';
import { ChoreQuestHomeCard } from './dashboard/ChoreQuestHomeCard';

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
    myHomescreenSpans,
    setMyHomescreenSpans,
    myHiddenWidgets,
    setMyHiddenWidgets,
    familyId,
    authUser,
    cloudReady,
  } = useApp();
  const { events, todos, notes, messages, members, settings } = data;
  const chores = data.chores || [];
  const shopping = data.shopping || [];
  const presence = data.presence || {};
  const now = new Date();
  const myId = currentUser?.id || settings.currentUserId;
  const myUid = authUser?.uid || '';
  const journalHasOwnAuth = !!(currentUser?.uid && currentUser.uid === authUser?.uid);
  const [journalDraft, setJournalDraft] = useState('');
  const [journalMood, setJournalMood] = useState<string | undefined>();
  const [journalVis, setJournalVis] = useState<JournalVisibility>('private');
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalMsg, setJournalMsg] = useState<string | null>(null);
  const [weatherSnap, setWeatherSnap] = useState<WeatherSnapshot | null>(null);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const journalPrompt = useMemo(() => homeJournalPrompt(), []);

  const refreshWeather = async (force = false) => {
    setWeatherLoading(true);
    setWeatherErr(null);
    try {
      const snap = await getWeather(data.settings.weather, force);
      setWeatherSnap(snap);
    } catch (e) {
      setWeatherErr(e instanceof Error ? e.message : 'Weather unavailable');
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    void refreshWeather(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.weather?.latitude, data.settings.weather?.longitude]);

  const saveJournalFromHome = async () => {
    const text = journalDraft.trim();
    if (!text || !currentUser || !familyId || !myUid) return;
    if (!cloudReady) {
      setJournalMsg('Connect to the cloud to save journal entries.');
      return;
    }
    if (journalVis === 'family') {
      const ok = window.confirm('This will be visible to your whole family — share it?');
      if (!ok) return;
    }
    setJournalSaving(true);
    setJournalMsg(null);
    try {
      const ts = new Date().toISOString();
      await cloudCreateJournalEntry(familyId, {
        id: uid(),
        authorId: currentUser.id,
        authorUid: myUid,
        visibility: journalVis,
        text,
        mood: journalMood || undefined,
        promptId: `home-${Math.floor(Date.now() / 86_400_000)}`,
        createdAt: ts,
        updatedAt: ts,
      });
      setJournalDraft('');
      setJournalMood(undefined);
      setJournalVis('private');
      setJournalMsg('Saved to your journal.');
      window.setTimeout(() => setJournalMsg(null), 2500);
    } catch (e) {
      setJournalMsg(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setJournalSaving(false);
    }
  };

  const [eventsFilterMemberId, setEventsFilterMemberIdState] = useState(loadHomeEventsFilter);
  const setEventsFilterMemberId = (id: string) => {
    setEventsFilterMemberIdState(id);
    try {
      localStorage.setItem(HOME_EVENTS_FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  };

  // Per-user layout: rows of 1 (full width) or 2 (shared) card ids.
  const rows = myHomescreenRows;
  const hiddenSet = useMemo(() => new Set(myHiddenWidgets), [myHiddenWidgets]);
  // What actually renders — hidden cards are dropped, but their spot in
  // `rows` (position + pairing) is preserved so unhiding restores it.
  const visibleRows = useMemo(() => {
    const base = visibleHomescreenRows(rows, myHiddenWidgets);
    const app = data.appearance?.[myId];
    let next = base;
    // Don't show frame 2 until purchased; frame 1 still shows locked teaser if on layout
    if (!app?.unlockPictureFrame2) {
      next = next
        .map((row) => row.filter((id) => id !== 'pictureframe2'))
        .filter((row) => row.length > 0);
    }
    // Living-room lights control is parents-only
    if (!isParent) {
      next = next
        .map((row) => row.filter((id) => id !== 'lights'))
        .filter((row) => row.length > 0);
    }
    return next;
  }, [rows, myHiddenWidgets, data.appearance, myId, isParent]);
  const [manageOpen, setManageOpen] = useState(false);
  const [viewNote, setViewNote] = useState<Note | null>(null);

  const [dragId, setDragId] = useState<SectionId | null>(null);
  const [dropHint, setDropHint] = useState<HomescreenDropPlacement | null>(null);
  // Refs so drop handlers always see the latest hint (avoid stale closure on drop).
  const dragIdRef = useRef<SectionId | null>(null);
  const dropHintRef = useRef<HomescreenDropPlacement | null>(null);
  dragIdRef.current = dragId;
  dropHintRef.current = dropHint;

  const sideFromEvent = (e: DragEvent, el: HTMLElement): 'left' | 'right' => {
    const rect = el.getBoundingClientRect();
    // Prefer left when in the left 55% so left-drops are easier to hit.
    const ratio = (e.clientX - rect.left) / Math.max(rect.width, 1);
    return ratio < 0.55 ? 'left' : 'right';
  };

  const onSectionDragStart = (id: SectionId) => {
    setDragId(id);
    dragIdRef.current = id;
    setDropHint(null);
    dropHintRef.current = null;
  };

  const onSectionDragOver = (e: DragEvent, id: SectionId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdRef.current === id) {
      setDropHint(null);
      dropHintRef.current = null;
      return;
    }
    const side = sideFromEvent(e, e.currentTarget as HTMLElement);
    const hint: HomescreenDropPlacement = { kind: 'beside', targetId: id, side };
    setDropHint(hint);
    dropHintRef.current = hint;
  };

  const onGapDragOver = (e: DragEvent, hint: HomescreenDropPlacement) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropHint(hint);
    dropHintRef.current = hint;
  };

  const commitDrop = (placement: HomescreenDropPlacement) => {
    const fromId = dragIdRef.current;
    setDragId(null);
    dragIdRef.current = null;
    setDropHint(null);
    dropHintRef.current = null;
    if (!fromId) return;
    setMyHomescreenRows(applyHomescreenDrop(rows, fromId, placement));
  };

  const onSectionDrop = (e: DragEvent, toId: SectionId) => {
    e.preventDefault();
    e.stopPropagation();
    // Trust the last dragOver hint when it matches this card — drop event
    // coordinates are often wrong and were forcing everything to the right.
    const hint = dropHintRef.current;
    if (hint?.kind === 'beside' && hint.targetId === toId) {
      commitDrop(hint);
      return;
    }
    const side = sideFromEvent(e, e.currentTarget as HTMLElement);
    commitDrop({ kind: 'beside', targetId: toId, side });
  };

  const onGapDrop = (e: DragEvent, fallback: HomescreenDropPlacement) => {
    e.preventDefault();
    e.stopPropagation();
    const hint = dropHintRef.current;
    if (hint && (hint.kind === 'gapStart' || hint.kind === 'gapAfter')) {
      commitDrop(hint);
      return;
    }
    commitDrop(fallback);
  };

  const onSectionDragEnd = () => {
    setDragId(null);
    dragIdRef.current = null;
    setDropHint(null);
    dropHintRef.current = null;
  };
  const hideWidget = (id: SectionId) => {
    if (hiddenSet.has(id)) return;
    setMyHiddenWidgets([...myHiddenWidgets, id]);
  };
  const showWidget = (id: SectionId) => {
    setMyHiddenWidgets(myHiddenWidgets.filter((x) => x !== id));
  };
  const progressMap = data.memberProgress || {};
  const coinBalances = data.coinBalances || {};
  const screenTimeMap = data.screenTime || {};
  const cq = getChoreQuestConfig(data);
  const myProgress = ensureProgress(progressMap[myId]);
  const myBar = progressTowardNextLevel(myProgress.xp);
  const myCoins = coinBalances[myId] ?? 0;
  const myScreen = screenTimeMap[myId] ?? 0;
  const openCount = chores.filter((c) => c.status === 'open' || !c.status).length;
  const kids = members.filter((m) => m.role === 'kid');

  /** Parent-controlled home notes; fixed strip — not part of card layout DnD. */
  const homeNotes = useMemo(() => {
    const notes = data.notes || [];
    return notes
      .filter((n) => {
        if (!n.showOnHome && n.kind !== 'notice') return false;
        // notices always imply home until acknowledged (legacy safety)
        const onHome = n.showOnHome || n.kind === 'notice';
        if (!onHome) return false;
        if (isParent) return true;
        if (currentUser?.role === 'kid') {
          if (n.kind === 'notice') {
            return !(n.readBy || []).includes(myId);
          }
          return true; // kids cannot dismiss non-notice home notes
        }
        return false;
      })
      .sort(
        (a, b) =>
          Number(b.kind === 'notice') - Number(a.kind === 'notice') ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [data.notes, isParent, currentUser?.role, myId]);

  const acknowledgeHomeNotice = (noteId: string) => {
    update((d) => ({
      ...d,
      notes: (d.notes || []).map((n) => {
        if (n.id !== noteId) return n;
        const readBy = n.readBy || [];
        if (readBy.includes(myId)) return n;
        return { ...n, readBy: [...readBy, myId], updatedAt: new Date().toISOString() };
      }),
    }));
  };


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

  const upcoming = upcomingExpanded(events, now, 14)
    .filter((ev) =>
      eventsFilterMemberId === 'all'
        ? true
        : eventAssigneeIds(ev).includes(eventsFilterMemberId),
    )
    .slice(0, 5);
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
  const themeId =
    (currentUser && data.appearance?.[currentUser.id]?.theme) ||
    data.settings.theme ||
    'dark';
  const isSpyFamily = themeId === 'spyfamily';
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
    update((d) => {
      const t = d.todos.find((x) => x.id === id);
      if (!t) return d;
      const nextDone = !t.completed;
      return applyTodoStatus(d, id, nextDone ? 'done' : 'todo', {
        actorId: actingMemberId(d) || myId,
      });
    });
  };

  const addMyTodo = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    update((d) => ({
      ...d,
      todos: [
        {
          id: crypto.randomUUID(),
          text: trimmed,
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
  };

  /** Quick all-day event for today from the home card. */
  const addQuickEvent = (titleArg: string) => {
    const title = titleArg.trim();
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
    update((d) => {
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

  const approveQuestHome = (quest: Quest) => {
    if (!isParent || !currentUser) return;
    const forId =
      creditMemberForQuest(data, quest) || quest.submittedById || quest.approvedForId;
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
                status: c.repeatable !== false ? ('open' as const) : ('done' as const),
                submittedById: undefined,
                submittedAt: undefined,
                approvedForId: forId,
                approvedById: currentUser.id,
                approvedAt: at,
                rewardMinutes: 0,
                lastCompletedAt: at,
                lastCompletedById: forId,
              }
            : c,
        ),
        memberProgress: nextProgress,
        coinBalances: nextBalances,
        coinLedger: [ledgerEntry, ...(d.coinLedger || [])].slice(0, 200),
      };
      result = recordWeekdayCompletion(result, forId, new Date(at), quest.submittedAt);
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
            <h2 className="font-semibold text-fg mb-2 text-lg">Where is everyone?</h2>
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
          <h2 className="font-semibold text-fg flex items-center gap-2 text-lg">
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
      <EventsHomeCard
        upcoming={upcoming}
        household={household}
        getMember={getMember}
        filterMemberId={eventsFilterMemberId}
        onFilterMemberId={setEventsFilterMemberId}
        onQuickAdd={addQuickEvent}
        onOpenEvent={openEventEdit}
        onOpenCalendar={() => setView('calendar')}
      />
    ),
    todos: (
      <TodosHomeCard
        todos={todos}
        myId={myId}
        onToggleTodo={toggleTodo}
        onAddTodo={addMyTodo}
        onOpenTodos={() => setView('todos')}
      />
    ),
    chorequest: (
      <ChoreQuestHomeCard
        isParent={isParent}
        currentUser={currentUser}
        myId={myId}
        chores={chores}
        kids={kids}
        pendingForParents={pendingForParents}
        myPending={myPending}
        openCount={openCount}
        progressMap={progressMap}
        coinBalances={coinBalances}
        screenTimeMap={screenTimeMap}
        redemptions={data.redemptions}
        weekState={data.weekState}
        cq={cq}
        getMember={getMember}
        onOpenChores={() => setView('chores')}
        onApprove={approveQuestHome}
      />
    ),
    chores: (
      <Card className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-fg flex items-center gap-2 text-lg">
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
          <h2 className="font-semibold text-fg flex items-center gap-2 text-lg">
            <ShoppingCart className="w-4 h-4 text-sky-500" />
            Shopping
          </h2>
          <button type="button" onClick={() => setView('shopping')} className="text-xs text-accent shrink-0">
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

    journal: (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-fg flex items-center gap-2 text-lg">
            <BookOpen className="w-4 h-4 text-accent" />
            Journal
          </h2>
          <button type="button" onClick={() => setView('journal')} className="text-xs text-accent shrink-0">
            Open →
          </button>
        </div>
        <p className="text-xs text-muted italic mb-2">{journalPrompt}</p>
        {!journalHasOwnAuth && currentUser && (
          <p className="text-[11px] text-muted mb-2 leading-relaxed">
            <Lock className="w-3 h-3 inline relative -top-px mr-0.5" />
            PIN profiles share a login — Private is app-hidden only. Own accounts get stronger privacy.
          </p>
        )}
        <textarea
          value={journalDraft}
          onChange={(e) => setJournalDraft(e.target.value)}
          placeholder="Write a few lines…"
          rows={3}
          maxLength={5000}
          className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent resize-y min-h-[4.5rem] mb-2"
        />
        <div className="flex flex-wrap gap-1 mb-2">
          {HOME_JOURNAL_MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setJournalMood((cur) => (cur === m ? undefined : m))}
              className={cn(
                'w-8 h-8 rounded-lg text-base flex items-center justify-center border transition-colors',
                journalMood === m
                  ? 'border-accent bg-accent/15'
                  : 'border-border bg-surface-2 hover:bg-surface-3',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {([
            ['private', 'Private'],
            ['parents', 'Parents'],
            ['family', 'Everyone'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setJournalVis(id)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                journalVis === id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border bg-surface-2 text-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void saveJournalFromHome()}
            disabled={!journalDraft.trim() || journalSaving || !cloudReady}
          >
            {journalSaving ? 'Saving…' : 'Save entry'}
          </Button>
          {journalMsg && <p className="text-xs text-muted">{journalMsg}</p>}
        </div>
      </Card>
    ),

    weather: (
      <WeatherCard
        snap={weatherSnap}
        tip={weatherSnap ? weatherDayTip(weatherSnap.hourly || []) : null}
        loading={weatherLoading}
        error={weatherErr}
        onRefresh={() => void refreshWeather(true)}
      />
    ),

    school: (() => {
      const today = schoolLocalDate();
      const focusId =
        currentUser?.role === 'kid'
          ? currentUser.id
          : data.members.find((m) => m.role === 'kid')?.id;
      if (!focusId) {
        return (
          <Card className="!p-4">
            <h2 className="font-semibold text-fg mb-1 flex items-center gap-1.5 text-lg">
              <GraduationCap className="w-4 h-4 text-accent" /> School
            </h2>
            <p className="text-sm text-muted">Add a kid profile to plan school days.</p>
          </Card>
        );
      }
      const blocks = blocksForKidDate(data, focusId, today);
      const state = dayCompletionState(data, focusId, today);
      const streak = data.studyStreaks?.[focusId]?.current ?? 0;
      const pending = (data.studyBlocks || []).filter((b) => b.status === 'pending');
      const openBlocks = blocks.filter((b) => b.status === 'open' || b.status === 'pending');
      return (
        <Card className="!p-4 space-y-2 h-full flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-fg flex items-center gap-1.5 text-lg">
              <GraduationCap className="w-4 h-4 text-accent" />
              School today
            </h2>
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => setView('school')}
            >
              Open
            </button>
          </div>
          {streak > 0 && (
            <p className="text-[11px] text-amber-600 font-medium">{streak}-day school streak</p>
          )}
          {isParent && pending.length > 0 && (
            <p className="text-xs text-accent">{pending.length} waiting for approval</p>
          )}
          {blocks.length === 0 ? (
            <p className="text-sm text-muted flex-1">Nothing scheduled today.</p>
          ) : (
            <ul className="space-y-1.5 flex-1 min-h-0">
              {blocks.slice(0, 5).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 text-sm rounded-lg border border-border px-2 py-1.5 bg-inset/40"
                >
                  <span className={cn('truncate', b.status === 'done' && 'line-through text-muted')}>
                    {b.choicePool ? '◇ ' : ''}
                    {b.title}
                  </span>
                  {b.status === 'open' && (currentUser?.role === 'kid' || isParent) && (
                    <Button
                      size="sm"
                      className="!py-0.5 !px-2 text-xs shrink-0"
                      onClick={() =>
                        currentUser &&
                        update((d) => completeStudyBlock(d, b.id, currentUser.id))
                      }
                    >
                      Done
                    </Button>
                  )}
                  {b.status === 'pending' && (
                    <span className="text-[10px] text-accent shrink-0">Pending</span>
                  )}
                  {b.status === 'done' && (
                    <span className="text-[10px] text-muted shrink-0">✓</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {blocks.length > 0 && (
            <p className="text-[11px] text-muted">
              {state.doneCount}/{state.totalNeeded || blocks.length} toward day complete
              {openBlocks.length === 0 && state.complete ? ' · Day complete!' : ''}
            </p>
          )}
        </Card>
      );
    })(),

    screentimer: rows.some((r) => r.includes('chorequest')) ? (
      <Card className="!p-4 text-sm text-muted">
        Screen timer lives on the <span className="text-fg font-medium">back of ChoreQuest</span>
        — use the <span className="text-fg font-medium">Flip to Timer</span> control on that card.
        Hide this card in homescreen settings if you don&apos;t need the reminder.
      </Card>
    ) : (
      <ScreenTimerCard />
    ),

    look: <ProfileLookCard />,
    pictureframe: (
      <Card className="!p-2 h-full flex flex-col min-h-[14rem]">
        <PictureFrameCard slot={1} />
      </Card>
    ),
    pictureframe2: (
      <Card className="!p-2 h-full flex flex-col min-h-[14rem]">
        <PictureFrameCard slot={2} />
      </Card>
    ),
    lights: isParent ? <LightsCard /> : <Card className="!p-4 text-sm text-muted">Parents only.</Card>,
    books: <ContinueReadingCard />,
    recs: <RecommendationsCard />,
  };

  return (
    <div className="p-3 sm:p-4 lg:p-5 max-w-7xl mx-auto space-y-5">
      {/* Toolbar — date lives in the app header only */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-faint hidden sm:block">
          Drag to arrange · hover shared cards for ⅓/⅔ width · drop between rows for full width
        </p>
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"
            title="Show or hide homescreen cards"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Manage cards
            {myHiddenWidgets.length > 0 && (
              <span className="text-faint">({myHiddenWidgets.length} hidden)</span>
            )}
          </button>
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
      </div>

      {heroOpen && (
        isSpyFamily ? (
          <section className="relative overflow-hidden rounded-3xl border border-hero-border shadow-card">
            <img
              src="/themes/spyfamily-banner.jpg"
              alt=""
              className="w-full h-36 sm:h-44 lg:h-52 object-cover object-[center_20%]"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent pointer-events-none" />
            <button
              type="button"
              onClick={dismissHero}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-white/90 hover:bg-black/30"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 pr-12">
              {announcement ? (
                <p className="text-white/95 text-sm sm:text-base max-w-xl drop-shadow-md">
                  {announcement}
                </p>
              ) : (
                <p className="text-white/90 text-sm drop-shadow-md">
                  Operation Strix is online, {currentUser?.name || 'Family'}.
                </p>
              )}
            </div>
          </section>
        ) : (
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
        )
      )}

      {/* Fixed Home notes — not draggable / not hideable by kids */}
      {homeNotes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted px-1 flex items-center gap-1">
            <Home className="w-3.5 h-3.5" />
            Family notes
          </p>
          {homeNotes.map((n) => {
            const isNotice = n.kind === 'notice';
            const needsAck =
              isNotice &&
              currentUser?.role === 'kid' &&
              !(n.readBy || []).includes(myId);
            return (
              <Card
                key={n.id}
                className={cn(
                  '!p-3 sm:!p-4 border-l-4',
                  isNotice ? 'border-l-amber-500' : 'border-l-accent',
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setViewNote(n)}
                    className="flex-1 min-w-0 space-y-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isNotice && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                          <Megaphone className="w-3 h-3" /> Must-read
                        </span>
                      )}
                      <h3 className="text-sm font-semibold text-fg">{n.title}</h3>
                    </div>
                    {n.kind === 'checklist' ? (
                      <ul className="space-y-0.5">
                        {(n.checklist || []).slice(0, 4).map((c) => (
                          <li
                            key={c.id}
                            className={cn(
                              'text-xs',
                              c.done ? 'line-through text-muted' : 'text-fg',
                            )}
                          >
                            {c.done ? '✓' : '○'} {c.text}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted whitespace-pre-wrap line-clamp-4">
                        {n.content}
                      </p>
                    )}
                    {isParent && isNotice && (
                      <p className="text-[11px] text-faint">
                        Read by {(n.readBy || []).length}/
                        {kids.length} kids
                      </p>
                    )}
                  </button>
                  {needsAck && (
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeHomeNotice(n.id);
                      }}
                    >
                      I read this
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!viewNote} onClose={() => setViewNote(null)} title={viewNote?.title || 'Note'}>
        {viewNote && (
          <div className="space-y-2">
            {viewNote.kind === 'checklist' ? (
              <ul className="space-y-1.5">
                {(viewNote.checklist || []).map((c) => (
                  <li
                    key={c.id}
                    className={cn(
                      'text-sm',
                      c.done ? 'line-through text-muted' : 'text-fg',
                    )}
                  >
                    {c.done ? '✓' : '○'} {c.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg whitespace-pre-wrap">{viewNote.content}</p>
            )}
            {isParent && viewNote.kind === 'notice' && (
              <p className="text-xs text-faint pt-1">
                Read by {(viewNote.readBy || []).length}/{kids.length} kids
              </p>
            )}
          </div>
        )}
      </Modal>

      <div className="space-y-3">
        {/* Top gap — drop here to become the new first row */}
        <div
          className={cn(
            'rounded-lg transition-all',
            dragId
              ? dropHint?.kind === 'gapStart'
                ? 'h-10 my-1 bg-accent/30 ring-2 ring-accent/60'
                : 'h-6 my-0.5 bg-accent/10 border border-dashed border-accent/30'
              : 'h-0',
          )}
          onDragOver={(e) => onGapDragOver(e, { kind: 'gapStart' })}
          onDragEnter={(e) => onGapDragOver(e, { kind: 'gapStart' })}
          onDrop={(e) => onGapDrop(e, { kind: 'gapStart' })}
        />
        {visibleRows.map((row, ri) => (
          <div key={`row-${ri}-${row.join('-')}`}>
            <div
              className={cn(
                'grid gap-3 items-stretch',
                row.length < 2
                  ? 'grid-cols-1'
                  : rowUsesThirds(row, myHomescreenSpans)
                    ? 'grid-cols-1 lg:grid-cols-3'
                    : 'grid-cols-1 lg:grid-cols-2',
              )}
            >
              {row.map((id) => (
                <SectionChrome
                  key={id}
                  id={id}
                  paired={isPaired(rows, id)}
                  dragging={dragId === id}
                  dropSide={
                    dropHint?.kind === 'beside' &&
                    dropHint.targetId === id &&
                    dragId !== id
                      ? dropHint.side
                      : null
                  }
                  widthMode={
                    row.length === 2
                      ? pairWidthMode(row, myHomescreenSpans, id)
                      : 'equal'
                  }
                  onCycleWidth={
                    row.length === 2
                      ? () =>
                          setMyHomescreenSpans(
                            cyclePairWidth(row, myHomescreenSpans, id),
                          )
                      : undefined
                  }
                  onDragStart={onSectionDragStart}
                  onDragOver={onSectionDragOver}
                  onDrop={onSectionDrop}
                  onDragEnd={onSectionDragEnd}
                  onHide={hideWidget}
                  className={cardColSpanClass(row, myHomescreenSpans, id)}
                >
                  {sections[id]}
                </SectionChrome>
              ))}
            </div>
            {/* Gap under this row — insert a solo full-width row after it */}
            <div
              className={cn(
                'rounded-lg transition-all',
                dragId
                  ? dropHint?.kind === 'gapAfter' && dropHint.afterId === row[0]
                    ? 'h-10 my-1 bg-accent/30 ring-2 ring-accent/60'
                    : 'h-6 my-0.5 bg-accent/10 border border-dashed border-accent/30'
                  : 'h-0',
              )}
              onDragOver={(e) =>
                onGapDragOver(e, { kind: 'gapAfter', afterId: row[0]! })
              }
              onDragEnter={(e) =>
                onGapDragOver(e, { kind: 'gapAfter', afterId: row[0]! })
              }
              onDrop={(e) =>
                onGapDrop(e, { kind: 'gapAfter', afterId: row[0]! })
              }
            />
          </div>
        ))}
        {visibleRows.length === 0 && (
          <div className="text-center py-10 text-sm text-muted">
            All cards are hidden.{' '}
            <button type="button" onClick={() => setManageOpen(true)} className="text-accent hover:underline">
              Manage cards
            </button>{' '}
            to bring some back.
          </div>
        )}
      </div>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="Manage cards">
        <div className="space-y-1">
          <p className="text-xs text-muted mb-3">
            Choose which cards show on your homescreen. Hiding a card here doesn't delete anything —
            you can bring it back any time.
          </p>
          {HOMESCREEN_WIDGETS.filter((id) => {
            if (id === 'pictureframe2' && !data.appearance?.[myId]?.unlockPictureFrame2)
              return false;
            if (id === 'lights' && !isParent) return false;
            return true;
          }).map((id) => {
            const hidden = hiddenSet.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => (hidden ? showWidget(id) : hideWidget(id))}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-nav-hover/50 text-left"
              >
                <span className={cn('text-sm', hidden ? 'text-muted' : 'text-fg')}>
                  {SECTION_LABELS[id]}
                </span>
                {hidden ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-faint">
                    <EyeOff className="w-3.5 h-3.5" /> Hidden
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                    <Eye className="w-3.5 h-3.5" /> Showing
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Modal>
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
