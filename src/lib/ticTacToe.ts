import type { TicCell } from '../types';

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

export function checkWinner(board: TicCell[]): null | 'X' | 'O' | 'draw' {
  for (const [a, b, c] of LINES) {
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return v;
  }
  if (board.every((c) => c !== '')) return 'draw';
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
