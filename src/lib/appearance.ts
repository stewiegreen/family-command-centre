import type { FamilyData, Member } from '../types';

/** Resolve display emoji/color (appearance override wins). */
export function withAppearance(member: Member, data: Pick<FamilyData, 'appearance'>): Member {
  const a = data.appearance?.[member.id];
  if (!a) return member;
  return {
    ...member,
    emoji: a.emoji ?? member.emoji,
    color: a.color ?? member.color,
  };
}

export function memberListWithAppearance(data: FamilyData): Member[] {
  return data.members.map((m) => withAppearance(m, data));
}
