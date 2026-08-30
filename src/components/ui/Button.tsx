import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export function Button({ children, variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const v = {
    primary: 'bg-accent hover:bg-accent-hover text-accent-ink',
    secondary: 'bg-surface-2 hover:bg-surface-3 text-fg border border-border-strong',
    ghost: 'bg-transparent hover:bg-nav-hover text-fg-secondary',
    danger: 'bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/25',
  }[variant];
  const s = {
    sm: 'px-3 py-1.5 text-sm rounded-xl',
    md: 'px-4 py-2 text-sm rounded-xl',
    lg: 'px-5 py-2.5 rounded-2xl',
    icon: 'p-2 rounded-xl',
  }[size];
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        v,
        s,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
