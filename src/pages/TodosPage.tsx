import { useEffect, useState } from 'react';
import { Plus, Trash2, CheckSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';
import type { Priority } from '../types';
import { cn } from '../lib/cn';

/** Soft tint of a hex colour for card backgrounds. */
function tint(hex: string, alpha = 0.14): string {
  const c = (hex || '#6366f1').replace('#', '');
  if (c.length < 6) return `rgba(99, 102, 241, ${alpha})`;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TodosPage() {
  const { data, update, currentUser, getMember, isParent } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const [activeId, setActiveId] = useState(isParent ? data.settings.currentUserId : myId);

  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [assignId, setAssignId] = useState(myId);

  useEffect(() => {
    const openMine = () => {};
    window.addEventListener('fcc:quick-add', openMine);
    return () => {
      window.removeEventListener('fcc:quick-add', openMine);
    };
  }, []);

  const members = data.members
    .filter((m) => m.role !== 'media')
    .map((m) => getMember(m.id) || m);

  const listId = isParent ? activeId : myId;
  const listOwner = getMember(listId);
  const list = data.todos.filter((t) => t.memberId === listId);
  const open = list.filter((t) => !t.completed);
  const done = list.filter((t) => t.completed);

  const addTodo = () => {
    if (!text.trim()) return;
    const memberId = isParent ? assignId : myId;
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
    const fromParent = creator && creator.role === 'parent' && t.createdById !== t.memberId;
    if (!isParent && fromParent) return;
    if (!isParent && t.createdById !== myId && t.memberId !== myId) return;
    update((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== id) }));
  };

  const clearDoneTodos = () => {
    update((d) => ({
      ...d,
      todos: d.todos.filter((t) => !(t.memberId === listId && t.completed && (isParent || t.createdById === myId))),
    }));
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">To-Dos</h1>
          <p className="text-sm text-muted mt-1">Personal lists by family member.</p>
        </div>
        {done.length > 0 && (
          <button type="button" onClick={clearDoneTodos} className="text-sm text-muted hover:text-fg self-start">
            Clear done ({done.length})
          </button>
        )}
      </div>

      {/* Parent: whose personal list */}
      {isParent && (
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
                  ? 'border-accent bg-accent-tint text-accent'
                  : 'border-border-strong text-muted hover:bg-nav-hover',
              )}
              style={
                activeId === m.id && m.color
                  ? { borderColor: m.color, backgroundColor: tint(m.color, 0.18), color: m.color }
                  : undefined
              }
            >
              <Avatar {...m} size="sm" />
              {m.name}
              <span className="text-xs opacity-70">
                {data.todos.filter((t) => t.memberId === m.id && !t.completed).length}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
        <Card className="!p-5 lg:!p-6 space-y-4 lg:sticky lg:top-20">
          <h2 className="font-semibold text-fg">Add task</h2>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs doing?"
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
          {isParent && (
            <div>
              <label className="text-xs text-muted mb-1.5 block">Assign to</label>
              <select
                value={assignId}
                onChange={(e) => setAssignId(e.target.value)}
                className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.emoji ? `${m.emoji} ` : ''}
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
              <EmptyState icon={CheckSquare} title="No tasks yet" description="Add a task using the form." />
            </Card>
          ) : (
            <>
              {open.length > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted px-1">Open · {open.length}</p>
              )}
              {[...open, ...done].map((t) => {
                const assignee = getMember(t.memberId) || listOwner;
                const color = assignee?.color || '#6366f1';
                const creator = data.members.find((m) => m.id === t.createdById);
                const fromParent = creator && creator.role === 'parent' && t.createdById !== t.memberId;
                const canDelete = isParent || (!fromParent && (t.createdById === myId || t.memberId === myId));
                return (
                  <Card
                    key={t.id}
                    className={cn(
                      '!p-4 flex items-start gap-3 border-l-4 overflow-hidden',
                      t.completed && 'opacity-55',
                    )}
                    style={{
                      borderLeftColor: color,
                      backgroundColor: tint(color, t.completed ? 0.08 : 0.18),
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTodo(t.id)}
                      className={cn(
                        'mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors',
                        t.completed
                          ? 'bg-accent border-accent text-accent-ink'
                          : 'border-border-strong hover:border-accent',
                      )}
                      style={!t.completed ? { borderColor: color } : undefined}
                    >
                      {t.completed && <span className="text-xs">✓</span>}
                    </button>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className={cn('text-base font-medium', t.completed && 'line-through text-muted')}>
                        {t.text}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1.5 items-center">
                        {assignee && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                            <Avatar {...assignee} size="sm" className="!w-7 !h-7 !text-sm" />
                            {assignee.name}
                          </span>
                        )}
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
    </div>
  );
}
