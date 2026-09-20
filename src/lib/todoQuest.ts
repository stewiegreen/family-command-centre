import type { FamilyData, Quest, Todo, TodoStatus } from '../types';
import { FAMILY_LIST_ID } from '../types';
import { isRecurringTodo, nextDueAt } from './todoRecurrence';

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
 * Submit (or fork) a linked quest when a todo is completed.
 *
 * Shared/generic quests (e.g. "clean your room") can be linked from several
 * todos. The live board only holds one Quest row, so the first completion moves
 * it open → pending. Later completions must not silently no-op — they fork a
 * new pending quest with the same rewards for the todo assignee.
 */
function submitOrForkLinkedQuest(
  chores: Quest[],
  todo: Todo,
  submitter: string,
  at: string,
): { chores: Quest[]; questIdForTodo: string } {
  const linkedId = todo.questId;
  if (!linkedId) return { chores, questIdForTodo: linkedId as string };

  const linked = chores.find((q) => q.id === linkedId);
  if (!linked) return { chores, questIdForTodo: linkedId };

  if (linked.status === 'open') {
    return {
      chores: chores.map((q) => {
        if (q.id !== linked.id) return q;
        return {
          ...q,
          status: 'pending' as const,
          submittedById: submitter,
          submittedAt: at,
          todoId: todo.id,
        };
      }),
      questIdForTodo: linked.id,
    };
  }

  // Already pending/done — if this submitter already owns the submission, no-op.
  const claimedBy = linked.submittedById || linked.approvedForId;
  if (claimedBy === submitter) {
    return { chores, questIdForTodo: linked.id };
  }

  // Someone else already claimed this board quest. Fork a personal pending copy
  // so this todo still pays out on parent approve.
  const forkId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `quest-fork-${todo.id}-${at}`;
  const fork: Quest = {
    id: forkId,
    title: linked.title,
    difficulty: linked.difficulty,
    xp: linked.xp,
    coins: linked.coins,
    rewardMinutes: linked.rewardMinutes ?? 0,
    status: 'pending',
    submittedById: submitter,
    submittedAt: at,
    createdById: linked.createdById,
    createdAt: at,
    templateId: linked.templateId,
    repeatable: linked.repeatable,
    todoId: todo.id,
  };
  return {
    chores: [...chores, fork],
    questIdForTodo: forkId,
  };
}

/**
 * Apply a todo status change and, when moving to done, auto-submit any linked open quest
 * (→ pending for parent approval; XP/coins credit the todo assignee).
 * If the linked quest was already finished/submitted by someone else, forks a new
 * pending quest so multi-person generic chores still pay out.
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
  const at = new Date().toISOString();
  const rolling = completed && prev !== 'done' && isRecurringTodo(todo);

  let todos = data.todos.map((t) => {
    if (t.id !== todoId) return t;
    if (rolling) {
      // Complete → reschedule: stay on the board for the next occurrence
      return {
        ...t,
        status: 'todo' as const,
        completed: false,
        dueAt: nextDueAt(t, new Date()),
        lastCompletedAt: at,
      };
    }
    return { ...t, status, completed };
  });

  let chores = data.chores || [];
  if (completed && prev !== 'done' && todo.questId) {
    const submitter = resolveQuestSubmitter(data, todo, opts?.actorId);
    const result = submitOrForkLinkedQuest(chores, todo, submitter, at);
    chores = result.chores;
    // Point the todo at the quest instance that now carries *this* submission
    // (same id when claimed open; new fork id when shared quest was already taken).
    if (result.questIdForTodo && result.questIdForTodo !== todo.questId) {
      todos = todos.map((t) =>
        t.id === todoId ? { ...t, questId: result.questIdForTodo } : t,
      );
    }
  }

  return { ...data, todos, chores };
}

/** Look up the live quest linked to a todo (if any). */
export function findQuestForTodo(data: FamilyData, todo: Todo): Quest | undefined {
  if (!todo.questId) return undefined;
  return (data.chores || []).find((q) => q.id === todo.questId);
}

/**
 * Resolve who receives XP/coins when a quest is approved.
 * Prefer submittedById / approvedForId. Special case:
 * 1. Use submittedById when set.
 * 2. If that member is a *parent* AND this quest is tied to a specific
 *    todoId (todo-driven path), credit the todo's assignee instead — parents
 *    dragging a kid's board must not keep the rewards.
 * 3. Never scan "any todo with this questId" — that stole rewards from a parent
 *    (or another kid) who submitted the *board* quest themselves whenever Lucy
 *    (etc.) had a linked todo for the same quest.
 */
export function creditMemberForQuest(data: FamilyData, quest: Quest): string | undefined {
  const forId = quest.submittedById || quest.approvedForId;
  if (!forId) return undefined;
  const member = data.members.find((m) => m.id === forId);
  if (member?.role === 'parent' && quest.todoId) {
    const todo = data.todos.find((t) => t.id === quest.todoId);
    if (todo?.memberId && todo.memberId !== FAMILY_LIST_ID) {
      return todo.memberId;
    }
  }
  return forId;
}
