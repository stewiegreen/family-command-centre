import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Card({ children, className, onClick, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        'bg-elevated backdrop-blur-sm border border-border rounded-2xl p-4 shadow-sm',
        onClick && 'cursor-pointer hover:border-border-strong transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}
