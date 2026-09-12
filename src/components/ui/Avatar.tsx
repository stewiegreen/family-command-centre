import { cn } from '../../lib/cn';
import { avatarFlairBoxShadow, avatarFlairShapeClass } from '../../lib/flair';
import { isAnyPortraitId, portraitSrc } from '../../lib/portraitPath';

interface AvatarProps {
  name?: string;
  color?: string;
  emoji?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Portrait id — roster "03_12" or cobra "cobra_01_09" */
  avatarPortraitId?: string | null;
  /** Custom uploaded photo URL (R2). Wins over portrait packs when set. */
  avatarCustomUrl?: string | null;
  avatarFlairId?: string;
  avatarFlairShape?: string;
  avatarFlairColor?: string;
}

export function Avatar({
  name,
  color = '#6366f1',
  emoji,
  initials,
  size = 'md',
  className,
  avatarPortraitId,
  avatarCustomUrl,
  avatarFlairShape,
  avatarFlairColor,
}: AvatarProps) {
  const s = { sm: 'w-10 h-10 text-xl', md: 'w-12 h-12 text-2xl', lg: 'w-16 h-16 text-3xl' }[size];
  const shape = avatarFlairShapeClass(avatarFlairShape || 'circle');
  const glow = avatarFlairBoxShadow(avatarFlairColor);
  const custom = (avatarCustomUrl || '').trim() || null;
  const packSrc = portraitSrc(avatarPortraitId);
  const src = custom || (isAnyPortraitId(avatarPortraitId) ? packSrc : null);
  const useImage = !!src;

  return (
    <div
      className={cn(
        'flex items-center justify-center font-semibold text-white shrink-0 leading-none overflow-hidden',
        s,
        shape,
        className,
      )}
      style={{
        backgroundColor: useImage ? '#f8fafc' : color,
        boxShadow: glow,
      }}
      title={name}
    >
      {useImage ? (
        <img
          src={src!}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        emoji || initials
      )}
    </div>
  );
}
