import type { FamilyData, Member } from '../types';

/** sessionStorage key — must match AppContext profile switch. */
export const PROFILE_OVERRIDE_KEY = 'fcc_profile_override';

/**
 * Who is acting *right now* for writes (quests, todos, shop).
 * Prefer the profile-switch override, then settings.currentUserId.
 * Call this *inside* `update((d) => …)` so we never close over a stale React `me`.
 */
export function actingMemberId(data: FamilyData): string | undefined {
  try {
    const override = sessionStorage.getItem(PROFILE_OVERRIDE_KEY);
    if (override && data.members.some((m) => m.id === override)) return override;
  } catch {
    /* private mode / SSR */
  }
  const id = data.settings?.currentUserId;
  if (id && data.members.some((m) => m.id === id)) return id;
  return data.members[0]?.id;
}

export function actingMember(data: FamilyData): Member | undefined {
  const id = actingMemberId(data);
  if (!id) return undefined;
  return data.members.find((m) => m.id === id);
}
