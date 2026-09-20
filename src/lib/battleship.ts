/**
 * Pure Battleship board math — no React, no Firebase.
 * Ship positions never leave the owning client's private fleet doc.
 */

import type { Fleet, ShipType, ShotResult } from '../types';

export const BS_SIZE = 10;
export const BS_CELLS = BS_SIZE * BS_SIZE;

export const SHIP_SIZES: Record<ShipType, number> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

export const SHIP_ORDER: ShipType[] = [
  'carrier',
  'battleship',
  'cruiser',
  'submarine',
  'destroyer',
];

export const SHIP_LABEL: Record<ShipType, string> = {
  carrier: 'Carrier',
  battleship: 'Battleship',
  cruiser: 'Cruiser',
  submarine: 'Submarine',
  destroyer: 'Destroyer',
};

export function cellIndex(row: number, col: number): number {
  return row * BS_SIZE + col;
}

export function cellRC(index: number): { row: number; col: number } {
  return { row: Math.floor(index / BS_SIZE), col: index % BS_SIZE };
}

/** Cells a ship would occupy from a start cell, horizontal or vertical. */
export function shipCells(
  start: number,
  length: number,
  horizontal: boolean,
): number[] | null {
  const { row, col } = cellRC(start);
  const cells: number[] = [];
  for (let i = 0; i < length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r < 0 || r >= BS_SIZE || c < 0 || c >= BS_SIZE) return null;
    cells.push(cellIndex(r, c));
  }
  return cells;
}

/**
 * Hover preview while placing: every in-bounds cell the ship would cover.
 * valid=false when the ship runs off the board or overlaps an existing ship.
 */
export function placementPreview(
  start: number,
  length: number,
  horizontal: boolean,
  occupied: Set<number>,
): { cells: number[]; valid: boolean } {
  const { row, col } = cellRC(start);
  const cells: number[] = [];
  let fits = true;
  for (let i = 0; i < length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r < 0 || r >= BS_SIZE || c < 0 || c >= BS_SIZE) {
      fits = false;
      break;
    }
    cells.push(cellIndex(r, c));
  }
  if (!fits || cells.length !== length) {
    return { cells, valid: false };
  }
  if (cells.some((c) => occupied.has(c))) {
    return { cells, valid: false };
  }
  return { cells, valid: true };
}

export function isValidPlacement(ships: Fleet['ships']): boolean {
  if (ships.length !== SHIP_ORDER.length) return false;
  const seen = new Set<number>();
  const types = new Set<ShipType>();
  for (const s of ships) {
    if (types.has(s.type)) return false;
    types.add(s.type);
    const need = SHIP_SIZES[s.type];
    if (!need || s.cells.length !== need) return false;
    for (const c of s.cells) {
      if (c < 0 || c >= BS_CELLS || seen.has(c)) return false;
      seen.add(c);
    }
    // contiguous horizontal or vertical
    const sorted = [...s.cells].sort((a, b) => a - b);
    const rows = sorted.map((i) => cellRC(i).row);
    const cols = sorted.map((i) => cellRC(i).col);
    const sameRow = rows.every((r) => r === rows[0]);
    const sameCol = cols.every((c) => c === cols[0]);
    if (!sameRow && !sameCol) return false;
    if (sameRow) {
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1]! + 1) return false;
      }
    } else {
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== sorted[i - 1]! + BS_SIZE) return false;
      }
    }
  }
  return types.size === SHIP_ORDER.length;
}

/** Auto-place a legal fleet (randomize button). */
export function randomFleet(): Fleet['ships'] {
  const occupied = new Set<number>();
  const ships: Fleet['ships'] = [];

  for (const type of SHIP_ORDER) {
    const len = SHIP_SIZES[type];
    let placed = false;
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const horizontal = Math.random() < 0.5;
      const start = Math.floor(Math.random() * BS_CELLS);
      const cells = shipCells(start, len, horizontal);
      if (!cells) continue;
      if (cells.some((c) => occupied.has(c))) continue;
      for (const c of cells) occupied.add(c);
      ships.push({ type, cells });
      placed = true;
    }
    if (!placed) {
      // restart whole fleet if stuck
      return randomFleet();
    }
  }
  return ships;
}

export function resolveShot(
  fleet: Fleet,
  cell: number,
): { result: ShotResult; sunkShip?: ShipType } {
  if (cell < 0 || cell >= BS_CELLS) return { result: 'miss' };
  const ship = fleet.ships.find((s) => s.cells.includes(cell));
  if (!ship) return { result: 'miss' };

  // sunk if every cell of this ship is either this shot or already hit —
  // caller passes only the fleet; we need prior hits. For pure resolve of
  // "does this cell hit a ship", return hit; sunk detection needs shot history.
  return { result: 'hit' };
}

/**
 * Full resolution including sunk detection.
 * `priorHits` = cells already confirmed as hits against this fleet.
 */
export function resolveShotFull(
  fleet: Fleet,
  cell: number,
  priorHits: number[],
): { result: ShotResult; sunkShip?: ShipType } {
  if (cell < 0 || cell >= BS_CELLS) return { result: 'miss' };
  const ship = fleet.ships.find((s) => s.cells.includes(cell));
  if (!ship) return { result: 'miss' };

  const hitsAfter = new Set([...priorHits, cell]);
  const sunk = ship.cells.every((c) => hitsAfter.has(c));
  return sunk ? { result: 'hit', sunkShip: ship.type } : { result: 'hit' };
}

/** All ship cells that have been hit (for own-fleet display). */
export function hitCellsFromShots(
  shots: { cell: number; result: ShotResult }[],
): number[] {
  return shots.filter((s) => s.result === 'hit').map((s) => s.cell);
}

export function isFleetSunk(
  fleet: Fleet,
  shotsAgainst: { cell: number; result: ShotResult }[],
): boolean {
  const hits = new Set(hitCellsFromShots(shotsAgainst));
  return fleet.ships.every((ship) => ship.cells.every((c) => hits.has(c)));
}

export function occupiedSet(ships: Fleet['ships']): Set<number> {
  const s = new Set<number>();
  for (const ship of ships) for (const c of ship.cells) s.add(c);
  return s;
}
