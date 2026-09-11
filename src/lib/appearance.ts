import type { FamilyData, Member } from '../types';

/** Resolve display emoji/color/portrait (appearance override wins). */
export function withAppearance(member: Member, data: Pick<FamilyData, 'appearance'>): Member {
  const a = data.appearance?.[member.id];
  if (!a) return member;
  return {
    ...member,
    emoji: a.emoji ?? member.emoji,
    color: a.color ?? member.color,
    avatarPortraitId:
      a.avatarPortraitId !== undefined ? a.avatarPortraitId : member.avatarPortraitId,
    avatarFlairId: a.avatarFlairId ?? member.avatarFlairId,
    avatarFlairShape: a.avatarFlairShape ?? member.avatarFlairShape,
    avatarFlairColor: a.avatarFlairColor ?? member.avatarFlairColor,
    nameFlairText: a.nameFlairText ?? member.nameFlairText,
    nameFlairColor: a.nameFlairColor ?? member.nameFlairColor,
  };
}

export function memberListWithAppearance(data: FamilyData): Member[] {
  return data.members.map((m) => withAppearance(m, data));
}
