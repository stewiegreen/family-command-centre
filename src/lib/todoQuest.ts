import type { FamilyData, Quest, Todo, TodoStatus } from '../types';

/** Effective kanban status for a todo. */
export function todoStatusOf(t: Todo): TodoStatus {
  if (t.status === 'todo' || t.status === 'doing' || t.status === 'done') return t.status;
  return t.completed ? 'done' : 'todo';
}

/**
 * Apply a todo status change and, when moving to done, auto-submit any linked open quest
 * (kid marked finished → parent still approves for XP/coins).
 */
export function applyTodoStatus(
  data: FamilyData,
  todoId: string,
  status: TodoStatus,
  opts?: { submittedById?: string },
): FamilyData {
  const todo = data.todos.find((t) => t.id === todoId);
  if (!todo) return data;

  const prev = todoStatusOf(todo);
  const completed = status === 'done';
  const todos = data.todos.map((t) =>
    t.id === todoId ? { ...t, status, completed } : t,
  );

  let chores = data.chores || [];
  if (completed && prev !== 'done' && todo.questId) {
    const submitter = opts?.submittedById || todo.memberId;
    const at = new Date().toISOString();
    chores = chores.map((q) => {
      if (q.id !== todo.questId) return q;
      if (q.status !== 'open') return q; // don't clobber approved/pending
      return {
        ...q,
        status: 'pending' as const,
        submittedById: submitter,
        submittedAt: at,
      };
    });
  }

  return { ...data, todos, chores };
}

export function findQuestForTodo(data: FamilyData, todo: Todo): Quest | undefined {
  if (!todo.questId) return undefined;
  return (data.chores || []).find((q) => q.id === todo.questId);
}
