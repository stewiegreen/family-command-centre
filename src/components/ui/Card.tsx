import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'> {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Card({ children, className, onClick, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      onClick={onClick}
      style={{ boxShadow: 'var(--app-shadow-card)', ...style }}
      className={cn(
        'bg-elevated border border-border p-4 sm:p-[1.15rem] transition-shadow duration-150',
        // radius + blur from Theme Studio (--app-card-*)
        '[border-radius:var(--app-card-radius,1rem)]',
        '[backdrop-filter:blur(var(--app-card-blur,6px))]',
        onClick && 'cursor-pointer hover:border-border-strong transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}
