/**
 * Homescreen "Today's Tasks" (or other focus day) widget.
 */
import { useMemo, useState } from 'react';
import { Calendar, CheckSquare, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../lib/cn';
import type { Todo } from '../../types';

export function TodosHomeCard({
  todos,
  myId,
  onToggleTodo,
  onAddTodo,
  onOpenTodos,
}: {
  todos: Todo[];
  myId: string;
  onToggleTodo: (id: string) => void;
  onAddTodo: (text: string) => void;
  onOpenTodos: () => void;
}) {
  const [dayOffset, setDayOffset] = useState(0);
  const [draft, setDraft] = useState('');

  const focusDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  const focusLabel = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (focusDate.getTime() === today.getTime()) return "Today's Tasks";
    const tmr = new Date(today);
    tmr.setDate(tmr.getDate() + 1);
    if (focusDate.getTime() === tmr.getTime()) return "Tomorrow's Tasks";
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    if (focusDate.getTime() === yest.getTime()) return "Yesterday's Tasks";
    return focusDate.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [focusDate]);

  const dayTasks = useMemo(() => {
    const start = focusDate.getTime();
    const end = start + 86400000;
    const isToday = dayOffset === 0;
    const list = todos.filter((t) => {
      if (t.memberId !== myId) return false;
      if (t.dueAt) {
        const ts = new Date(t.dueAt).getTime();
        if (Number.isNaN(ts)) return false;
        return ts >= start && ts < end;
      }
      if (!isToday) return false;
      if (t.completed || t.status === 'done') return false;
      return true;
    });
    const rank = (p: string) => (p === 'high' ? 0 : p === 'medium' ? 1 : 2);
    return [...list].sort((a, b) => {
      const ac = a.completed || a.status === 'done' ? 1 : 0;
      const bc = b.completed || b.status === 'done' ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return rank(a.priority) - rank(b.priority);
    });
  }, [todos, myId, focusDate, dayOffset]);

  const quickAdd = () => {
    const text = draft.trim();
    if (!text) return;
    onAddTodo(text);
    setDraft('');
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 className="font-semibold text-fg flex items-center gap-2 shrink-0 text-lg">
            <CheckSquare className="w-4 h-4 text-accent" />
            {focusLabel}
          </h2>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              className="p-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover"
              aria-label="Previous day"
              onClick={() => setDayOffset((n) => n - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover"
              aria-label="Jump to today"
              onClick={() => setDayOffset(0)}
              title="Today"
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded-lg border border-border text-muted hover:text-fg hover:bg-nav-hover"
              aria-label="Next day"
              onClick={() => setDayOffset((n) => n + 1)}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenTodos}
          className="text-xs font-medium text-accent hover:underline shrink-0 flex items-center gap-0.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Task
        </button>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          placeholder="Quick add a task for me…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') quickAdd();
          }}
        />
        <Button size="sm" onClick={quickAdd} disabled={!draft.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {dayTasks.length === 0 ? (
        <p className="text-sm text-muted py-3 text-center">Nothing due this day.</p>
      ) : (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto">
          {dayTasks.map((td) => {
            const done = td.completed || td.status === 'done';
            return (
              <li key={td.id}>
                <button
                  type="button"
                  onClick={() => onToggleTodo(td.id)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors',
                    done
                      ? 'bg-inset text-muted line-through'
                      : 'bg-surface-1 text-fg hover:border-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'w-4 h-4 rounded border shrink-0 flex items-center justify-center',
                      done ? 'bg-accent border-accent text-white' : 'border-border-strong',
                    )}
                  >
                    {done ? '✓' : ''}
                  </span>
                  <span className="truncate flex-1">{td.text}</span>
                  {td.priority === 'high' && !done && (
                    <span className="text-[10px] font-semibold uppercase text-rose-500 shrink-0">
                      high
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
