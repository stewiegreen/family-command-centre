// src/pages/comics/Section.tsx
// Horizontal rail section used on the comics home and browse views.

import type { ReactNode } from 'react';

export function Section({
  title,
  subtitle,
  children,
  empty,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  empty?: boolean;
  action?: ReactNode;
}) {
  if (empty) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-fg tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
        {children}
      </div>
    </section>
  );
}
