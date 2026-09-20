import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Plus, Square, Upload, Users } from 'lucide-react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { uid } from '../lib/uid';
import { expandEvents } from '../lib/recurrence';
import { downloadIcs, exportEventsToIcs, importEventsFromIcs, type ImportResult } from '../lib/ical';
import type { CalendarEvent, ExpandedEvent, Todo } from '../types';
import {
  EVENT_CATEGORY_IDS,
  EVENT_CATEGORY_META,
  eventCategoryOf,
  type EventCategory,
} from '../lib/eventCategories';
import { applyTodoStatus } from '../lib/todoQuest';
import { cn } from '../lib/cn';
import {
  type CalView,
  type FormState,
  VIEW_KEY,
  MEMBER_FILTER_KEY,
  TASKS_KEY,
  loadView,
  loadShowTasks,
  loadMemberFilter,
  localDateStr,
  localTimeStr,
  buildTimes,
  formatEventTimeLabel,
  eventMemberIds,
  eventChipStyle,
  emptyForm,
  eventTitleLabel,
} from './calendar/calendarUtils';
import { MonthView } from './calendar/MonthView';
import { TimeGridView } from './calendar/TimeGridView';

export function CalendarPage() {
  const { data, update, currentUser, getMember, setView: setAppView } = useApp();
  const [cursor, setCursor] = useState(new Date());
  const [view, setViewState] = useState<CalView>(loadView);
  const [showTasks, setShowTasksState] = useState(loadShowTasks);
  const [filterMemberId, setFilterMemberIdState] = useState(loadMemberFilter);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(data.settings.currentUserId));
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [editingInstance, setEditingInstance] = useState<ExpandedEvent | null>(null);
  const [scopePrompt, setScopePrompt] = useState<'edit' | 'delete' | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setView = (v: CalView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const setShowTasks = (on: boolean) => {
    setShowTasksState(on);
    try {
      localStorage.setItem(TASKS_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const setFilterMemberId = (id: string) => {
    setFilterMemberIdState(id);
    try {
      localStorage.setItem(MEMBER_FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const openTodos = data.todos.filter((t) => !t.completed && t.dueAt);
  const tasksOnDay = (day: Date): Todo[] => {
    if (!showTasks) return [];
    return openTodos.filter((t) => {
      if (!isSameDay(new Date(t.dueAt!), day)) return false;
      if (filterMemberId === 'all') return true;
      return t.memberId === filterMemberId;
    });
  };
  const taskExtra = (t: Todo) => {
    if (!t.questId) return '';
    const q = (data.chores || []).find((c) => c.id === t.questId);
    return q ? ` · +${q.xp} XP / +${q.coins}c` : '';
  };

  const toggleTodo = (id: string) => {
    update((d) => {
      const t = d.todos.find((x) => x.id === id);
      if (!t) return d;
      const nextDone = !t.completed;
      return applyTodoStatus(d, id, nextDone ? 'done' : 'todo', {
        actorId: currentUser?.id,
      });
    });
  };

  const handleExport = async () => {
    const result = await exportEventsToIcs(data.events, data.settings.familyName || 'GreenHQ');
    if (result.ok === false) {
      alert(result.error);
      return;
    }
    downloadIcs(result.ics);
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    const result = await importEventsFromIcs(text, data.settings.currentUserId);
    if (result.imported > 0) {
      update((d) => ({ ...d, events: [...d.events, ...result.events] }));
    }
    setImportResult(result);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Close member filter menu on outside click
  useEffect(() => {
    if (!filterMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filterMenuOpen]);

  useEffect(() => {
    const h = () => {
      setForm(emptyForm(data.settings.currentUserId));
      setEditingMasterId(null);
      setEditingInstance(null);
      setShowForm(true);
    };
    window.addEventListener('fcc:quick-add', h);
    return () => window.removeEventListener('fcc:quick-add', h);
  }, [data.settings.currentUserId]);

  // Visible range by view
  const range = useMemo(() => {
    if (view === 'month') {
      const monthStart = startOfMonth(cursor);
      return {
        start: startOfWeek(monthStart),
        end: endOfWeek(endOfMonth(cursor)),
      };
    }
    if (view === 'week') {
      return { start: startOfWeek(cursor), end: endOfWeek(cursor) };
    }
    return { start: startOfDay(cursor), end: endOfDay(cursor) };
  }, [cursor, view]);

  const expanded = useMemo(
    () => expandEvents(data.events, range.start, addDays(range.end, 1)),
    [data.events, range.start.getTime(), range.end.getTime()],
  );

  /** Everyone vs one member (event matches if any assignee is selected). */
  const visibleExpanded = useMemo(() => {
    if (filterMemberId === 'all') return expanded;
    return expanded.filter((ev) => eventMemberIds(ev).includes(filterMemberId));
  }, [expanded, filterMemberId]);

  const daysInRange = useMemo(
    () => eachDayOfInterval({ start: range.start, end: view === 'day' ? range.start : range.end }),
    [range.start.getTime(), range.end.getTime(), view],
  );

  const navLabel = useMemo(() => {
    if (view === 'month') return format(cursor, 'MMMM yyyy');
    if (view === 'week') {
      const a = startOfWeek(cursor);
      const b = endOfWeek(cursor);
      if (a.getMonth() === b.getMonth()) return format(a, 'MMM d') + ' – ' + format(b, 'd, yyyy');
      return format(a, 'MMM d') + ' – ' + format(b, 'MMM d, yyyy');
    }
    return format(cursor, 'EEEE, MMM d, yyyy');
  }, [cursor, view]);

  const navigate = (dir: -1 | 1) => {
    setCursor((c) => {
      if (view === 'month') return addMonths(c, dir);
      if (view === 'week') return addWeeks(c, dir);
      return addDays(c, dir);
    });
  };

  const minsToHHMM = (mins: number) => {
    const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MIN, mins));
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const openNew = (day?: Date, hour?: number, endHour?: number) => {
    setEditingMasterId(null);
    setEditingInstance(null);
    const base = emptyForm(data.settings.currentUserId, day);
    if (hour != null) {
      base.allDay = false;
      const startMins = Math.round(hour * 60);
      const endMins =
        endHour != null ? Math.round(endHour * 60) : startMins + 60;
      base.time = minsToHHMM(Math.min(startMins, endMins));
      base.endTime = minsToHHMM(Math.max(startMins, endMins));
      if (base.endTime <= base.time) {
        base.endTime = minsToHHMM(Math.min(startMins, endMins) + 60);
      }
    }
    setForm(base);
    setShowForm(true);
  };

  /** Create form from a drag range (minutes from midnight). */
  const openNewRange = (day: Date, startMins: number, endMins: number) => {
    const a = Math.min(startMins, endMins);
    const b = Math.max(startMins, endMins);
    openNew(day, a / 60, Math.max(b, a + SNAP_MIN) / 60);
  };

  /** Persist resized / moved times onto the master event (series). */
  const resizeEvent = (ev: ExpandedEvent, newStart: Date, newEnd: Date) => {
    if (newEnd.getTime() <= newStart.getTime()) return;
    update((d) => ({
      ...d,
      events: d.events.map((e) => {
        if (e.id !== ev.masterId) return e;
        return {
          ...e,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          allDay: false,
        };
      }),
    }));
  };

  /** Move an all-day / multi-day event to a new start calendar day (keeps duration). */
  const moveEventToDay = (ev: ExpandedEvent, targetDay: Date) => {
    const master = data.events.find((e) => e.id === ev.masterId);
    if (!master) return;
    const oldStart = new Date(ev.instanceStart);
    const oldEnd = new Date(ev.instanceEnd);
    const durationMs = oldEnd.getTime() - oldStart.getTime();
    if (durationMs <= 0) return;

    // Align to local calendar day of target
    const newStart = new Date(targetDay);
    if (master.allDay) {
      newStart.setHours(12, 0, 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);
      update((d) => ({
        ...d,
        events: d.events.map((e) =>
          e.id === ev.masterId
            ? { ...e, start: newStart.toISOString(), end: newEnd.toISOString() }
            : e,
        ),
      }));
      return;
    }
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    update((d) => ({
      ...d,
      events: d.events.map((e) =>
        e.id === ev.masterId
          ? { ...e, start: newStart.toISOString(), end: newEnd.toISOString(), allDay: false }
          : e,
      ),
    }));
  };

  const openEdit = (ev: ExpandedEvent) => {
    const master = data.events.find((e) => e.id === ev.masterId) || ev;
    const isRecurring = !!(master.recurrence && master.recurrence !== 'none');
    setEditingMasterId(master.id);
    setEditingInstance(ev);

    if (isRecurring) {
      setScopePrompt('edit');
      return;
    }

    fillFormFromEvent(master, ev);
    setShowForm(true);
  };

  const fillFormFromEvent = (master: CalendarEvent, instance?: ExpandedEvent | null) => {
    const s = new Date(instance ? instance.instanceStart : master.start);
    const e = new Date(instance ? instance.instanceEnd : master.end || master.start);
    let endDate = localDateStr(e);
    if (master.allDay) {
      // Exclusive end → last inclusive day is end - 1 day
      const last = addDays(startOfDay(e), -1);
      endDate = localDateStr(last);
    }
    setForm({
      title: master.title,
      allDay: master.allDay,
      memberIds: eventMemberIds(master),
      start: localDateStr(s),
      endDate,
      time: localTimeStr(s),
      endTime: localTimeStr(e),
      recurrence: master.recurrence || 'none',
      recurrenceUntil: master.recurrenceUntil
        ? localDateStr(new Date(master.recurrenceUntil))
        : '',
      linkedNoteId: master.linkedNoteId || '',
      location: master.location || '',
      notes: master.notes || '',
      category: eventCategoryOf(master.category),
    });
  };

  const applyScopeEdit = (scope: 'this' | 'series') => {
    setScopePrompt(null);
    const master = data.events.find((e) => e.id === editingMasterId);
    if (!master || !editingInstance) return;
    if (scope === 'series') {
      fillFormFromEvent(master);
      setShowForm(true);
      return;
    }
    // This instance only: edit as a one-off (will save as exception + new event)
    fillFormFromEvent(master, editingInstance);
    setForm((f) => ({ ...f, recurrence: 'none', recurrenceUntil: '' }));
    setShowForm(true);
  };

  const save = () => {
    if (!form.title.trim()) return;
    const { start, end } = buildTimes(form);
    const payload: Omit<CalendarEvent, 'id'> = {
      title: form.title.trim(),
      start,
      end,
      allDay: form.allDay,
      memberId: (form.memberIds[0] || data.settings.currentUserId),
      memberIds: form.memberIds.length ? form.memberIds : [data.settings.currentUserId],
      recurrence: form.recurrence === 'none' ? undefined : form.recurrence,
      recurrenceUntil:
        form.recurrence !== 'none' && form.recurrenceUntil
          ? new Date(form.recurrenceUntil + 'T23:59:59').toISOString()
          : undefined,
      location: form.location.trim() || undefined,
      notes: form.notes.trim() || undefined,
      category: form.category && form.category !== 'general' ? form.category : undefined,
      linkedNoteId: form.linkedNoteId.trim() || undefined,
    };

    // Editing one instance of a recurring series → exception + new one-off
    if (
      editingMasterId &&
      editingInstance &&
      form.recurrence === 'none' &&
      data.events.find((e) => e.id === editingMasterId)?.recurrence &&
      data.events.find((e) => e.id === editingMasterId)?.recurrence !== 'none'
    ) {
      const exceptionKey = localDateStr(new Date(editingInstance.instanceStart));
      update((d) => ({
        ...d,
        events: [
          ...d.events.map((e) =>
            e.id === editingMasterId
              ? {
                  ...e,
                  exceptionDates: [...new Set([...(e.exceptionDates || []), exceptionKey])],
                }
              : e,
          ),
          { ...payload, id: uid(), recurrence: undefined, recurrenceUntil: undefined },
        ],
      }));
      setShowForm(false);
      setEditingMasterId(null);
      setEditingInstance(null);
      return;
    }

    if (editingMasterId) {
      update((d) => ({
        ...d,
        events: d.events.map((e) =>
          e.id === editingMasterId
            ? {
                ...e,
                ...payload,
                exceptionDates: e.exceptionDates,
              }
            : e,
        ),
      }));
    } else {
      update((d) => ({ ...d, events: [...d.events, { ...payload, id: uid() }] }));
    }
    setShowForm(false);
    setEditingMasterId(null);
    setEditingInstance(null);
  };

  const requestDelete = () => {
    if (!editingMasterId) return;
    const master = data.events.find((e) => e.id === editingMasterId);
    if (master?.recurrence && master.recurrence !== 'none' && editingInstance) {
      setShowForm(false);
      setScopePrompt('delete');
      return;
    }
    removeSeries(editingMasterId);
  };

  const applyScopeDelete = (scope: 'this' | 'series') => {
    setScopePrompt(null);
    if (!editingMasterId) return;
    if (scope === 'series') {
      removeSeries(editingMasterId);
      return;
    }
    if (!editingInstance) return;
    const exceptionKey = localDateStr(new Date(editingInstance.instanceStart));
    update((d) => ({
      ...d,
      events: d.events.map((e) =>
        e.id === editingMasterId
          ? {
              ...e,
              exceptionDates: [...new Set([...(e.exceptionDates || []), exceptionKey])],
            }
          : e,
      ),
    }));
    setEditingMasterId(null);
    setEditingInstance(null);
  };

  const removeSeries = (id: string) => {
    update((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
    setShowForm(false);
    setEditingMasterId(null);
    setEditingInstance(null);
  };

  const memberColor = (memberId: string) => getMember(memberId)?.color || '#6366f1';

  // —— Month multi-day layout helpers ——
  const monthWeeks = useMemo(() => {
    if (view !== 'month') return [] as Date[][];
    const weeks: Date[][] = [];
    for (let i = 0; i < daysInRange.length; i += 7) {
      weeks.push(daysInRange.slice(i, i + 7));
    }
    return weeks;
  }, [daysInRange, view]);

  return (
    <div className="h-full min-h-0 flex flex-col p-2 sm:p-3 lg:p-4 gap-2 w-full max-w-[1600px] mx-auto">
      {/* Header — keep compact so the grid can grow */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-surface-2 shrink-0"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg sm:text-xl font-bold truncate">{navLabel}</h1>
          <button
            type="button"
            onClick={() => navigate(1)}
            className="p-2 rounded-xl hover:bg-surface-2 shrink-0"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <div className="relative ml-1" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => setFilterMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface-2 pl-1 pr-2 py-1 text-sm text-fg hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-accent/40 max-w-[11rem] sm:max-w-[13rem]"
              title="Whose events to show"
              aria-haspopup="listbox"
              aria-expanded={filterMenuOpen}
            >
              {filterMemberId === 'all' ? (
                <span className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5 text-muted" />
                </span>
              ) : (
                <Avatar
                  size="sm"
                  className="!w-7 !h-7 !text-sm"
                  {...(getMember(filterMemberId) || {})}
                />
              )}
              <span className="truncate font-medium">
                {filterMemberId === 'all'
                  ? 'Everyone'
                  : getMember(filterMemberId)?.name || 'Member'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
            </button>
            {filterMenuOpen && (
              <div
                role="listbox"
                className="absolute left-0 top-full z-40 mt-1 min-w-[12rem] max-h-72 overflow-auto rounded-xl border border-border-strong bg-surface-1 shadow-lg py-1"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={filterMemberId === 'all'}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2',
                    filterMemberId === 'all' && 'bg-accent/15 text-accent',
                  )}
                  onClick={() => {
                    setFilterMemberId('all');
                    setFilterMenuOpen(false);
                  }}
                >
                  <span className="w-7 h-7 rounded-full bg-surface-3 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5 text-muted" />
                  </span>
                  Everyone
                </button>
                {data.members
                  .filter((m) => m.role !== 'media')
                  .map((m) => {
                    const look = getMember(m.id) || m;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={filterMemberId === m.id}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2',
                          filterMemberId === m.id && 'bg-accent/15 text-accent',
                        )}
                        onClick={() => {
                          setFilterMemberId(m.id);
                          setFilterMenuOpen(false);
                        }}
                      >
                        <Avatar
                          size="sm"
                          className="!w-7 !h-7 !text-sm"
                          {...look}
                        />
                        <span className="truncate">{look.name}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border-strong overflow-hidden">
            {(['month', 'week', 'day'] as CalView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  view === v
                    ? 'bg-accent text-accent-ink'
                    : 'bg-surface-2 text-fg-secondary hover:bg-surface-3',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTasks(!showTasks)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-xl border transition-colors',
              showTasks
                ? 'border-warn/40 bg-warn-tint text-warn'
                : 'border-border-strong bg-surface-2 text-fg-secondary hover:bg-surface-3',
            )}
            title={showTasks ? 'Hide tasks on calendar' : 'Show tasks on calendar'}
          >
            Tasks {showTasks ? 'on' : 'off'}
          </button>
          <Button size="sm" variant="secondary" onClick={handleExport} title="Export .ics">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            title="Import .ics"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => void handleImportFile(e.target.files?.[0] || null)}
          />
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            weeks={monthWeeks}
            expanded={visibleExpanded}
            tasksOnDay={tasksOnDay}
            taskExtra={taskExtra}
            getMember={getMember}
            memberColor={memberColor}
            onDayClick={(d) => openNew(d)}
            onEventClick={openEdit}
            onToggleTodo={toggleTodo}
            onMoveEventToDay={moveEventToDay}
          />
        )}
        {view === 'week' && (
          <div className="h-full min-h-0 overflow-auto">
            <TimeGridView
              days={daysInRange}
              expanded={visibleExpanded}
              tasksOnDay={tasksOnDay}
              taskExtra={taskExtra}
              getMember={getMember}
              memberColor={memberColor}
              onSlotClick={(d, hour) => openNew(d, hour)}
              onCreateRange={openNewRange}
              onResizeEvent={resizeEvent}
              onEventClick={openEdit}
              onToggleTodo={toggleTodo}
              showDayHeaders
            />
          </div>
        )}
        {view === 'day' && (
          <div className="h-full min-h-0 overflow-auto">
            <TimeGridView
              days={[startOfDay(cursor)]}
              expanded={visibleExpanded}
              tasksOnDay={tasksOnDay}
              taskExtra={taskExtra}
              getMember={getMember}
              memberColor={memberColor}
              onSlotClick={(d, hour) => openNew(d, hour)}
              onCreateRange={openNewRange}
              onResizeEvent={resizeEvent}
              onEventClick={openEdit}
              onToggleTodo={toggleTodo}
              showDayHeaders={false}
            />
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted text-center shrink-0 leading-tight">
        {view === 'month'
          ? 'Drag an event to another day · tap to edit. Multi-day events span across days.'
          : 'Drag events to move · drag edges to resize · drag empty grid to create.'}
      </p>

      {/* Scope: this vs series */}
      <Modal
        open={scopePrompt !== null}
        onClose={() => {
          setScopePrompt(null);
          setEditingMasterId(null);
          setEditingInstance(null);
        }}
        title={scopePrompt === 'delete' ? 'Delete recurring event' : 'Edit recurring event'}
      >
        <p className="text-sm text-muted mb-4">
          This is part of a repeating series. Do you want to change only this occurrence, or the
          entire series?
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              scopePrompt === 'delete' ? applyScopeDelete('this') : applyScopeEdit('this')
            }
          >
            This event only
          </Button>
          <Button
            variant={scopePrompt === 'delete' ? 'danger' : 'primary'}
            onClick={() =>
              scopePrompt === 'delete' ? applyScopeDelete('series') : applyScopeEdit('series')
            }
          >
            Entire series
          </Button>
        </div>
      </Modal>

      {/* Create / edit form */}
      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditingMasterId(null);
          setEditingInstance(null);
        }}
        title={editingMasterId ? 'Edit event' : 'New event'}
        wide
      >
        <div className="space-y-3">
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Event title"
          />
          <div>
            <label className="text-xs text-muted mb-1.5 block">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_CATEGORY_IDS.map((id) => {
                const meta = EVENT_CATEGORY_META[id];
                const on = form.category === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, category: id }))}
                    className={
                      on
                        ? 'px-2.5 py-1 rounded-full text-xs font-medium border border-transparent text-white'
                        : 'px-2.5 py-1 rounded-full text-xs font-medium border border-border text-muted hover:text-fg hover:border-border-strong'
                    }
                    style={on ? { backgroundColor: meta.accent } : undefined}
                  >
                    {meta.emoji} {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
            />
            All day
          </label>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Starts</label>
              <div className={form.allDay ? '' : 'grid grid-cols-[1fr_auto] gap-2'}>
                <Input
                  type="date"
                  value={form.start}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      start: e.target.value,
                      endDate: f.endDate < e.target.value ? e.target.value : f.endDate,
                    }))
                  }
                  className="min-w-0 w-full"
                />
                {!form.allDay && (
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-[7.5rem] shrink-0"
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Ends</label>
              <div className={form.allDay ? '' : 'grid grid-cols-[1fr_auto] gap-2'}>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="min-w-0 w-full"
                />
                {!form.allDay && (
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="w-[7.5rem] shrink-0"
                  />
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1.5 block">Who's involved</label>
            <div className="flex flex-wrap gap-2">
              {data.members
                .filter((m) => m.role !== 'media')
                .map((m) => {
                  const look = getMember(m.id) || m;
                  const checked = form.memberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => {
                          const has = f.memberIds.includes(m.id);
                          // Keep at least one selected
                          if (has && f.memberIds.length === 1) return f;
                          return {
                            ...f,
                            memberIds: has
                              ? f.memberIds.filter((id) => id !== m.id)
                              : [...f.memberIds, m.id],
                          };
                        })
                      }
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm border transition-colors',
                        checked
                          ? 'border-accent bg-accent-tint text-fg'
                          : 'border-border-strong bg-surface text-fg-secondary hover:bg-surface-2',
                      )}
                    >
                      <Avatar
                        size="sm"
                        className="!w-6 !h-6 !text-xs"
                        {...look}
                      />
                      {look.name}
                    </button>
                  );
                })}
            </div>
            <p className="text-[11px] text-faint mt-1">Select one or more people (e.g. both kids at the same activity).</p>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Location (optional)</label>
            <Input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="Where?"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Notes (optional)</label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Details…"
              rows={2}
            />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Linked note (packing / prep)</label>
            <select
              value={form.linkedNoteId}
              onChange={(e) => setForm((f) => ({ ...f, linkedNoteId: e.target.value }))}
              className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="">None</option>
              {data.notes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.kind === 'checklist' ? '☑ ' : ''}
                  {n.title || 'Untitled note'}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => {
                  if (!form.title.trim()) {
                    alert('Add an event title first — it becomes the note title.');
                    return;
                  }
                  const noteId = uid();
                  const now = new Date().toISOString();
                  update((d) => ({
                    ...d,
                    notes: [
                      {
                        id: noteId,
                        title: `Pack: ${form.title.trim()}`,
                        content: '',
                        tags: ['packing', 'calendar'],
                        pinned: false,
                        kind: 'checklist',
                        checklist: [
                          { id: uid(), text: 'Bag / kit', done: false },
                          { id: uid(), text: 'Water bottle', done: false },
                          { id: uid(), text: 'Anything else…', done: false },
                        ],
                        authorId: data.settings.currentUserId,
                        createdAt: now,
                        updatedAt: now,
                      },
                      ...d.notes,
                    ],
                  }));
                  setForm((f) => ({ ...f, linkedNoteId: noteId }));
                }}
              >
                + Create packing checklist
              </button>
              {form.linkedNoteId && (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-fg underline"
                  onClick={() => {
                    // Jump to Notes; selection is by linked id stored on event after save
                    setAppView('notes');
                  }}
                >
                  Open in Notes
                </button>
              )}
            </div>
            {form.linkedNoteId && (() => {
              const note = data.notes.find((n) => n.id === form.linkedNoteId);
              if (!note || note.kind !== 'checklist' || !note.checklist?.length) return null;
              return (
                <ul className="mt-2 space-y-1 rounded-xl border border-border bg-inset/40 p-2">
                  {note.checklist.map((item) => (
                    <li key={item.id}>
                      <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!item.done}
                          onChange={() => {
                            update((d) => ({
                              ...d,
                              notes: d.notes.map((n) =>
                                n.id !== note.id
                                  ? n
                                  : {
                                      ...n,
                                      checklist: (n.checklist || []).map((c) =>
                                        c.id === item.id ? { ...c, done: !c.done } : c,
                                      ),
                                      updatedAt: new Date().toISOString(),
                                    },
                              ),
                            }));
                          }}
                        />
                        <span className={item.done ? 'line-through text-muted' : ''}>
                          {item.text}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <p className="text-[11px] text-faint mt-1">
              Link a note for packing lists or prep — checklist items can be ticked here.
            </p>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Repeat</label>
            <select
              value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
              className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {form.recurrence !== 'none' && (
            <div>
              <label className="text-xs text-muted mb-1 block">Repeat until (optional)</label>
              <Input
                type="date"
                value={form.recurrenceUntil}
                onChange={(e) => setForm((f) => ({ ...f, recurrenceUntil: e.target.value }))}
              />
              <p className="text-[11px] text-faint mt-1">
                Leave blank to keep repeating on the calendar view.
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={save}>
              Save
            </Button>
            {editingMasterId && (
              <Button variant="danger" onClick={requestDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ICS import result */}
      <Modal
        open={importResult !== null}
        onClose={() => setImportResult(null)}
        title="Import calendar"
      >
        {importResult && (
          <div className="space-y-3 text-sm">
            <p>
              Imported <span className="font-semibold text-accent">{importResult.imported}</span> event
              {importResult.imported === 1 ? '' : 's'}
              {importResult.skipped > 0 && (
                <>
                  {' '}
                  · skipped <span className="font-semibold text-warn">{importResult.skipped}</span>
                </>
              )}
              .
            </p>
            {importResult.skipReasons.length > 0 && (
              <ul className="text-xs text-muted space-y-1 max-h-40 overflow-y-auto">
                {importResult.skipReasons.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            )}
            <Button className="w-full" onClick={() => setImportResult(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
