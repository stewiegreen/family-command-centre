import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Square, Upload } from 'lucide-react';
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
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  differenceInCalendarDays,
} from 'date-fns';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { uid } from '../lib/uid';
import { eventOverlapsDay, expandEvents, packOverlapping } from '../lib/recurrence';
import { downloadIcs, exportEventsToIcs, importEventsFromIcs, type ImportResult } from '../lib/ical';
import type { CalendarEvent, ExpandedEvent, Todo } from '../types';
import { applyTodoStatus } from '../lib/todoQuest';
import { cn } from '../lib/cn';

type CalView = 'month' | 'week' | 'day';
const VIEW_KEY = 'fcc-calendar-view';
const TASKS_KEY = 'fcc-calendar-show-tasks';
const HOUR_START = 6;
const HOUR_END = 22;
const HOUR_HEIGHT = 56; // px per hour — room for larger event text
const SNAP_MIN = 15; // drag snap in minutes

function loadView(): CalView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'month' || v === 'week' || v === 'day') return v;
  } catch {
    /* ignore */
  }
  return 'month';
}

function loadShowTasks(): boolean {
  try {
    const v = localStorage.getItem(TASKS_KEY);
    if (v === '0' || v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function localDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function localTimeStr(d: Date): string {
  return format(d, 'HH:mm');
}

/** Build ISO start/end from form fields. All-day: exclusive end = local midnight after end date. */
function buildTimes(form: {
  allDay: boolean;
  start: string;
  endDate: string;
  time: string;
  endTime: string;
}): { start: string; end: string } {
  if (form.allDay) {
    const startLocal = new Date(form.start + 'T12:00:00');
    const endDay = form.endDate || form.start;
    const [y, m, d] = endDay.split('-').map(Number);
    // Exclusive: midnight of the day after the last inclusive day
    const endExclusive = new Date(y, m - 1, d + 1);
    return { start: startLocal.toISOString(), end: endExclusive.toISOString() };
  }
  const start = new Date(form.start + 'T' + form.time);
  const end = new Date((form.endDate || form.start) + 'T' + form.endTime);
  if (end.getTime() <= start.getTime()) {
    end.setTime(start.getTime() + 60 * 60 * 1000);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatEventTimeLabel(ev: ExpandedEvent): string {
  if (ev.allDay) return '';
  return format(new Date(ev.instanceStart), 'H:mm') + ' ';
}

/** Assigned members for an event (supports multi-assignee). */
function eventMemberIds(ev: { memberId: string; memberIds?: string[] }): string[] {
  if (ev.memberIds && ev.memberIds.length > 0) return ev.memberIds;
  return ev.memberId ? [ev.memberId] : [];
}

/** Primary color from first assigned member. */
function primaryMemberColor(
  ev: { memberId: string; memberIds?: string[] },
  memberColor: (id: string) => string,
): string {
  const ids = eventMemberIds(ev);
  return memberColor(ids[0] || ev.memberId);
}

type FormState = {
  title: string;
  allDay: boolean;
  memberIds: string[];
  start: string;
  endDate: string;
  time: string;
  endTime: string;
  recurrence: string;
  recurrenceUntil: string;
  location: string;
  notes: string;
};

function emptyForm(memberId: string, day?: Date): FormState {
  const d = day ? localDateStr(day) : localDateStr(new Date());
  return {
    title: '',
    allDay: true,
    memberIds: memberId ? [memberId] : [],
    start: d,
    endDate: d,
    time: '09:00',
    endTime: '10:00',
    recurrence: 'none',
    recurrenceUntil: '',
    location: '',
    notes: '',
  };
}

export function CalendarPage() {
  const { data, update, currentUser, getMember } = useApp();
  const [cursor, setCursor] = useState(new Date());
  const [view, setViewState] = useState<CalView>(loadView);
  const [showTasks, setShowTasksState] = useState(loadShowTasks);
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

  const openTodos = data.todos.filter((t) => !t.completed && t.dueAt);
  const tasksOnDay = (day: Date): Todo[] => {
    if (!showTasks) return [];
    return openTodos.filter((t) => isSameDay(new Date(t.dueAt!), day));
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
      location: master.location || '',
      notes: master.notes || '',
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
            expanded={expanded}
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
              expanded={expanded}
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
              expanded={expanded}
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
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: look.color || '#6366f1' }}
                      />
                      {look.emoji ? `${look.emoji} ` : ''}
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

/* ——— Month view ——— */

function MonthView({
  cursor,
  weeks,
  expanded,
  tasksOnDay,
  taskExtra,
  getMember,
  memberColor,
  onDayClick,
  onEventClick,
  onToggleTodo,
  onMoveEventToDay,
}: {
  cursor: Date;
  weeks: Date[][];
  expanded: ExpandedEvent[];
  tasksOnDay: (day: Date) => Todo[];
  taskExtra: (t: Todo) => string;
  getMember: (id: string) => { emoji?: string; name: string; color: string } | undefined;
  memberColor: (id: string) => string;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  onToggleTodo: (id: string) => void;
  onMoveEventToDay: (ev: ExpandedEvent, day: Date) => void;
}) {
  return (
    <Card className="!p-1.5 sm:!p-2 h-full min-h-0 flex flex-col overflow-hidden">
      <div className="min-w-0 h-full min-h-0 flex flex-col">
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 shrink-0">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-sm text-muted font-semibold py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div
          className="flex-1 min-h-0 grid gap-0.5 sm:gap-1"
          style={{ gridTemplateRows: `repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))` }}
        >
          {weeks.map((week) => (
            <MonthWeekRow
              key={week[0].toISOString()}
              week={week}
              cursor={cursor}
              expanded={expanded}
              tasksOnDay={tasksOnDay}
              taskExtra={taskExtra}
              getMember={getMember}
              memberColor={memberColor}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
              onToggleTodo={onToggleTodo}
              onMoveEventToDay={onMoveEventToDay}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function MonthWeekRow({
  week,
  cursor,
  expanded,
  tasksOnDay,
  taskExtra,
  getMember,
  memberColor,
  onDayClick,
  onEventClick,
  onToggleTodo,
  onMoveEventToDay,
}: {
  week: Date[];
  cursor: Date;
  expanded: ExpandedEvent[];
  tasksOnDay: (day: Date) => Todo[];
  taskExtra: (t: Todo) => string;
  getMember: (id: string) => { emoji?: string; name: string; color: string } | undefined;
  memberColor: (id: string) => string;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  onToggleTodo: (id: string) => void;
  onMoveEventToDay: (ev: ExpandedEvent, day: Date) => void;
}) {
  // Multi-day / all-day spanning: events that cover more than one calendar day in this week
  const weekStart = startOfDay(week[0]);
  const weekEndExclusive = addDays(startOfDay(week[6]), 1);

  const spanning = expanded.filter((ev) => {
    const s = new Date(ev.instanceStart).getTime();
    const e = new Date(ev.instanceEnd).getTime();
    if (!(s < weekEndExclusive.getTime() && e > weekStart.getTime())) return false;
    const days = differenceInCalendarDays(new Date(ev.instanceEnd), new Date(ev.instanceStart));
    return ev.allDay || days >= 1;
  });

  // Single-day (or timed same-day) chips per day
  const dayLists = week.map((day) =>
    expanded.filter((ev) => {
      if (!eventOverlapsDay(ev, day)) return false;
      const days = differenceInCalendarDays(new Date(ev.instanceEnd), new Date(ev.instanceStart));
      const isSpan = ev.allDay || days >= 1;
      return !isSpan;
    }),
  );

  // Layout spanning bars: assign rows so they don't overlap
  type SpanLayout = { ev: ExpandedEvent; startCol: number; endCol: number; row: number };
  const layouts: SpanLayout[] = [];
  const rowEnds: number[] = []; // endCol exclusive per row

  const sortedSpan = [...spanning].sort(
    (a, b) => new Date(a.instanceStart).getTime() - new Date(b.instanceStart).getTime(),
  );

  for (const ev of sortedSpan) {
    let startCol = 0;
    let endCol = 7;
    for (let i = 0; i < 7; i++) {
      if (eventOverlapsDay(ev, week[i])) {
        startCol = i;
        break;
      }
    }
    for (let i = 6; i >= 0; i--) {
      if (eventOverlapsDay(ev, week[i])) {
        endCol = i + 1;
        break;
      }
    }
    let row = 0;
    while (rowEnds[row] != null && rowEnds[row]! > startCol) row++;
    rowEnds[row] = endCol;
    layouts.push({ ev, startCol, endCol, row });
  }

  const spanRows = Math.max(0, ...layouts.map((l) => l.row + 1), 0);

  return (
    <div className="relative h-full min-h-0">
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 h-full min-h-0">
        {week.map((day, di) => {
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          const list = dayLists[di];
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayClick(day)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const raw = e.dataTransfer.getData('application/x-fcc-event');
                if (!raw) return;
                try {
                  const parsed = JSON.parse(raw) as ExpandedEvent;
                  onMoveEventToDay(parsed, day);
                } catch {
                  /* ignore */
                }
              }}
              className={cn(
                'h-full min-h-0 p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-left transition-colors flex flex-col overflow-hidden',
                inMonth ? 'hover:bg-nav-hover' : 'opacity-40',
                isToday && 'ring-1 ring-accent/50 bg-accent/10',
              )}
            >
              <span className={cn('text-base font-bold leading-none mb-1', isToday ? 'text-accent' : 'text-muted')}>
                {format(day, 'd')}
              </span>
              {/* Spacer for spanning bars */}
              <div style={{ height: spanRows * 22 }} className="shrink-0" />
              <div className="mt-0.5 space-y-1 flex-1 min-h-0">
                {list.slice(0, 3).map((ev) => {
                  const ids = eventMemberIds(ev);
                  const col = primaryMemberColor(ev, memberColor);
                  const names = ids
                    .map((id) => getMember(id))
                    .filter(Boolean)
                    .map((m) => (m ? `${m.emoji || ''} ${m.name}`.trim() : ''))
                    .join(', ');
                  const emojis = ids
                    .map((id) => getMember(id)?.emoji)
                    .filter(Boolean)
                    .join('');
                  return (
                    <div
                      key={ev.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData('application/x-fcc-event', JSON.stringify(ev));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      className="text-xs sm:text-[13px] truncate px-1.5 py-1 rounded-md flex items-center gap-1 leading-snug cursor-grab active:cursor-grabbing font-medium"
                      style={{
                        backgroundColor: col + '48',
                        color: col,
                        borderLeft: `4px solid ${col}`,
                      }}
                      title={(names ? names + ': ' : '') + formatEventTimeLabel(ev) + ev.title}
                    >
                      {emojis && (
                        <span className="shrink-0 text-xs leading-none">{emojis}</span>
                      )}
                      <span className="truncate">
                        {formatEventTimeLabel(ev)}
                        {ev.title}
                        {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
                      </span>
                    </div>
                  );
                })}
                {tasksOnDay(day).slice(0, 2).map((t) => (
                  <div
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTodo(t.id);
                    }}
                    className="text-xs sm:text-[13px] truncate px-1.5 py-1 rounded-md flex items-center gap-1 border border-dashed border-warn/50 bg-warn-tint text-warn leading-snug font-medium"
                    title={`Task: ${t.text}${taskExtra(t)} (tap to complete)`}
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.text}{taskExtra(t)}</span>
                  </div>
                ))}
                {(list.length > 3 || tasksOnDay(day).length > 2) && (
                  <span className="text-xs text-muted pl-1 font-medium">
                    +{Math.max(0, list.length - 3) + Math.max(0, tasksOnDay(day).length - 2)} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {/* Spanning bars overlaid on the week row */}
      {layouts.map(({ ev, startCol, endCol, row }) => {
        const ids = eventMemberIds(ev);
        const col = primaryMemberColor(ev, memberColor);
        const names = ids
          .map((id) => getMember(id))
          .filter(Boolean)
          .map((m) => (m ? `${m.emoji || ''} ${m.name}`.trim() : ''))
          .join(', ');
        const emojis = ids
          .map((id) => getMember(id)?.emoji)
          .filter(Boolean)
          .join('');
        return (
          <div
            key={ev.id + '-span'}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData('application/x-fcc-event', JSON.stringify(ev));
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="absolute pointer-events-auto text-xs sm:text-[13px] truncate px-1.5 rounded-md font-semibold cursor-grab active:cursor-grabbing z-[1] leading-snug"
            style={{
              left: `calc(${(startCol / 7) * 100}% + 2px)`,
              width: `calc(${((endCol - startCol) / 7) * 100}% - 4px)`,
              top: 28 + row * 22,
              height: 20,
              backgroundColor: col + '60',
              color: col,
              borderLeft: `4px solid ${col}`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(ev);
            }}
            title={(names ? names + ': ' : '') + ev.title}
          >
            {emojis ? `${emojis} ` : ''}
            {ev.title}
            {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
          </div>
        );
      })}
    </div>
  );
}

/* ——— Week / Day time grid ——— */

function snapMins(mins: number): number {
  return Math.round(mins / SNAP_MIN) * SNAP_MIN;
}

function yToMins(clientY: number, gridTop: number): number {
  const y = clientY - gridTop;
  const mins = HOUR_START * 60 + (y / HOUR_HEIGHT) * 60;
  return snapMins(Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, mins)));
}

function TimeGridView({
  days,
  expanded,
  tasksOnDay,
  taskExtra,
  getMember,
  memberColor,
  onSlotClick,
  onCreateRange,
  onResizeEvent,
  onEventClick,
  onToggleTodo,
  showDayHeaders,
}: {
  days: Date[];
  expanded: ExpandedEvent[];
  tasksOnDay: (day: Date) => Todo[];
  taskExtra: (t: Todo) => string;
  getMember: (id: string) => { emoji?: string; name: string; color: string } | undefined;
  memberColor: (id: string) => string;
  onSlotClick: (d: Date, hour: number) => void;
  onCreateRange: (day: Date, startMins: number, endMins: number) => void;
  onResizeEvent: (ev: ExpandedEvent, newStart: Date, newEnd: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  onToggleTodo: (id: string) => void;
  showDayHeaders: boolean;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
  const colMinPx = days.length > 1 ? 112 : 0; // wider columns on week view for phones

  const allDayByDay = days.map((day) =>
    expanded.filter((ev) => {
      if (!eventOverlapsDay(ev, day)) return false;
      const spanDays = differenceInCalendarDays(
        new Date(ev.instanceEnd),
        new Date(ev.instanceStart),
      );
      return ev.allDay || spanDays >= 1;
    }),
  );

  const timedByDay = days.map((day) =>
    expanded.filter((ev) => {
      if (!eventOverlapsDay(ev, day)) return false;
      const spanDays = differenceInCalendarDays(
        new Date(ev.instanceEnd),
        new Date(ev.instanceStart),
      );
      return !ev.allDay && spanDays < 1;
    }),
  );

  const packs = timedByDay.map((list) => packOverlapping(list));

  // Drag-create state
  const [draft, setDraft] = useState<null | {
    dayIndex: number;
    startMins: number;
    endMins: number;
  }>(null);
  const dragMode = useRef<'none' | 'create' | 'resize-start' | 'resize-end' | 'move'>('none');
  const moveOffsetMins = useRef(0); // pointer mins - event start mins at grab
  const moveDurationMins = useRef(60);
  const dragEv = useRef<ExpandedEvent | null>(null);
  const resizeDraft = useRef<{ start: Date; end: Date } | null>(null);
  const gridEls = useRef<(HTMLDivElement | null)[]>([]);
  const suppressClick = useRef(false);
  // Local preview overrides while resizing (event id → times)
  const [resizePreview, setResizePreview] = useState<Record<
    string,
    { start: number; end: number }
  >>({});

  const onGridPointerDown = (dayIndex: number, e: ReactPointerEvent) => {
    // Ignore if starting on an event block
    if ((e.target as HTMLElement).closest('[data-event-block]')) return;
    const el = gridEls.current[dayIndex];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const top = el.getBoundingClientRect().top;
    const mins = yToMins(e.clientY, top);
    dragMode.current = 'create';
    suppressClick.current = false;
    setDraft({ dayIndex, startMins: mins, endMins: mins + 60 });
  };

  const onGridPointerMove = (dayIndex: number, e: ReactPointerEvent) => {
    if (dragMode.current === 'none') return;
    const el = gridEls.current[dayIndex];
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const mins = yToMins(e.clientY, top);

    if (dragMode.current === 'create' && draft && draft.dayIndex === dayIndex) {
      if (Math.abs(mins - draft.startMins) >= SNAP_MIN) suppressClick.current = true;
      setDraft({ ...draft, endMins: mins });
      return;
    }

    if (dragMode.current === 'move' && dragEv.current) {
      suppressClick.current = true;
      const ev = dragEv.current;
      // Resolve day column under pointer (allows cross-day moves in week view)
      let di = dayIndex;
      for (let i = 0; i < gridEls.current.length; i++) {
        const cell = gridEls.current[i];
        if (!cell) continue;
        const r = cell.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right) {
          di = i;
          break;
        }
      }
      const day = days[di] || days[dayIndex];
      const cell = gridEls.current[di] || gridEls.current[dayIndex];
      const top = cell?.getBoundingClientRect().top ?? e.clientY;
      const minsHere = yToMins(e.clientY, top);
      let startMins = minsHere - moveOffsetMins.current;
      startMins = snapMins(Math.max(HOUR_START * 60, Math.min(HOUR_END * 60 - SNAP_MIN, startMins)));
      const dur = moveDurationMins.current;
      let endMins = startMins + dur;
      if (endMins > HOUR_END * 60) {
        endMins = HOUR_END * 60;
        startMins = Math.max(HOUR_START * 60, endMins - dur);
      }
      const s = new Date(day);
      s.setHours(0, 0, 0, 0);
      s.setMinutes(startMins);
      const en = new Date(day);
      en.setHours(0, 0, 0, 0);
      en.setMinutes(endMins);
      resizeDraft.current = { start: s, end: en };
      setResizePreview((prev) => ({
        ...prev,
        [ev.id]: { start: s.getTime(), end: en.getTime() },
      }));
      return;
    }

    if (
      (dragMode.current === 'resize-start' || dragMode.current === 'resize-end') &&
      dragEv.current
    ) {
      suppressClick.current = true;
      const ev = dragEv.current;
      const baseStart = resizeDraft.current?.start ?? new Date(ev.instanceStart);
      const baseEnd = resizeDraft.current?.end ?? new Date(ev.instanceEnd);
      const day = days[dayIndex];
      const next = new Date(day);
      next.setHours(0, 0, 0, 0);
      next.setMinutes(mins);
      let s = baseStart;
      let en = baseEnd;
      if (dragMode.current === 'resize-end') {
        if (next.getTime() > s.getTime() + SNAP_MIN * 60_000) en = next;
      } else {
        if (en.getTime() > next.getTime() + SNAP_MIN * 60_000) s = next;
      }
      resizeDraft.current = { start: s, end: en };
      setResizePreview((prev) => ({
        ...prev,
        [ev.id]: { start: s.getTime(), end: en.getTime() },
      }));
    }
  };

  const onGridPointerUp = (dayIndex: number, e: ReactPointerEvent) => {
    const mode = dragMode.current;
    dragMode.current = 'none';
    const el = gridEls.current[dayIndex];
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (mode === 'create' && draft && draft.dayIndex === dayIndex) {
      const a = Math.min(draft.startMins, draft.endMins);
      const b = Math.max(draft.startMins, draft.endMins);
      const end = b - a < SNAP_MIN ? a + 60 : b;
      setDraft(null);
      if (suppressClick.current || end - a >= 30) {
        onCreateRange(days[dayIndex], a, end);
      } else {
        // Treat as click → 1 hour slot
        onSlotClick(days[dayIndex], Math.floor(a / 60));
      }
      return;
    }

    if (
      (mode === 'resize-start' || mode === 'resize-end' || mode === 'move') &&
      dragEv.current &&
      resizeDraft.current
    ) {
      onResizeEvent(dragEv.current, resizeDraft.current.start, resizeDraft.current.end);
    }
    setDraft(null);
    setResizePreview({});
    dragEv.current = null;
    resizeDraft.current = null;
  };

  const startResize = (
    ev: ExpandedEvent,
    edge: 'start' | 'end',
    dayIndex: number,
    e: ReactPointerEvent,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const el = gridEls.current[dayIndex];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragMode.current = edge === 'start' ? 'resize-start' : 'resize-end';
    dragEv.current = ev;
    resizeDraft.current = {
      start: new Date(ev.instanceStart),
      end: new Date(ev.instanceEnd),
    };
    suppressClick.current = true;
  };

  const startMove = (ev: ExpandedEvent, dayIndex: number, e: ReactPointerEvent) => {
    // Don't start move from resize handles
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
    e.stopPropagation();
    e.preventDefault();
    const el = gridEls.current[dayIndex];
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const top = el.getBoundingClientRect().top;
    const pointerMins = yToMins(e.clientY, top);
    const s = new Date(ev.instanceStart);
    const en = new Date(ev.instanceEnd);
    const startMins = s.getHours() * 60 + s.getMinutes();
    const endMins = en.getHours() * 60 + en.getMinutes();
    dragMode.current = 'move';
    dragEv.current = ev;
    moveOffsetMins.current = pointerMins - startMins;
    moveDurationMins.current = Math.max(SNAP_MIN, endMins - startMins);
    resizeDraft.current = { start: s, end: en };
    suppressClick.current = false; // only suppress after actual movement
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto -mx-0 touch-pan-x">
        <div
          className="min-w-full"
          style={{
            minWidth: days.length > 1 ? days.length * colMinPx + 52 : undefined,
          }}
        >
          {/* Day headers */}
          {showDayHeaders && (
            <div
              className="grid border-b border-border sticky top-0 bg-surface z-10"
              style={{
                gridTemplateColumns: `56px repeat(${days.length}, minmax(${colMinPx}px, 1fr))`,
              }}
            >
              <div />
              {days.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'text-center py-2.5 text-sm font-semibold min-w-0',
                      isToday ? 'text-accent' : 'text-muted',
                    )}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div
                      className={cn(
                        'inline-flex items-center justify-center w-9 h-9 rounded-full text-base font-bold',
                        isToday && 'bg-accent text-accent-ink',
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* All-day strip */}
          <div
            className="grid border-b border-border bg-surface-2/40"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(${colMinPx}px, 1fr))`,
            }}
          >
            <div className="text-xs text-muted p-1.5 text-right pr-2 pt-2 leading-tight font-medium">
              All
              <br />
              day
            </div>
            {days.map((day, di) => (
              <div
                key={day.toISOString()}
                className="min-h-[2.25rem] p-0.5 space-y-0.5 border-l border-border"
              >
                {allDayByDay[di].map((ev) => {
                  const ids = eventMemberIds(ev);
                  const col = primaryMemberColor(ev, memberColor);
                  const emojis = ids
                    .map((id) => getMember(id)?.emoji)
                    .filter(Boolean)
                    .join('');
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onEventClick(ev)}
                      className="w-full text-left text-sm truncate px-2 py-1.5 rounded-md min-h-[32px] font-medium"
                      style={{
                        backgroundColor: col + '48',
                        color: col,
                        borderLeft: `4px solid ${col}`,
                      }}
                      title={ev.title}
                    >
                      {emojis ? `${emojis} ` : ''}
                      {ev.title}
                    </button>
                  );
                })}
                {tasksOnDay(day).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onToggleTodo(t.id)}
                    className="w-full text-left text-sm truncate px-2 py-1.5 rounded-md flex items-center gap-1 border border-dashed border-warn/50 bg-warn-tint text-warn min-h-[32px] font-medium"
                    title={`Task: ${t.text}${taskExtra(t)} (tap to complete)`}
                  >
                    <Square className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t.text}{taskExtra(t)}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Timed grid */}
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(${colMinPx}px, 1fr))`,
              height: gridHeight,
            }}
          >
            <div className="relative select-none">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-0 text-xs text-muted pr-1.5 -translate-y-1/2 font-medium"
                  style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                >
                  {format(new Date(2000, 0, 1, h), 'h a')}
                </div>
              ))}
            </div>

            {days.map((day, di) => {
              const pack = packs[di];
              const list = timedByDay[di];
              const isDraftHere = draft?.dayIndex === di;
              return (
                <div
                  key={day.toISOString()}
                  ref={(el) => {
                    gridEls.current[di] = el;
                  }}
                  className="relative border-l border-border touch-none select-none"
                  style={{ height: gridHeight }}
                  onPointerDown={(e) => onGridPointerDown(di, e)}
                  onPointerMove={(e) => onGridPointerMove(di, e)}
                  onPointerUp={(e) => onGridPointerUp(di, e)}
                  onPointerCancel={() => {
                    dragMode.current = 'none';
                    setDraft(null);
                    dragEv.current = null;
                  }}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-border/60 pointer-events-none"
                      style={{ top: (h - HOUR_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Drag-create preview */}
                  {isDraftHere && draft && (
                    <div
                      className="absolute left-1 right-1 rounded-md bg-accent/30 border border-accent/50 pointer-events-none z-[2]"
                      style={{
                        top:
                          ((Math.min(draft.startMins, draft.endMins) - HOUR_START * 60) / 60) *
                          HOUR_HEIGHT,
                        height: Math.max(
                          8,
                          (Math.abs(draft.endMins - draft.startMins) / 60) * HOUR_HEIGHT,
                        ),
                      }}
                    />
                  )}

                  {list.map((ev) => {
                    const preview = resizePreview[ev.id];
                    const s = new Date(preview?.start ?? ev.instanceStart);
                    const e = new Date(preview?.end ?? ev.instanceEnd);
                    const startMin = s.getHours() * 60 + s.getMinutes();
                    const endMin = e.getHours() * 60 + e.getMinutes();
                    const gridStart = HOUR_START * 60;
                    const gridEnd = HOUR_END * 60;
                    const clampedStart = Math.max(startMin, gridStart);
                    const clampedEnd = Math.min(endMin, gridEnd);
                    if (clampedEnd <= clampedStart) return null;
                    const top = ((clampedStart - gridStart) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      22,
                      ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 2,
                    );
                    const layout = pack.get(ev.id) || { column: 0, columnCount: 1 };
                    const widthPct = 100 / layout.columnCount;
                    const leftPct = layout.column * widthPct;
                    const ids = eventMemberIds(ev);
                    const col = primaryMemberColor(ev, memberColor);
                    const emojis = ids
                      .map((id) => getMember(id)?.emoji)
                      .filter(Boolean)
                      .join('');
                    return (
                      <div
                        key={ev.id}
                        data-event-block
                        className="absolute z-[1] text-left text-sm rounded-md overflow-hidden border border-black/10 group cursor-grab active:cursor-grabbing"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: col + '60',
                          color: col,
                          borderLeft: `4px solid ${col}`,
                        }}
                        onPointerDown={(pe) => startMove(ev, di, pe)}
                      >
                        {/* Resize handles */}
                        <div
                          data-resize-handle
                          className="absolute left-0 right-0 top-0 h-3 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100 bg-gradient-to-b from-black/15 to-transparent z-[2]"
                          onPointerDown={(pe) => startResize(ev, 'start', di, pe)}
                          title="Drag to change start"
                        />
                        <button
                          type="button"
                          className="w-full h-full text-left px-1.5 py-1 overflow-hidden pointer-events-none"
                          title={`${format(s, 'H:mm')}–${format(e, 'H:mm')} ${ev.title}`}
                        >
                          <div className="font-semibold truncate leading-snug text-sm">
                            {emojis ? `${emojis} ` : ''}
                            {ev.title}
                          </div>
                          {height > 30 && (
                            <div className="text-[11px] opacity-90 truncate font-medium">
                              {format(s, 'H:mm')}–{format(e, 'H:mm')}
                            </div>
                          )}
                        </button>
                        {/* Click target: open edit if we didn't actually drag */}
                        <div
                          className="absolute inset-0 z-[1]"
                          onClick={(ce) => {
                            ce.stopPropagation();
                            if (suppressClick.current) {
                              suppressClick.current = false;
                              return;
                            }
                            onEventClick(ev);
                          }}
                        />
                        <div
                          data-resize-handle
                          className="absolute left-0 right-0 bottom-0 h-3 cursor-ns-resize touch-none opacity-0 group-hover:opacity-100 sm:opacity-70 bg-gradient-to-t from-black/15 to-transparent z-[2]"
                          onPointerDown={(pe) => startResize(ev, 'end', di, pe)}
                          title="Drag to change end"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-xs text-faint text-center py-2 px-2 border-t border-border">
        Drag events to move · edges to resize · empty grid to create
      </p>
    </Card>
  );
}
