'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export function Stepper({
  value,
  min = 1,
  max = 99,
  step = 1,
  onChange,
  className,
  size = 'md',
  ariaLabel = 'Quantity',
}: StepperProps) {
  const handleDec = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = Math.max(min, value - step);
    onChange(next);
  };

  const handleInc = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = Math.min(max, value + step);
    onChange(next);
  };

  const btnSizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-11 h-11 text-base',
    lg: 'w-12 h-12 text-lg',
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full border border-input bg-card shadow-xs transition-colors',
        className,
      )}
    >
      <button
        type="button"
        onClick={handleDec}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={cn(
          'inline-flex items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed',
          btnSizes[size],
        )}
      >
        <Minus className="size-4" />
      </button>
      <output
        aria-live="polite"
        className="min-w-8 text-center font-semibold text-foreground tabular-nums select-none px-1"
      >
        {value}
      </output>
      <button
        type="button"
        onClick={handleInc}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={cn(
          'inline-flex items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed',
          btnSizes[size],
        )}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
