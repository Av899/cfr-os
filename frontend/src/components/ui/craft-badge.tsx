import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CraftBadgeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * CFR OS Craft badge ("Brewed on La Marzocco", "Baked in Unox Combi", etc.)
 * Pill with amber/latte dot, small uppercase tracked font.
 */
export function CraftBadge({ children, className }: CraftBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[14px] bg-foreground text-background px-3 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase select-none',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}
