import React from 'react';

interface CfrLogoProps {
  variant?: 'full' | 'mark';
  className?: string;
  color?: string;
}

/**
 * CFR OS Brand Wordmark & Icon Mark Component
 * Uses CSS masking over the official high-resolution alpha assets,
 * allowing dynamic coloring (Espresso #1E1B16, Latte #C9A782, or Cream #F6F4ED).
 */
export function CfrLogo({ variant = 'full', className = '', color }: CfrLogoProps) {
  if (variant === 'mark') {
    return (
      <div
        role="img"
        aria-label="CFR Coffee Mark"
        style={{
          maskImage: 'url(/cfr-mark.png)',
          WebkitMaskImage: 'url(/cfr-mark.png)',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          backgroundColor: color || 'currentColor',
          aspectRatio: '105/131',
        }}
        className={`inline-block ${className || 'w-8'}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label="CFR Coffee Logo"
      style={{
        maskImage: 'url(/cfr-logo.png)',
        WebkitMaskImage: 'url(/cfr-logo.png)',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        backgroundColor: color || 'currentColor',
        aspectRatio: '578/319',
      }}
      className={`inline-block ${className || 'w-48'}`}
    />
  );
}
