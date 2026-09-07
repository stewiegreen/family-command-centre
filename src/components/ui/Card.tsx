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
        'bg-elevated backdrop-blur-sm border border-border rounded-2xl p-4 sm:p-[1.15rem] transition-shadow duration-150',
        onClick && 'cursor-pointer hover:border-border-strong transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}
