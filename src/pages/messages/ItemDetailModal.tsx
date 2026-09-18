// src/pages/messages/ItemDetailModal.tsx
//
// Tapping a shared attachment in a message used to just setView() to the
// source page, losing your place in the conversation. This shows the
// live, current item (not the message's point-in-time snapshot) in a
// popup instead, with a quick action where it's cheap and safe (mark a
// task/shopping item done) and an "Open in <page>" escape hatch for
// anything that needs the full editor (events, notes, quest approval).

import { Calendar, ListTodo, MapPin, Pin, ShoppingCart, StickyNote, Swords, Tag } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/cn';
import { DIFFICULTY_REWARDS } from '../../lib/quest';
import type { MessageAttachment, ViewId } from '../../types';

function fmtDateTime(iso?: string, allDay?: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted mb-0.5">{label}</p>
      <div className="text-sm text-fg">{children}</div>
    </div>
  );
}

function MemberChip({ id }: { id: string }) {
  const { getMember } = useApp();
  const m = getMember(id);
  if (!m) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border pl-1 pr-2.5 py-0.5">
      <Avatar {...m} size="sm" className="!w-5 !h-5 !text-[10px]" />
      <span className="text-xs font-medium">{m.name}</span>
    </span>
  );
}

export function ItemDetailModal({
  attachment,
  onClose,
  onOpenSource,
}: {
  attachment: MessageAttachment | null;
  onClose: () => void;
  onOpenSource: (view: ViewId) => void;
}) {
  const { data, update, isParent } = useApp();
  if (!attachment) return null;

  const openSource = (view: ViewId) => {
    onOpenSource(view);
    onClose();
  };

  const notFound = (view: ViewId, icon: React.ReactNode, label: string) => (
    <div className="text-center py-6">
      <div className="w-12 h-12 rounded-full bg-inset flex items-center justify-center mx-auto mb-3 text-muted">
        {icon}
      </div>
      <p className="font-medium text-fg">{attachment.title}</p>
      <p className="text-sm text-muted mt-1">
        This {label} has been deleted or changed since it was shared.
      </p>
      <Button size="sm" variant="secondary" className="mt-4" onClick={() => openSource(view)}>
        Open {label}s
      </Button>
    </div>
  );

  if (attachment.type === 'todo') {
    const todo = data.todos.find((t) => t.id === attachment.id);
    if (!todo) {
      return (
        <Modal open onClose={onClose} title="Task">
          {notFound('todos', <ListTodo className="w-5 h-5" />, 'task')}
        </Modal>
      );
    }
    const linkedQuest = todo.questId ? data.chores.find((c) => c.id === todo.questId) : undefined;
    return (
      <Modal open onClose={onClose} title="Task">
        <div className="space-y-4">
          <p className={cn('text-base font-semibold text-fg', todo.completed && 'line-through opacity-60')}>
            {todo.text}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              {todo.completed ? 'Done' : todo.status === 'doing' ? 'In progress' : 'To do'}
            </Field>
            <Field label="Priority">
              <span className="capitalize">{todo.priority}</span>
            </Field>
            {todo.dueAt && <Field label="Due">{fmtDateTime(todo.dueAt)}</Field>}
            {todo.recurrence && todo.recurrence !== 'none' && (
              <Field label="Repeats">
                <span className="capitalize">{todo.recurrence.replace(/_/g, ' ')}</span>
              </Field>
            )}
          </div>
          <Field label="Assigned to">
            <MemberChip id={todo.memberId} />
          </Field>
          {linkedQuest && (
            <Field label="Linked quest">
              <span className="inline-flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5 text-accent" />
                {linkedQuest.title} · +{linkedQuest.xp} XP · +{linkedQuest.coins} coins
              </span>
            </Field>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant={todo.completed ? 'secondary' : 'primary'}
              onClick={() =>
                update((d) => ({
                  ...d,
                  todos: d.todos.map((t) =>
                    t.id === todo.id
                      ? { ...t, completed: !t.completed, status: !t.completed ? 'done' : 'todo' }
                      : t,
                  ),
                }))
              }
            >
              {todo.completed ? 'Mark not done' : 'Mark done'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openSource('todos')}>
              Open in Tasks
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (attachment.type === 'event') {
    const ev = data.events.find((e) => e.id === attachment.id);
    if (!ev) {
      return (
        <Modal open onClose={onClose} title="Event">
          {notFound('calendar', <Calendar className="w-5 h-5" />, 'event')}
        </Modal>
      );
    }
    const memberIds = ev.memberIds?.length ? ev.memberIds : ev.memberId ? [ev.memberId] : [];
    return (
      <Modal open onClose={onClose} title="Event">
        <div className="space-y-4">
          <p className="text-base font-semibold text-fg">{ev.title}</p>
          <Field label="When">
            {fmtDateTime(ev.start, ev.allDay)}
            {!ev.allDay && ev.end && <> – {new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</>}
            {ev.recurrence && ev.recurrence !== 'none' && (
              <span className="text-muted"> · repeats {ev.recurrence}</span>
            )}
          </Field>
          {ev.location && (
            <Field label="Location">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-muted" />
                {ev.location}
              </span>
            </Field>
          )}
          {memberIds.length > 0 && (
            <Field label="With">
              <div className="flex flex-wrap gap-1.5">
                {memberIds.map((id) => (
                  <MemberChip key={id} id={id} />
                ))}
              </div>
            </Field>
          )}
          {ev.notes && (
            <Field label="Notes">
              <p className="whitespace-pre-wrap">{ev.notes}</p>
            </Field>
          )}
          <div className="pt-2">
            <Button size="sm" variant="ghost" onClick={() => openSource('calendar')}>
              Open in Calendar
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (attachment.type === 'note') {
    const note = data.notes.find((n) => n.id === attachment.id);
    if (!note) {
      return (
        <Modal open onClose={onClose} title="Note">
          {notFound('notes', <StickyNote className="w-5 h-5" />, 'note')}
        </Modal>
      );
    }
    return (
      <Modal open onClose={onClose} title="Note">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {note.pinned && <Pin className="w-4 h-4 text-accent shrink-0" />}
            <p className="text-base font-semibold text-fg">{note.title || 'Note'}</p>
          </div>
          {note.kind === 'checklist' && note.checklist?.length ? (
            <ul className="space-y-1.5">
              {note.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'w-4 h-4 rounded border border-border flex items-center justify-center shrink-0',
                      item.done && 'bg-accent border-accent',
                    )}
                  />
                  <span className={cn(item.done && 'line-through opacity-60')}>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm whitespace-pre-wrap text-fg">{note.content || 'No content.'}</p>
          )}
          {note.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-inset border border-border text-muted"
                >
                  <Tag className="w-3 h-3" />
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="pt-2">
            <Button size="sm" variant="ghost" onClick={() => openSource('notes')}>
              Open in Notes
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (attachment.type === 'shopping') {
    const item = data.shopping.find((s) => s.id === attachment.id);
    if (!item) {
      return (
        <Modal open onClose={onClose} title="Shopping item">
          {notFound('shopping', <ShoppingCart className="w-5 h-5" />, 'item')}
        </Modal>
      );
    }
    return (
      <Modal open onClose={onClose} title="Shopping item">
        <div className="space-y-4">
          <p className={cn('text-base font-semibold text-fg', item.bought && 'line-through opacity-60')}>
            {item.text}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {item.quantity && <Field label="Quantity">{item.quantity}</Field>}
            {item.brand && <Field label="Brand">{item.brand}</Field>}
            {item.store && <Field label="Store">{item.store}</Field>}
            {item.category && <Field label="Category">{item.category}</Field>}
          </div>
          {item.claimedById && (
            <Field label="Claimed by">
              <MemberChip id={item.claimedById} />
            </Field>
          )}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant={item.bought ? 'secondary' : 'primary'}
              onClick={() =>
                update((d) => ({
                  ...d,
                  shopping: d.shopping.map((s) => (s.id === item.id ? { ...s, bought: !s.bought } : s)),
                }))
              }
            >
              {item.bought ? 'Mark not bought' : 'Mark bought'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openSource('shopping')}>
              Open in Shopping
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // quest
  const quest = data.chores.find((c) => c.id === attachment.id);
  if (!quest) {
    return (
      <Modal open onClose={onClose} title="Quest">
        {notFound('chores', <Swords className="w-5 h-5" />, 'quest')}
      </Modal>
    );
  }
  const diffMeta = DIFFICULTY_REWARDS[quest.difficulty] || DIFFICULTY_REWARDS.medium;
  return (
    <Modal open onClose={onClose} title="Quest">
      <div className="space-y-4">
        <p className="text-base font-semibold text-fg">{quest.title}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Difficulty">
            {diffMeta.emoji} {diffMeta.label}
          </Field>
          <Field label="Reward">+{quest.xp} XP · +{quest.coins} coins</Field>
          <Field label="Status">
            <span className="capitalize">{quest.status}</span>
          </Field>
        </div>
        {quest.submittedById && quest.status === 'pending' && (
          <Field label="Waiting on approval from">
            <MemberChip id={quest.submittedById} />
          </Field>
        )}
        {quest.approvedForId && quest.status === 'done' && (
          <Field label="Approved for">
            <MemberChip id={quest.approvedForId} />
          </Field>
        )}
        {!isParent && quest.status === 'pending' && (
          <p className="text-xs text-muted">A parent needs to approve this in Chores.</p>
        )}
        <div className="pt-2">
          <Button size="sm" variant="ghost" onClick={() => openSource('chores')}>
            Open in Chores
          </Button>
        </div>
      </div>
    </Modal>
  );
}
