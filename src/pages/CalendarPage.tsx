import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { uid } from '../lib/uid';
import { expandEvents } from '../lib/recurrence';
import type { ExpandedEvent } from '../types';

export function CalendarPage() {
  const { data, update, getMember } = useApp();
  const [cursor, setCursor] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    allDay: true,
    memberId: data.settings.currentUserId,
    start: new Date().toISOString().slice(0, 10),
    time: '09:00',
    recurrence: 'none',
    recurrenceUntil: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const h = () => {
      setForm({
        title: '',
        allDay: true,
        memberId: data.settings.currentUserId,
        start: new Date().toISOString().slice(0, 10),
        time: '09:00',
        recurrence: 'none',
        recurrenceUntil: '',
      });
      setEditingId(null);
      setShowForm(true);
    };
    window.addEventListener('fcc:quick-add', h);
    return () => window.removeEventListener('fcc:quick-add', h);
  }, [data.settings.currentUserId]);

  const monthStart = startOfMonth(cursor);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Pre-expand for the visible month (+ padding) once per cursor/events change
  const expandedMonth = useMemo(
    () => expandEvents(data.events, calendarStart, calendarEnd),
    [data.events, calendarStart.getTime(), calendarEnd.getTime()],
  );

  const dayEvents = (day: Date) =>
    expandedMonth.filter((e) => isSameDay(new Date(e.instanceStart), day));

  const save = () => {
    if (!form.title.trim()) return;
    const start = form.allDay
      ? new Date(form.start + 'T12:00:00')
      : new Date(form.start + 'T' + form.time);
    const payload = {
      title: form.title.trim(),
      start: start.toISOString(),
      allDay: form.allDay,
      memberId: form.memberId,
      recurrence: form.recurrence === 'none' ? undefined : form.recurrence,
      recurrenceUntil:
        form.recurrence !== 'none' && form.recurrenceUntil
          ? new Date(form.recurrenceUntil + 'T23:59:59').toISOString()
          : undefined,
    };
    if (editingId) {
      update((d) => ({
        ...d,
        events: d.events.map((e) => (e.id === editingId ? { ...e, ...payload } : e)),
      }));
    } else {
      update((d) => ({ ...d, events: [...d.events, { ...payload, id: uid() }] }));
    }
    setShowForm(false);
  };

  const edit = (ev: ExpandedEvent) => {
    // Always edit the master series
    const master = data.events.find((e) => e.id === ev.masterId) || ev;
    const d = new Date(master.start);
    setEditingId(master.id);
    setForm({
      title: master.title,
      allDay: master.allDay,
      memberId: master.memberId,
      start: d.toISOString().slice(0, 10),
      time: d.toTimeString().slice(0, 5),
      recurrence: master.recurrence || 'none',
      recurrenceUntil: master.recurrenceUntil
        ? new Date(master.recurrenceUntil).toISOString().slice(0, 10)
        : '',
    });
    setShowForm(true);
  };

  const remove = (id: string) => {
    update((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }));
    setShowForm(false);
  };

  const openNew = (day?: Date) => {
    setEditingId(null);
    setForm({
      title: '',
      allDay: true,
      memberId: data.settings.currentUserId,
      start: day ? format(day, 'yyyy-MM-dd') : new Date().toISOString().slice(0, 10),
      time: '09:00',
      recurrence: 'none',
      recurrenceUntil: '',
    });
    setShowForm(true);
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setCursor((c) => addMonths(c, -1))} className="p-2 rounded-xl hover:bg-surface-2">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">{format(cursor, 'MMMM yyyy')}</h1>
          <button type="button" onClick={() => setCursor((c) => addMonths(c, 1))} className="p-2 rounded-xl hover:bg-surface-2">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <Button size="sm" onClick={() => openNew()}>
          <Plus className="w-4 h-4" /> Add
        </Button>
      </div>

      <Card className="!p-2 sm:!p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-[10px] sm:text-xs text-muted font-medium py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, new Date());
            const list = dayEvents(day);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => openNew(day)}
                className={`min-h-[3.5rem] sm:min-h-[4.5rem] p-1 rounded-xl text-left transition-colors ${
                  inMonth ? 'hover:bg-nav-hover' : 'opacity-40'
                } ${isToday ? 'ring-1 ring-accent/50 bg-accent/10' : ''}`}
              >
                <span className={`text-xs font-medium ${isToday ? 'text-accent' : 'text-muted'}`}>
                  {format(day, 'd')}
                </span>
                <div className="mt-0.5 space-y-0.5">
                  {list.slice(0, 2).map((ev) => {
                    const m = getMember(ev.memberId);
                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          edit(ev);
                        }}
                        className="text-[9px] sm:text-[10px] truncate px-1 rounded"
                        style={{ backgroundColor: (m?.color || '#6366f1') + '33', color: m?.color || '#a5b4fc' }}
                        title={ev.recurrence && ev.recurrence !== 'none' ? `Repeats ${ev.recurrence}` : undefined}
                      >
                        {ev.title}
                        {ev.recurrence && ev.recurrence !== 'none' ? ' ↻' : ''}
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
      </Card>

      <p className="text-xs text-muted text-center">
        Repeating events expand on the calendar (daily / weekly / monthly). Edit any instance to change the whole series.
      </p>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editingId ? 'Edit event' : 'New event'}>
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
          <div className="flex gap-2">
            <Input
              type="date"
              value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
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
          <select
            value={form.memberId}
            onChange={(e) => setForm((f) => ({ ...f, memberId: e.target.value }))}
            className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2.5 text-sm"
          >
            {data.members
              .filter((m) => m.role !== 'media')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
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
              <p className="text-[11px] text-faint mt-1">Leave blank to keep repeating on the calendar view.</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={save}>
              Save
            </Button>
            {editingId && (
              <Button variant="danger" onClick={() => remove(editingId)}>
                Delete series
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
