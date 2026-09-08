import { cn } from '../../lib/cn';
import { avatarFlairBoxShadow, avatarFlairShapeClass } from '../../lib/flair';

interface AvatarProps {
  name?: string;
  color?: string;
  emoji?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** @deprecated legacy preset id — ignored when shape/color set */
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
  avatarFlairShape,
  avatarFlairColor,
}: AvatarProps) {
  const s = { sm: 'w-10 h-10 text-xl', md: 'w-12 h-12 text-2xl', lg: 'w-16 h-16 text-3xl' }[size];
  const shape = avatarFlairShapeClass(avatarFlairShape || 'circle');
  const glow = avatarFlairBoxShadow(avatarFlairColor);
  return (
    <div
      className={cn(
        'flex items-center justify-center font-semibold text-white shrink-0 leading-none',
        s,
        shape,
        className,
      )}
      style={{
        backgroundColor: color,
        boxShadow: glow,
      }}
      title={name}
    >
      {emoji || initials}
    </div>
  );
}
