/**
 * Party Map — shared adventure path advanced by approved quests.
 * Parent preview only for now; kids never see the UI until enabled later.
 */

import type { FamilyData, PartyMapState, Quest, QuestDifficulty } from '../types';

export type PartyRegion = {
  id: string;
  name: string;
  emoji: string;
  /** Steps required to *arrive* here (from season start). */
  atStep: number;
  blurb: string;
};

/** Fixed path for season 1 — tune freely later. */
export const PARTY_REGIONS: PartyRegion[] = [
  {
    id: 'home',
    name: 'Home Base',
    emoji: '🏠',
    atStep: 0,
    blurb: 'The party gathers. Chores await beyond the door.',
  },
  {
    id: 'laundry',
    name: 'Laundry Swamp',
    emoji: '🫧',
    atStep: 5,
    blurb: 'Socks vanish into the mire. Only folded towels light the way.',
  },
  {
    id: 'kitchen',
    name: 'Dragon’s Kitchen',
    emoji: '🍳',
    atStep: 12,
    blurb: 'Dishes roar. The sink is a boss fight.',
  },
  {
    id: 'garage',
    name: 'Goblin Garage',
    emoji: '🔧',
    atStep: 20,
    blurb: 'Bikes and bins. Goblins hate tidy shelves.',
  },
  {
    id: 'garden',
    name: 'Whispering Garden',
    emoji: '🌿',
    atStep: 30,
    blurb: 'Weeds plot rebellion. Heroes pull them by the root.',
  },
  {
    id: 'tower',
    name: 'Chore Tower',
    emoji: '🏰',
    atStep: 42,
    blurb: 'Stairs of laundry, floors of vacuum. Almost the summit.',
  },
  {
    id: 'peak',
    name: 'Summit of Done',
    emoji: '⛰️',
    atStep: 55,
    blurb: 'The party did the work. The map remembers.',
  },
];

const STEP_WEIGHT: Record<QuestDifficulty, number> = {
  easy: 1,
  medium: 2,
  epic: 3,
};

export function stepsForQuest(quest: Pick<Quest, 'difficulty'>): number {
  return STEP_WEIGHT[quest.difficulty || 'medium'] ?? 2;
}

export function regionForSteps(steps: number): PartyRegion {
  let current = PARTY_REGIONS[0]!;
  for (const r of PARTY_REGIONS) {
    if (steps >= r.atStep) current = r;
  }
  return current;
}

export function unlockedRegions(steps: number): PartyRegion[] {
  return PARTY_REGIONS.filter((r) => steps >= r.atStep);
}

export function nextRegion(steps: number): PartyRegion | null {
  return PARTY_REGIONS.find((r) => r.atStep > steps) || null;
}

export function ensurePartyMap(state?: PartyMapState | null): PartyMapState {
  if (state && typeof state.steps === 'number') {
    const steps = Math.max(0, Math.floor(state.steps));
    const region = regionForSteps(steps);
    return {
      seasonId: state.seasonId || 'season-1',
      steps,
      currentRegionId: region.id,
      unlockedRegionIds: unlockedRegions(steps).map((r) => r.id),
      log: Array.isArray(state.log) ? state.log.slice(0, 30) : [],
      seasonStartedAt: state.seasonStartedAt || new Date().toISOString(),
    };
  }
  const region = PARTY_REGIONS[0]!;
  return {
    seasonId: 'season-1',
    steps: 0,
    currentRegionId: region.id,
    unlockedRegionIds: [region.id],
    log: [],
    seasonStartedAt: new Date().toISOString(),
  };
}

/** Advance the shared map when a quest is approved. Idempotent per quest id. */
export function advancePartyMapOnApprove(
  data: FamilyData,
  opts: { quest: Quest; forId: string; at?: string },
): FamilyData {
  const at = opts.at || new Date().toISOString();
  const map = ensurePartyMap(data.partyMap);
  // Don't double-count the same quest approval
  if (map.log.some((e) => e.questId === opts.quest.id)) {
    return { ...data, partyMap: map };
  }
  const gain = stepsForQuest(opts.quest);
  const steps = map.steps + gain;
  const before = regionForSteps(map.steps);
  const after = regionForSteps(steps);
  const reachedNew = after.id !== before.id;

  const entry = {
    id: `map:${opts.quest.id}`,
    at,
    questId: opts.quest.id,
    memberId: opts.forId,
    label: opts.quest.title,
    stepsGained: gain,
    regionId: after.id,
    regionUnlock: reachedNew ? after.id : undefined,
  };

  return {
    ...data,
    partyMap: {
      ...map,
      steps,
      currentRegionId: after.id,
      unlockedRegionIds: unlockedRegions(steps).map((r) => r.id),
      log: [entry, ...map.log].slice(0, 30),
    },
  };
}

export function resetPartyMap(seasonId?: string): PartyMapState {
  const region = PARTY_REGIONS[0]!;
  return {
    seasonId: seasonId || `season-${Date.now()}`,
    steps: 0,
    currentRegionId: region.id,
    unlockedRegionIds: [region.id],
    log: [],
    seasonStartedAt: new Date().toISOString(),
  };
}
