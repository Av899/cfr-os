'use client';

import React, { useState, useEffect } from 'react';
import { Coffee, Sliders } from 'lucide-react';
import api from '@/lib/api';
import { BaristaDialInModal, CfrBeanLot, CfrDialInRecord } from './BaristaDialInModal';

interface BeanFreshnessPillProps {
  className?: string;
}

export function BeanFreshnessPill({ className = '' }: BeanFreshnessPillProps) {
  const [activeLot, setActiveLot] = useState<CfrBeanLot | null>(null);
  const [latestDialIn, setLatestDialIn] = useState<CfrDialInRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const [lotRes, dialRes] = await Promise.all([
          api.get('/cfr/coffee/lots/active').catch(() => ({ data: { active_lot: null } })),
          api.get('/cfr/coffee/dial-in/latest').catch(() => ({ data: { latest: null } })),
        ]);

        if (!active) return;

        if (lotRes.data?.active_lot) {
          setActiveLot(lotRes.data.active_lot);
        }
        if (dialRes.data?.latest) {
          setLatestDialIn(dialRes.data.latest);
        }
      } catch {
        // Best-effort non-blocking badge fetch
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshKey]);

  if (!activeLot) {
    return (
      <>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={`touch-target shrink-0 flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors ${className}`}
          title="Specialty Coffee Dial-in & Freshness"
        >
          <Coffee className="w-3.5 h-3.5 text-amber-500" />
          <span>Calibrate Espresso</span>
        </button>
        <BaristaDialInModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onDialInLogged={() => setRefreshKey((k) => k + 1)}
        />
      </>
    );
  }

  const freshness = activeLot.freshness;
  const stage = freshness?.stage || 'PEAK';

  const badgeTheme = {
    PEAK: {
      border: 'border-emerald-500/40 hover:border-emerald-500/70',
      bg: 'bg-emerald-500/10',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-400',
      tag: `Peak D${freshness?.days_off_roast ?? 0}`,
    },
    DEGASSING: {
      border: 'border-amber-500/40 hover:border-amber-500/70',
      bg: 'bg-amber-500/10',
      dot: 'bg-amber-500',
      text: 'text-amber-700 dark:text-amber-400',
      tag: `Degas D${freshness?.days_off_roast ?? 0}`,
    },
    FADING: {
      border: 'border-orange-500/40 hover:border-orange-500/70',
      bg: 'bg-orange-500/10',
      dot: 'bg-orange-500',
      text: 'text-orange-700 dark:text-orange-400',
      tag: `Fade D${freshness?.days_off_roast ?? 0}`,
    },
    STALE: {
      border: 'border-rose-500/40 hover:border-rose-500/70',
      bg: 'bg-rose-500/10',
      dot: 'bg-rose-500',
      text: 'text-rose-700 dark:text-rose-400',
      tag: `Stale D${freshness?.days_off_roast ?? 0}`,
    },
  }[stage];

  // Shorten bean lot name for topbar
  const shortLotName = activeLot.lot_name
    ? activeLot.lot_name.replace(/\s*\(Lot.*?\)/i, '').replace(/Specialty|Reserve/gi, '').trim()
    : 'Espresso';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`touch-target shrink-0 flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-xs font-semibold transition-all shadow-sm ${badgeTheme.border} ${className}`}
        title={`${activeLot.lot_name} • ${freshness?.label} • ${freshness?.guidance}`}
      >
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${badgeTheme.dot} animate-pulse`} />
          <Coffee className="w-3.5 h-3.5 text-foreground/80" />
          <span className="text-foreground max-w-[130px] truncate hidden md:inline-block">
            {shortLotName}
          </span>
        </span>

        {/* Freshness Badge */}
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold ${badgeTheme.bg} ${badgeTheme.text}`}>
          {badgeTheme.tag}
        </span>

        {/* Extraction Ratio Pill */}
        {latestDialIn && (
          <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
            <Sliders className="w-3 h-3 text-primary" />
            1:{latestDialIn.ratio}
          </span>
        )}
      </button>

      <BaristaDialInModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDialInLogged={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}

export default BeanFreshnessPill;
