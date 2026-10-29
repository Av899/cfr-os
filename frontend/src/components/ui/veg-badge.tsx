import * as React from 'react';
import { cn } from '@/lib/utils';

export interface VegBadgeProps {
  className?: string;
  size?: number;
}

/**
 * Standard FSSAI Vegetarian mark as specified by CFR OS:
 * A green square frame with a green circular dot inside.
 * Appears on the receipt header and menu footer.
 */
export function VegBadge({ className, size = 20 }: VegBadgeProps) {
  return (
    <span
      role="img"
      aria-label="Vegetarian"
      style={{ width: `${size}px`, height: `${size}px` }}
      className={cn(
        'inline-flex items-center justify-center border-2 border-[#1B7F3B] rounded-[3px] bg-white shrink-0 align-middle',
        className,
      )}
    >
      <span
        style={{ width: `${Math.round(size * 0.45)}px`, height: `${Math.round(size * 0.45)}px` }}
        className="rounded-full bg-[#1B7F3B]"
      />
    </span>
  );
}
