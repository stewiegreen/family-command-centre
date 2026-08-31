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
  // Slightly larger emoji text so faces/icons are easier to see at a glance
  const s = { sm: 'w-8 h-8 text-base', md: 'w-10 h-10 text-lg', lg: 'w-12 h-12 text-2xl' }[size];
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
