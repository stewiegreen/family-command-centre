import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
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
import type { CalendarEvent, ExpandedEvent } from '../types';
import { cn } from '../lib/cn';

type CalView = 'month' | 'week' | 'day';
const VIEW_KEY = 'fcc-calendar-view';
const HOUR_START = 6;
const HOUR_END = 22;
const HOUR_HEIGHT = 48; // px per hour

function loadView(): CalView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'month' || v === 'week' || v === 'day') return v;
  } catch {
    /* ignore */
  }
  return 'month';
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

type FormState = {
  title: string;
  allDay: boolean;
  memberId: string;
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
    memberId,
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
  const { data, update, getMember } = useApp();
  const [cursor, setCursor] = useState(new Date());
  const [view, setViewState] = useState<CalView>(loadView);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(data.settings.currentUserId));
  const [editingMasterId, setEditingMasterId] = useState<string | null>(null);
  const [editingInstance, setEditingInstance] = useState<ExpandedEvent | null>(null);
  const [scopePrompt, setScopePrompt] = useState<'edit' | 'delete' | null>(null);

  const setView = (v: CalView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
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

  const openNew = (day?: Date, hour?: number) => {
    setEditingMasterId(null);
    setEditingInstance(null);
    const base = emptyForm(data.settings.currentUserId, day);
    if (hour != null) {
      base.allDay = false;
      const t = `${String(hour).padStart(2, '0')}:00`;
      const t2 = `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`;
      base.time = t;
      base.endTime = t2;
    }
    setForm(base);
    setShowForm(true);
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
      memberId: master.memberId,
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
      memberId: form.memberId,
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
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </div>

      {view === 'month' && (
        <MonthView
          cursor={cursor}
          weeks={monthWeeks}
          expanded={expanded}
          getMember={getMember}
          memberColor={memberColor}
          onDayClick={(d) => openNew(d)}
          onEventClick={openEdit}
        />
      )}

      {view === 'week' && (
        <TimeGridView
          days={daysInRange}
          expanded={expanded}
          getMember={getMember}
          memberColor={memberColor}
          onSlotClick={(d, hour) => openNew(d, hour)}
          onEventClick={openEdit}
          showDayHeaders
        />
      )}

      {view === 'day' && (
        <TimeGridView
          days={[startOfDay(cursor)]}
          expanded={expanded}
          getMember={getMember}
          memberColor={memberColor}
          onSlotClick={(d, hour) => openNew(d, hour)}
          onEventClick={openEdit}
          showDayHeaders={false}
        />
      )}

      <p className="text-xs text-muted text-center">
        {view === 'month'
          ? 'Tap a day to add · tap an event to edit. Multi-day events span across days.'
          : 'Timed events sit on the timeline · all-day events are in the top strip.'}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted mb-1 block">Starts</label>
              <div className="flex gap-2">
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
                  className="flex-1"
                />
                {!form.allDay && (
                  <Input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Ends</label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="flex-1"
                />
                {!form.allDay && (
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                )}
              </div>
            </div>
          </div>
          <select
            value={form.memberId}
            onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
            className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2.5 text-sm"
          >
            {data.members
              .filter((m) => m.role !== 'media')
              .map((m) => {
                const look = getMember(m.id) || m;
                return (
                  <option key={m.id} value={m.id}>
                    {look.emoji ? `${look.emoji} ` : ''}
                    {look.name}
                  </option>
                );
              })}
          </select>
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
    </div>
  );
}

/* ——— Month view ——— */

function MonthView({
  cursor,
  weeks,
  expanded,
  getMember,
  memberColor,
  onDayClick,
  onEventClick,
}: {
  cursor: Date;
  weeks: Date[][];
  expanded: ExpandedEvent[];
  getMember: (id: string) => { emoji?: string; name: string; color: string } | undefined;
  memberColor: (id: string) => string;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
}) {
  return (
    <Card className="!p-2 sm:!p-4 overflow-x-auto">
      <div className="min-w-[280px]">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-[10px] sm:text-xs text-muted font-medium py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          {weeks.map((week) => (
            <MonthWeekRow
              key={week[0].toISOString()}
              week={week}
              cursor={cursor}
              expanded={expanded}
              getMember={getMember}
              memberColor={memberColor}
              onDayClick={onDayClick}
              onEventClick={onEventClick}
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
  getMember,
  memberColor,
  onDayClick,
  onEventClick,
}: {
  week: Date[];
  cursor: Date;
  expanded: ExpandedEvent[];
  getMember: (id: string) => { emoji?: string; name: string; color: string } | undefined;
  memberColor: (id: string) => string;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: ExpandedEvent) => void;
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
    <div className="relative">
      <div className="grid grid-cols-7 gap-1">
        {week.map((day, di) => {
          const inMonth = isSameMonth(day, cursor);
          const isToday = isSameDay(day, new Date());
          const list = dayLists[di];
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[4.5rem] sm:min-h-[5.5rem] p-1 rounded-xl text-left transition-colors flex flex-col',
                inMonth ? 'hover:bg-nav-hover' : 'opacity-40',
                isToday && 'ring-1 ring-accent/50 bg-accent/10',
              )}
            >
              <span className={cn('text-xs font-medium', isToday ? 'text-accent' : 'text-muted')}>
                {format(day, 'd')}
              </span>
              {/* Spacer for spanning bars */}
              <div style={{ height: spanRows * 16 }} className="shrink-0" />
              <div className="mt-0.5 space-y-0.5 flex-1 min-h-0">
                {list.slice(0, 2).map((ev) => {
                  const m = getMember(ev.memberId);
                  const col = memberColor(ev.memberId);
                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      className="text-[9px] sm:text-[10px] truncate px-1 rounded flex items-center gap-0.5"
                      style={{
                        backgroundColor: col + '40',
                        color: col,
                        borderLeft: `3px solid ${col}`,
                      }}
                      title={
                        (m ? `${m.emoji || ''} ${m.name}: ` : '') +
                        formatEventTimeLabel(ev) +
                        ev.title
                      }
                    >
                      {m?.emoji && (
                        <span className="shrink-0 text-[11px] leading-none">{m.emoji}</span>
                      )}
                      <span className="truncate">
                        {formatEventTimeLabel(ev)}
                        {ev.title}
                        {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
                      </span>
                    </div>
                  );
                })}
                {list.length > 2 && (
                  <span className="text-[9px] text-muted pl-1">+{list.length - 2}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {/* Spanning bars overlaid on the week row */}
      {layouts.map(({ ev, startCol, endCol, row }) => {
        const col = memberColor(ev.memberId);
        const m = getMember(ev.memberId);
        return (
          <div
            key={ev.id + '-span'}
            className="absolute pointer-events-auto text-[9px] sm:text-[10px] truncate px-1.5 rounded-md font-medium cursor-pointer z-[1]"
            style={{
              left: `calc(${(startCol / 7) * 100}% + 2px)`,
              width: `calc(${((endCol - startCol) / 7) * 100}% - 4px)`,
              top: 22 + row * 16,
              height: 14,
              backgroundColor: col + '55',
              color: col,
              borderLeft: `3px solid ${col}`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEventClick(ev);
            }}
            title={(m ? `${m.emoji || ''} ${m.name}: ` : '') + ev.title}
          >
            {m?.emoji ? `${m.emoji} ` : ''}
            {ev.title}
            {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
          </div>
        );
      })}
    </div>
  );
}

/* ——— Week / Day time grid ——— */

function TimeGridView({
  days,
  expanded,
  getMember,
  memberColor,
  onSlotClick,
  onEventClick,
  showDayHeaders,
}: {
  days: Date[];
  expanded: ExpandedEvent[];
  getMember: (id: string) => { emoji?: string; name: string; color: string } | undefined;
  memberColor: (id: string) => string;
  onSlotClick: (d: Date, hour: number) => void;
  onEventClick: (ev: ExpandedEvent) => void;
  showDayHeaders: boolean;
}) {
  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const gridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

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

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="min-w-full"
          style={{ minWidth: days.length > 1 ? days.length * 100 + 56 : undefined }}
        >
          {/* Day headers */}
          {showDayHeaders && (
            <div
              className="grid border-b border-border sticky top-0 bg-surface z-10"
              style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div />
              {days.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'text-center py-2 text-xs sm:text-sm font-medium',
                      isToday ? 'text-accent' : 'text-muted',
                    )}
                  >
                    <div>{format(day, 'EEE')}</div>
                    <div
                      className={cn(
                        'inline-flex items-center justify-center w-7 h-7 rounded-full text-sm',
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
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            <div className="text-[10px] text-muted p-1 text-right pr-2 pt-2">All day</div>
            {days.map((day, di) => (
              <div
                key={day.toISOString()}
                className="min-h-[2rem] p-0.5 space-y-0.5 border-l border-border"
              >
                {allDayByDay[di].map((ev) => {
                  const col = memberColor(ev.memberId);
                  const m = getMember(ev.memberId);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onEventClick(ev)}
                      className="w-full text-left text-[10px] truncate px-1 py-0.5 rounded"
                      style={{
                        backgroundColor: col + '40',
                        color: col,
                        borderLeft: `3px solid ${col}`,
                      }}
                      title={ev.title}
                    >
                      {m?.emoji ? `${m.emoji} ` : ''}
                      {ev.title}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Timed grid */}
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`,
              height: gridHeight,
            }}
          >
            {/* Time labels + hour lines */}
            <div className="relative">
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-0 text-[10px] text-muted pr-2 -translate-y-1/2"
                  style={{ top: (h - HOUR_START) * HOUR_HEIGHT }}
                >
                  {format(new Date(2000, 0, 1, h), 'h a')}
                </div>
              ))}
            </div>

            {days.map((day, di) => {
              const pack = packs[di];
              const list = timedByDay[di];
              return (
                <div
                  key={day.toISOString()}
                  className="relative border-l border-border"
                  style={{ height: gridHeight }}
                >
                  {hours.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="absolute left-0 right-0 border-t border-border/60 hover:bg-nav-hover/50"
                      style={{ top: (h - HOUR_START) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onClick={() => onSlotClick(day, h)}
                      aria-label={`Add event at ${h}:00`}
                    />
                  ))}
                  {list.map((ev) => {
                    const s = new Date(ev.instanceStart);
                    const e = new Date(ev.instanceEnd);
                    const startMin = s.getHours() * 60 + s.getMinutes();
                    const endMin = e.getHours() * 60 + e.getMinutes();
                    const gridStart = HOUR_START * 60;
                    const gridEnd = HOUR_END * 60;
                    const clampedStart = Math.max(startMin, gridStart);
                    const clampedEnd = Math.min(endMin, gridEnd);
                    if (clampedEnd <= clampedStart) return null;
                    const top = ((clampedStart - gridStart) / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      18,
                      ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 2,
                    );
                    const layout = pack.get(ev.id) || { column: 0, columnCount: 1 };
                    const widthPct = 100 / layout.columnCount;
                    const leftPct = layout.column * widthPct;
                    const col = memberColor(ev.memberId);
                    const m = getMember(ev.memberId);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(ev);
                        }}
                        className="absolute z-[1] text-left text-[10px] sm:text-[11px] px-1 py-0.5 rounded-md overflow-hidden border border-black/10"
                        style={{
                          top,
                          height,
                          left: `calc(${leftPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
                          backgroundColor: col + '55',
                          color: col,
                          borderLeft: `3px solid ${col}`,
                        }}
                        title={`${format(s, 'H:mm')}–${format(e, 'H:mm')} ${ev.title}`}
                      >
                        <div className="font-medium truncate leading-tight">
                          {m?.emoji ? `${m.emoji} ` : ''}
                          {ev.title}
                        </div>
                        {height > 28 && (
                          <div className="text-[9px] opacity-80 truncate">
                            {format(s, 'H:mm')}–{format(e, 'H:mm')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
