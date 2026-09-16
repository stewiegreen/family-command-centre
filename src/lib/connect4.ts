import type { Connect4Cell, Connect4Game } from '../types';

export const C4_COLS = 7;
export const C4_ROWS = 6;
export const C4_SIZE = C4_COLS * C4_ROWS;

export const EMPTY_C4_BOARD: Connect4Cell[] = Array.from({ length: C4_SIZE }, () => '');

/** Lowest empty row in column (0 = top). Returns -1 if full. */
export function dropRow(board: Connect4Cell[], col: number): number {
  if (col < 0 || col >= C4_COLS) return -1;
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    if (board[row * C4_COLS + col] === '') return row;
  }
  return -1;
}

function cell(board: Connect4Cell[], row: number, col: number): Connect4Cell {
  if (row < 0 || row >= C4_ROWS || col < 0 || col >= C4_COLS) return '';
  return board[row * C4_COLS + col] || '';
}

export function checkConnect4Winner(board: Connect4Cell[]): null | 'R' | 'Y' | 'draw' {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const v = cell(board, r, c);
      if (!v) continue;
      for (const [dr, dc] of dirs) {
        let n = 1;
        for (let k = 1; k < 4; k++) {
          if (cell(board, r + dr * k, c + dc * k) === v) n++;
          else break;
        }
        if (n >= 4) return v;
      }
    }
  }
  if (board.every((x) => x !== '')) return 'draw';
  return null;
}

/** Cells that form a winning line of 4 (for highlight). */
export function connect4WinningCells(board: Connect4Cell[]): number[] | null {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const v = cell(board, r, c);
      if (!v) continue;
      for (const [dr, dc] of dirs) {
        const cells = [r * C4_COLS + c];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (cell(board, rr, cc) === v) cells.push(rr * C4_COLS + cc);
          else break;
        }
        if (cells.length >= 4) return cells;
      }
    }
  }
  return null;
}

export function applyConnect4Move(
  game: Pick<Connect4Game, 'board' | 'turn'>,
  col: number,
): {
  board: Connect4Cell[];
  turn: 'R' | 'Y';
  winner: null | 'R' | 'Y' | 'draw';
  status: 'active' | 'finished';
} {
  const row = dropRow(game.board, col);
  if (row < 0) throw new Error('Column full');
  const board = game.board.slice() as Connect4Cell[];
  board[row * C4_COLS + col] = game.turn;
  const winner = checkConnect4Winner(board);
  return {
    board,
    turn: winner ? game.turn : game.turn === 'R' ? 'Y' : 'R',
    winner,
    status: winner ? 'finished' : 'active',
  };
}

export function gameTitle(type: string): string {
  if (type === 'connect4') return 'Connect 4';
  if (type === 'tictactoe_infinite') return 'Infinite Tic-Tac-Toe';
  if (type === 'tictactoe') return 'Classic Tic-Tac-Toe';
  return 'Game';
}
