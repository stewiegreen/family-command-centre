import type { FamilyData, Quest, Todo, TodoStatus } from '../types';
import { FAMILY_LIST_ID } from '../types';

/** Effective kanban status for a todo. */
export function todoStatusOf(t: Todo): TodoStatus {
  if (t.status === 'todo' || t.status === 'doing' || t.status === 'done') return t.status;
  return t.completed ? 'done' : 'todo';
}

/**
 * Who should receive XP/coins when a linked quest is later approved.
 * Always prefer the todo board owner (assignee), never the parent who
 * might be dragging cards on a kid's board.
 */
export function resolveQuestSubmitter(
  data: FamilyData,
  todo: Todo,
  actorId?: string,
): string {
  // Personal board → that member is the hero
  if (todo.memberId && todo.memberId !== FAMILY_LIST_ID) {
    return todo.memberId;
  }
  // Family shared list: only credit if the actor is a kid
  if (actorId) {
    const actor = data.members.find((m) => m.id === actorId);
    if (actor?.role === 'kid') return actorId;
  }
  // Last resort: leave actor if provided (parent will see pending under themselves
  // and can reassign on approve — better than silent no-op)
  return actorId || todo.memberId;
}

/**
 * Apply a todo status change and, when moving to done, auto-submit any linked open quest
 * (→ pending for parent approval; XP/coins credit the todo assignee).
 */
export function applyTodoStatus(
  data: FamilyData,
  todoId: string,
  status: TodoStatus,
  opts?: { actorId?: string },
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
    const submitter = resolveQuestSubmitter(data, todo, opts?.actorId);
    const at = new Date().toISOString();
    chores = chores.map((q) => {
      if (q.id !== todo.questId) return q;
      if (q.status !== 'open') return q; // don't clobber approved/pending
      return {
        ...q,
        status: 'pending' as const,
        submittedById: submitter,
        submittedAt: at,
        todoId: todo.id,
      };
    });
  }

  return { ...data, todos, chores };
}

export function findQuestForTodo(data: FamilyData, todo: Todo): Quest | undefined {
  if (!todo.questId) return undefined;
  return (data.chores || []).find((q) => q.id === todo.questId);
}

/**
 * Resolve who should receive XP/coins on quest approval.
 * Prefers submittedById, but if that points at a parent (bug from older
 * todo-complete paths), fall back to the linked todo's assignee.
 */
export function creditMemberForQuest(data: FamilyData, quest: Quest): string | undefined {
  let forId = quest.submittedById || quest.approvedForId;
  if (!forId) return undefined;
  const member = data.members.find((m) => m.id === forId);
  if (member?.role === 'parent' && quest.todoId) {
    const todo = data.todos.find((t) => t.id === quest.todoId);
    if (todo?.memberId && todo.memberId !== FAMILY_LIST_ID) {
      return todo.memberId;
    }
  }
  // submittedById was parent without a usable todo link — try any todo pointing at this quest
  if (member?.role === 'parent') {
    const linked = data.todos.find(
      (t) => t.questId === quest.id && t.memberId && t.memberId !== FAMILY_LIST_ID,
    );
    if (linked) return linked.memberId;
  }
  return forId;
}
