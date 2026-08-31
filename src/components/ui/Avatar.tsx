import { cn } from '../../lib/cn';

interface AvatarProps {
  name?: string;
  color?: string;
  emoji?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ name, color = '#6366f1', emoji, initials, size = 'md', className }: AvatarProps) {
  // Emojis sized large enough to read at a glance (~⅓ bigger than typical UI avatars)
  const s = { sm: 'w-10 h-10 text-xl', md: 'w-12 h-12 text-2xl', lg: 'w-16 h-16 text-3xl' }[size];
  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-semibold text-white shrink-0 leading-none', s, className)}
      style={{ backgroundColor: color }}
      title={name}
    >
      {emoji || initials}
    </div>
  );
}
