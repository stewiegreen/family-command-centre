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
  const s = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' }[size];
  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-semibold text-white shrink-0', s, className)}
      style={{ backgroundColor: color }}
      title={name}
    >
      {emoji || initials}
    </div>
  );
}
