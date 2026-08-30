import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
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
