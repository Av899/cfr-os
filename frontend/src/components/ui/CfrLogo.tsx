'use client';

import React from 'react';

interface CfrLogoProps {
  variant?: 'mark' | 'full' | 'lockup-horizontal';
  className?: string;
  tone?: 'espresso' | 'cream' | 'auto';
  showTagline?: boolean;
}

/**
 * CFR OS Official Brand Wordmark & Mark Component
 * Built strictly according to the CFR Identity Guidelines:
 * - Solid Espresso (#1E1B16) on Cream (#F6F4ED) for light mode
 * - Reversed Solid Cream (#F6F4ED) on Espresso (#1E1B16) for night/dark mode
 * - Zero gradients, tints, or brown logo treatments.
 * - Proportions preserved with both steam ribbons.
 */
export function CfrLogo({
  variant = 'mark',
  className = '',
  tone = 'auto',
  showTagline = true,
}: CfrLogoProps) {
  // Determine color based on tone
  const colorStyle =
    tone === 'espresso'
      ? '#1E1B16'
      : tone === 'cream'
      ? '#F6F4ED'
      : 'currentColor';

  if (variant === 'mark') {
    return (
      <div
        role="img"
        aria-label="Coffee First Ritual Mark"
        style={{
          maskImage: 'url(/cfr-mark.png)',
          WebkitMaskImage: 'url(/cfr-mark.png)',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          backgroundColor: colorStyle,
          aspectRatio: '182/195',
        }}
        className={`inline-block shrink-0 ${className || 'w-8 h-8'}`}
      />
    );
  }

  if (variant === 'lockup-horizontal') {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <div
          role="img"
          aria-label="Coffee First Ritual Mark"
          style={{
            maskImage: 'url(/cfr-mark.png)',
            WebkitMaskImage: 'url(/cfr-mark.png)',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            backgroundColor: colorStyle,
            aspectRatio: '182/195',
          }}
          className="w-8 h-8 shrink-0"
        />
        <div className="flex flex-col leading-none">
          <span className="font-light tracking-tight text-base font-sans">
            Coffee First Ritual
          </span>
          {showTagline && (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Good Coffee. Better Days.
            </span>
          )}
        </div>
      </div>
    );
  }

  // variant === 'full' (stacked)
  return (
    <div className={`inline-flex flex-col items-center text-center ${className}`}>
      <div
        role="img"
        aria-label="Coffee First Ritual Mark"
        style={{
          maskImage: 'url(/cfr-mark.png)',
          WebkitMaskImage: 'url(/cfr-mark.png)',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          backgroundColor: colorStyle,
          aspectRatio: '182/195',
        }}
        className="w-16 h-16 mb-2"
      />
      <h2 className="text-xl font-light tracking-tight font-sans">
        Coffee First Ritual
      </h2>
      {showTagline && (
        <p className="text-xs tracking-wider uppercase text-muted-foreground mt-0.5 font-sans">
          Good Coffee. Better Days.
        </p>
      )}
    </div>
  );
}

export default CfrLogo;
