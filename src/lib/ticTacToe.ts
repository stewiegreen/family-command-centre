import type { TicCell, TicTacToeGame } from '../types';

export const EMPTY_BOARD: TicCell[] = ['', '', '', '', '', '', '', '', ''];

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;

export function isInfiniteTtt(type: string): boolean {
  return type === 'tictactoe_infinite';
}

export function checkWinner(
  board: TicCell[],
  opts?: { allowDraw?: boolean },
): null | 'X' | 'O' | 'draw' {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return v;
  }
  const allowDraw = opts?.allowDraw !== false;
  if (allowDraw && board.every((c) => c !== '')) return 'draw';
  return null;
}

export function winningLine(board: TicCell[]): number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return [...line];
  }
  return null;
}

/**
 * Apply a move. Classic: place mark. Infinite: each player keeps at most 3
 * marks — the 4th placement removes their oldest.
 */
export function applyMove(
  game: Pick<TicTacToeGame, 'board' | 'turn' | 'type' | 'xMoves' | 'oMoves'>,
  index: number,
): {
  board: TicCell[];
  turn: 'X' | 'O';
  winner: null | 'X' | 'O' | 'draw';
  status: 'active' | 'finished';
  xMoves: number[];
  oMoves: number[];
  removedIndex: number | null;
} {
  if (game.board[index]) {
    throw new Error('Cell occupied');
  }
  const mark = game.turn;
  const board = game.board.slice() as TicCell[];
  let xMoves = [...(game.xMoves || [])];
  let oMoves = [...(game.oMoves || [])];
  let removedIndex: number | null = null;

  board[index] = mark;
  if (mark === 'X') {
    xMoves.push(index);
    if (isInfiniteTtt(game.type) && xMoves.length > 3) {
      removedIndex = xMoves.shift()!;
      board[removedIndex] = '';
    }
  } else {
    oMoves.push(index);
    if (isInfiniteTtt(game.type) && oMoves.length > 3) {
      removedIndex = oMoves.shift()!;
      board[removedIndex] = '';
    }
  }

  // Infinite mode rarely fills the board; don't call draws from "full board".
  const winner = checkWinner(board, { allowDraw: !isInfiniteTtt(game.type) });
  const status = winner ? 'finished' : 'active';
  const turn: 'X' | 'O' = winner ? mark : mark === 'X' ? 'O' : 'X';

  return { board, turn, winner, status, xMoves, oMoves, removedIndex };
}

export function gameModeLabel(type: string): string {
  return isInfiniteTtt(type) ? 'Infinite' : 'Classic';
}
