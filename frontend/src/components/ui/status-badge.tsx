import * as React from 'react';
import { cn } from '@/lib/utils';

export type CfrStatus = 'new' | 'prep' | 'ready' | 'attn' | 'late';

const STATUS_CONFIG: Record<CfrStatus, { label: string; dotClass: string }> = {
  new: {
    label: 'New',
    dotClass: 'bg-status-new',
  },
  prep: {
    label: 'Preparing',
    dotClass: 'bg-status-prep',
  },
  ready: {
    label: 'Ready',
    dotClass: 'bg-status-ready',
  },
  attn: {
    label: 'Needs attention',
    dotClass: 'bg-status-attn',
  },
  late: {
    label: 'Late',
    dotClass: 'bg-status-late',
  },
};

export interface StatusBadgeProps {
  status: CfrStatus;
  label?: string;
  className?: string;
}

/**
 * CFR OS operational status badge.
 * Always pairs a status dot with text so color is never the only signal.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  const displayLabel = label ?? cfg.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-xs',
        className,
      )}
    >
      <span className={cn('size-2.5 rounded-full shrink-0', cfg.dotClass)} aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}
