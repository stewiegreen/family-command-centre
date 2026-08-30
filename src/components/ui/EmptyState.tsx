import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-4 text-muted">
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="font-semibold text-fg mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}
