import type { Todo, TodoRecurrence } from '../types';

export const TODO_RECURRENCE_OPTIONS: {
  id: TodoRecurrence;
  label: string;
}[] = [
  { id: 'none', label: 'Does not repeat' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'every_n_days', label: 'Every N days' },
];

export function isRecurringTodo(t: Pick<Todo, 'recurrence'>): boolean {
  return !!t.recurrence && t.recurrence !== 'none';
}

export function recurrenceLabel(t: Pick<Todo, 'recurrence' | 'recurrenceInterval'>): string {
  if (!t.recurrence || t.recurrence === 'none') return '';
  if (t.recurrence === 'daily') return 'Daily';
  if (t.recurrence === 'weekly') return 'Weekly';
  if (t.recurrence === 'monthly') return 'Monthly';
  const n = Math.max(1, t.recurrenceInterval || 2);
  return `Every ${n} day${n === 1 ? '' : 's'}`;
}

/**
 * Next due after a completion.
 * Anchors from the previous due (if any) so a late completion still advances
 * the schedule; never schedules in the past relative to `from`.
 */
export function nextDueAt(
  todo: Pick<Todo, 'dueAt' | 'recurrence' | 'recurrenceInterval'>,
  from: Date = new Date(),
): string {
  const rule = todo.recurrence || 'none';
  const base = todo.dueAt ? new Date(todo.dueAt) : new Date(from);
  if (Number.isNaN(base.getTime())) {
    base.setTime(from.getTime());
  }

  // Preserve local time-of-day from base
  let cursor = new Date(base);

  const advanceOnce = (d: Date) => {
    const x = new Date(d);
    if (rule === 'daily') {
      x.setDate(x.getDate() + 1);
    } else if (rule === 'weekly') {
      x.setDate(x.getDate() + 7);
    } else if (rule === 'monthly') {
      x.setMonth(x.getMonth() + 1);
    } else if (rule === 'every_n_days') {
      x.setDate(x.getDate() + Math.max(1, todo.recurrenceInterval || 2));
    }
    return x;
  };

  // Move at least one step past the old due, then catch up to "now" if needed
  cursor = advanceOnce(cursor);
  let guard = 0;
  while (cursor.getTime() <= from.getTime() && guard < 500) {
    cursor = advanceOnce(cursor);
    guard += 1;
  }
  return cursor.toISOString();
}
