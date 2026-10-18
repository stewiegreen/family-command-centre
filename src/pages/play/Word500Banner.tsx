// src/pages/play/Word500Banner.tsx
// Family daily Word500 results strip (mirrors WordleDailyBanner).

import { todaySeed } from '../../lib/wordle';
import type { FamilyData, Member } from '../../types';

export function Word500Banner({
  daily,
  getMember,
}: {
  daily: FamilyData['word500Daily'];
  getMember: (id: string) => Member | undefined;
}) {
  const seed = todaySeed();
  const solves =
    daily && daily.seed === seed
      ? [...daily.solves].sort(
          (a, b) => b.points - a.points || a.guesses - b.guesses || a.at.localeCompare(b.at),
        )
      : [];

  if (solves.length === 0) {
    return (
      <p className="text-xs text-muted bg-surface-2/50 rounded-lg px-3 py-2">
        Today&apos;s Word500 — nobody has cracked it yet. Be the first!
      </p>
    );
  }

  const names = solves.map((s) => {
    const m = getMember(s.memberId);
    const label = m?.name || s.name;
    return `${label} (${s.guesses}/8 · ${s.points} pts)`;
  });

  return (
    <p className="text-xs text-fg bg-accent/10 border border-accent/25 rounded-lg px-3 py-2">
      <span className="font-semibold text-accent">Today&apos;s Word500: </span>
      {names.join(' · ')}
    </p>
  );
}
