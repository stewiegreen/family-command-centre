import { useMemo, useState, type DragEvent } from 'react';
import { Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import type { Priority, Todo, TodoRecurrence, TodoStatus } from '../types';
import { applyTodoStatus, findQuestForTodo, todoStatusOf } from '../lib/todoQuest';
import { isRecurringTodo, recurrenceLabel, TODO_RECURRENCE_OPTIONS } from '../lib/todoRecurrence';
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

/** Normalize legacy completed → status. */
export function todoStatus(t: Todo): TodoStatus {
  return todoStatusOf(t);
}

/** datetime-local value from ISO (local). */
function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COLUMNS: { id: TodoStatus; label: string; hint: string }[] = [
  { id: 'todo', label: 'To Do', hint: 'Queued' },
  { id: 'doing', label: 'Doing', hint: 'In progress' },
  { id: 'done', label: 'Done', hint: 'Finished' },
];

const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#64748b',
  medium: '#f59e0b',
  high: '#ef4444',
};

type EditDraft = {
  id: string;
  text: string;
  priority: Priority;
  dueAt: string;
  memberId: string;
  recurrence: TodoRecurrence;
  recurrenceInterval: number;
};

export function TodosPage() {
  const { data, update, currentUser, getMember, isParent } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const [activeId, setActiveId] = useState(isParent ? data.settings.currentUserId : myId);

  const [text, setText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [assignId, setAssignId] = useState(myId);
  const [composerOpen, setComposerOpen] = useState(false);
  /** Optional reusable ChoreQuest linked to this task. Completing the todo submits it. */
  const [questId, setQuestId] = useState('');
  const [recurrence, setRecurrence] = useState<TodoRecurrence>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(2);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TodoStatus | null>(null);

  // Edit state
  const [edit, setEdit] = useState<EditDraft | null>(null);

  const members = data.members
    .filter((m) => m.role !== 'media')
    .map((m) => getMember(m.id) || m);

  const listId = isParent ? activeId : myId;
  const openAdd = () => {
    setText('');
    setDueAt('');
    setQuestId('');
    setRecurrence('none');
    setRecurrenceInterval(2);
    setPriority('medium');
    setAssignId(listId);
    setComposerOpen(true);
  };
  const closeAdd = () => setComposerOpen(false);
  const listOwner = getMember(listId);
  const list = useMemo(
    () => data.todos.filter((t) => t.memberId === listId),
    [data.todos, listId],
  );

  const openQuests = useMemo(
    () => (data.chores || []).filter((q) => q.status === 'open'),
    [data.chores],
  );

  const byStatus = useMemo(() => {
    const map: Record<TodoStatus, Todo[]> = { todo: [], doing: [], done: [] };
    for (const t of list) {
      map[todoStatus(t)].push(t);
    }
    return map;
  }, [list]);

  const canEditTodo = (t: Todo) => {
    if (isParent) return true;
    const creator = data.members.find((m) => m.id === t.createdById);
    const fromParent = creator && creator.role === 'parent' && t.createdById !== t.memberId;
    if (fromParent) return false;
    return t.createdById === myId || t.memberId === myId;
  };

  const startEdit = (t: Todo) => {
    if (!canEditTodo(t)) return;
    setEdit({
      id: t.id,
      text: t.text,
      priority: t.priority,
      dueAt: toLocalInput(t.dueAt),
      memberId: t.memberId,
      recurrence: t.recurrence || 'none',
      recurrenceInterval: t.recurrenceInterval || 2,
    });
  };

  const cancelEdit = () => setEdit(null);

  const saveEdit = () => {
    if (!edit) return;
    const trimmed = edit.text.trim();
    if (!trimmed) return;
    update((d) => ({
      ...d,
      todos: d.todos.map((t) => {
        if (t.id !== edit.id) return t;
        return {
          ...t,
          text: trimmed,
          priority: edit.priority,
          dueAt: edit.dueAt ? new Date(edit.dueAt).toISOString() : undefined,
          memberId: isParent ? edit.memberId : t.memberId,
          recurrence: edit.recurrence,
          recurrenceInterval:
            edit.recurrence === 'every_n_days'
              ? Math.max(1, edit.recurrenceInterval || 2)
              : undefined,
        };
      }),
    }));
    // If parent reassigned to another board, leave edit mode
    setEdit(null);
  };

  const setTodoStatus = (id: string, status: TodoStatus) => {
    update((d) => applyTodoStatus(d, id, status, { actorId: myId }));
  };

  const addTodo = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const memberId = isParent ? assignId : myId;
    const todoId = crypto.randomUUID();
    const due = dueAt ? new Date(dueAt).toISOString() : undefined;
    const linkedQuestId = questId || undefined;
    update((d) => {
      const chores = linkedQuestId
        ? (d.chores || []).map((q) =>
            q.id === linkedQuestId ? { ...q, todoId } : q,
          )
        : d.chores;
      return {
        ...d,
        chores,
        todos: [
          {
            id: todoId,
            text: trimmed,
            memberId,
            createdById: myId,
            completed: false,
            status: 'todo' as const,
            priority,
            createdAt: new Date().toISOString(),
            dueAt: due,
            questId: linkedQuestId,
            recurrence: recurrence === 'none' ? undefined : recurrence,
            recurrenceInterval:
              recurrence === 'every_n_days' ? Math.max(1, recurrenceInterval) : undefined,
          },
          ...d.todos,
        ],
      };
    });
    setText('');
    setDueAt('');
    setQuestId('');
    setRecurrence('none');
    setRecurrenceInterval(2);
    setComposerOpen(false);
  };

  const removeTodo = (id: string, t: Todo) => {
    if (!canEditTodo(t)) return;
    update((d) => ({ ...d, todos: d.todos.filter((x) => x.id !== id) }));
  };

  const clearDoneTodos = () => {
    update((d) => ({
      ...d,
      todos: d.todos.filter(
        (t) =>
          !(
            t.memberId === listId &&
            todoStatus(t) === 'done' &&
            (isParent || t.createdById === myId)
          ),
      ),
    }));
  };

  // --- DnD ---
  const onDragStart = (e: DragEvent, id: string) => {
    if (edit?.id === id) {
      e.preventDefault();
      return;
    }
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragEnd = () => {
    setDragId(null);
    setOverCol(null);
  };
  const onDragOverCol = (e: DragEvent, col: TodoStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverCol(col);
  };
  const onDropCol = (e: DragEvent, col: TodoStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) setTodoStatus(id, col);
    setDragId(null);
    setOverCol(null);
  };

  const doneCount = byStatus.done.length;

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto space-y-5 h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">To-Dos</h1>
          <p className="text-sm text-muted mt-1">
            Kanban board{listOwner ? ` · ${listOwner.name}` : ''}. Drag cards between columns.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {doneCount > 0 && (
            <button
              type="button"
              onClick={clearDoneTodos}
              className="text-sm text-muted hover:text-fg px-3 py-2 rounded-xl hover:bg-nav-hover"
            >
              Clear done ({doneCount})
            </button>
          )}
          <Button onClick={openAdd} className="!py-2">
            <Plus className="w-4 h-4" /> Add task
          </Button>
        </div>
      </div>

      {/* Parent: whose board */}
      {isParent && (
        <div className="flex flex-wrap gap-2 shrink-0">
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
                {data.todos.filter((t) => t.memberId === m.id && todoStatus(t) !== 'done').length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add task — modal (same pattern as notes / events / quests) */}
      <Modal open={composerOpen} onClose={closeAdd} title="Add task" wide>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">What needs doing?</label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs doing?"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addTodo();
                }
              }}
            />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">ChoreQuest (optional)</label>
            <select
              value={questId}
              onChange={(e) => setQuestId(e.target.value)}
              className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
            >
              <option value="">No ChoreQuest</option>
              {openQuests.map((q) => (
                <option key={q.id} value={q.id}>
                  ⚔️ {q.title} · +{q.xp} XP · +{q.coins}c
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted mt-1">
              Select an existing open quest. Completing this task will submit it for approval.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Due (optional)</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full bg-input border border-border-strong rounded-xl px-2 py-2.5 text-sm text-fg"
              />
            </div>
            {isParent ? (
              <div>
                <label className="text-xs text-muted mb-1 block">Assign to</label>
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
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Repeat</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as TodoRecurrence)}
                className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
              >
                {TODO_RECURRENCE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {recurrence === 'every_n_days' && (
              <div>
                <label className="text-xs text-muted mb-1 block">Every N days</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={recurrenceInterval}
                  onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full bg-input border border-border-strong rounded-xl px-3 py-2.5 text-sm text-fg"
                />
              </div>
            )}
          </div>
          {recurrence !== 'none' && !dueAt && (
            <p className="text-[11px] text-muted">
              Tip: set a due date so the first occurrence shows on the calendar. Completing the task
              schedules the next one automatically.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={closeAdd}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={addTodo} disabled={!text.trim()}>
              <Plus className="w-4 h-4" /> Add task
            </Button>
          </div>
        </div>
      </Modal>

      {/* Kanban columns */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-3 h-full min-h-[28rem] lg:min-h-0 lg:grid lg:grid-cols-3 lg:gap-4">
          {COLUMNS.map((col) => {
            const items = byStatus[col.id];
            const isOver = overCol === col.id;
            return (
              <div
                key={col.id}
                className={cn(
                  'flex flex-col w-[min(85vw,20rem)] sm:w-80 lg:w-auto shrink-0 lg:shrink rounded-2xl border bg-surface/60 min-h-0 transition-colors',
                  isOver ? 'border-accent bg-accent/5' : 'border-border',
                )}
                onDragOver={(e) => onDragOverCol(e, col.id)}
                onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
                onDrop={(e) => onDropCol(e, col.id)}
              >
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border shrink-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-fg">{col.label}</p>
                    <p className="text-[11px] text-faint">{col.hint}</p>
                  </div>
                  <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full bg-surface-2 text-muted">
                    {items.length}
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                  {items.length === 0 && (
                    <p className="text-xs text-faint text-center py-8 px-2">
                      {isOver ? 'Drop here' : 'Empty'}
                    </p>
                  )}
                  {items.map((t) => {
                    const assignee = getMember(t.memberId) || listOwner;
                    const color = assignee?.color || '#6366f1';
                    const status = todoStatus(t);
                    const editing = edit?.id === t.id;
                    const canEdit = canEditTodo(t);

                    if (editing && edit) {
                      return (
                        <div
                          key={t.id}
                          className="rounded-xl border border-accent bg-page p-3 shadow-sm space-y-2"
                          style={{ borderLeftWidth: 3, borderLeftColor: color }}
                        >
                          <textarea
                            value={edit.text}
                            onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                            rows={2}
                            className="w-full bg-input border border-border-strong rounded-lg px-2.5 py-2 text-sm text-fg resize-y min-h-[2.5rem]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelEdit();
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit();
                            }}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted mb-0.5 block">Priority</label>
                              <select
                                value={edit.priority}
                                onChange={(e) =>
                                  setEdit({ ...edit, priority: e.target.value as Priority })
                                }
                                className="w-full bg-input border border-border-strong rounded-lg px-2 py-1.5 text-xs text-fg"
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted mb-0.5 block">Due</label>
                              <input
                                type="datetime-local"
                                value={edit.dueAt}
                                onChange={(e) => setEdit({ ...edit, dueAt: e.target.value })}
                                className="w-full bg-input border border-border-strong rounded-lg px-1.5 py-1.5 text-xs text-fg"
                              />
                            </div>
                          </div>
                          {isParent && (
                            <div>
                              <label className="text-[10px] text-muted mb-0.5 block">Assign to</label>
                              <select
                                value={edit.memberId}
                                onChange={(e) => setEdit({ ...edit, memberId: e.target.value })}
                                className="w-full bg-input border border-border-strong rounded-lg px-2 py-1.5 text-xs text-fg"
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
                          <div className="flex items-center justify-end gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-muted hover:bg-nav-hover"
                            >
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={!edit.text.trim()}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-ink disabled:opacity-40"
                            >
                              <Check className="w-3.5 h-3.5" /> Save
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={t.id}
                        draggable={!editing}
                        onDragStart={(e) => onDragStart(e, t.id)}
                        onDragEnd={onDragEnd}
                        onDoubleClick={() => canEdit && startEdit(t)}
                        className={cn(
                          'rounded-xl border border-border bg-page p-3 cursor-grab active:cursor-grabbing select-none shadow-sm group',
                          dragId === t.id && 'opacity-40',
                          status === 'done' && 'opacity-70',
                        )}
                        style={{ borderLeftWidth: 3, borderLeftColor: color }}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-faint shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                'text-sm font-medium text-fg leading-snug',
                                status === 'done' && 'line-through text-muted',
                              )}
                            >
                              {t.text}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                              <span
                                className="text-[10px] font-bold uppercase tracking-wide"
                                style={{ color: PRIORITY_COLOR[t.priority] }}
                              >
                                {t.priority}
                              </span>
                              {t.dueAt && (
                                <span className="text-[11px] text-muted">
                                  {new Date(t.dueAt).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                              {isRecurringTodo(t) && (
                                <span className="text-[11px] text-sky-600 font-medium">
                                  ↻ {recurrenceLabel(t)}
                                </span>
                              )}
                              {(() => {
                                const q = findQuestForTodo(data, t);
                                if (!q) return null;
                                return (
                                  <span className="text-[11px] font-medium text-accent">
                                    ⚔ +{q.xp} XP · +{q.coins}c
                                    {q.status === 'pending' ? ' · pending' : ''}
                                    {q.status === 'done' ? ' · claimed' : ''}
                                  </span>
                                );
                              })()}
                            </div>
                            {/* Mobile-friendly status chips */}
                            <div className="flex flex-wrap gap-1 mt-2 lg:hidden">
                              {COLUMNS.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setTodoStatus(t.id, c.id)}
                                  className={cn(
                                    'text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors',
                                    status === c.id
                                      ? 'border-accent bg-accent/15 text-accent'
                                      : 'border-border text-faint hover:text-fg',
                                  )}
                                >
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col gap-0.5 shrink-0">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => startEdit(t)}
                                className="p-1.5 text-faint hover:text-accent rounded-lg hover:bg-accent/10"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removeTodo(t.id, t)}
                                className="p-1.5 text-faint hover:text-red-400 rounded-lg hover:bg-red-500/10"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
