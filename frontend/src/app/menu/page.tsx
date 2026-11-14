'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Coffee,
  Sparkles,
  Flame,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Leaf,
  Info,
  Music,
  Share2,
  Check,
} from 'lucide-react';
import { CfrLogo } from '@/components/ui/CfrLogo';
import api from '@/lib/api';

interface CfrMenuItem {
  id: string;
  section_id: string;
  name: string;
  tagline?: string | null;
  price_paise: number;
  price_rupees: number;
  description: string;
  tasting_notes: string;
  craft_story: string;
  origin?: string | null;
  dietary_flags: string;
  is_available: boolean;
  sort_order: number;
  calories?: number | null;
}

interface CfrMenuSection {
  id: string;
  title: string;
  subtitle: string;
  sort_order: number;
  items: CfrMenuItem[];
}

interface MenuData {
  brand: string;
  location: string;
  dietary_policy: string;
  tax_policy: string;
  sections: CfrMenuSection[];
}

interface AmbienceData {
  scene: string;
  title: string;
  color_temp_kelvin: number;
  playlist_name: string;
}

export default function GuestDigitalMenuPage() {
  const [menuData, setMenuData] = useState<MenuData | null>(null);
  const [activeBean, setActiveBean] = useState<{ name: string; stage: string; days: number } | null>(null);
  const [ambience, setAmbience] = useState<AmbienceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState<string>('sec_espresso');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEGAN'>('ALL');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchMenuAndContext = async () => {
      try {
        setLoading(true);
        const [menuRes, beanRes, ambRes] = await Promise.all([
          api.get('/cfr/menu').catch(() => ({ data: null })),
          api.get('/cfr/coffee/lots/active').catch(() => ({ data: { active_lot: null } })),
          api.get('/cfr/hardware/ambience/current').catch(() => ({ data: { ambience: null } })),
        ]);

        if (!active) return;

        if (menuRes.data?.sections) {
          setMenuData(menuRes.data);
          if (menuRes.data.sections.length > 0) {
            setActiveSectionId(menuRes.data.sections[0].id);
          }
        }

        if (beanRes.data?.active_lot) {
          const lot = beanRes.data.active_lot;
          setActiveBean({
            name: lot.lot_name,
            stage: lot.freshness?.stage || 'PEAK',
            days: lot.freshness?.days_off_roast || 0,
          });
        }

        if (ambRes.data?.ambience) {
          setAmbience(ambRes.data.ambience);
        }
      } catch (err) {
        console.error('[CFR Menu] Error fetching menu:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchMenuAndContext();

    return () => {
      active = false;
    };
  }, []);

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItemId((prev) => (prev === id ? null : id));
  };

  // Filtered Sections
  const filteredSections = useMemo(() => {
    if (!menuData) return [];

    return menuData.sections
      .map((sec) => {
        const filteredItems = sec.items.filter((item) => {
          // Dietary Filter
          if (dietaryFilter === 'VEGAN' && !item.dietary_flags.includes('VEGAN')) {
            return false;
          }
          // Search Filter
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchesName = item.name.toLowerCase().includes(q);
            const matchesNotes = item.tasting_notes.toLowerCase().includes(q);
            const matchesStory = item.craft_story.toLowerCase().includes(q);
            const matchesOrigin = (item.origin || '').toLowerCase().includes(q);
            return matchesName || matchesNotes || matchesStory || matchesOrigin;
          }
          return true;
        });

        return {
          ...sec,
          items: filteredItems,
        };
      })
      .filter((sec) => sec.items.length > 0);
  }, [menuData, dietaryFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#F8F6F0] text-[#1E1B16] font-sans antialiased selection:bg-[#C9A782]/30">
      {/* Luxury Brand Header */}
      <header className="sticky top-0 z-40 bg-[#F8F6F0]/95 backdrop-blur-md border-b border-[#E5DFD5] transition-all">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CfrLogo variant="mark" className="w-7 h-7 text-[#2C241D]" />
            <div>
              <h1 className="text-sm font-extrabold tracking-widest uppercase text-[#1E1B16]">
                Coffee First Ritual
              </h1>
              <p className="text-[10px] tracking-wider font-medium text-[#7A6E65] uppercase">
                Specialty Roastery & Artisanal Boulangerie • Sector 12
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-2 rounded-full border border-[#E5DFD5] bg-[#FFFFFF] hover:bg-[#F0ECE1] text-[#7A6E65] transition-colors"
              title="Share Menu URL"
              aria-label="Share Menu URL"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Live Freshness & Ambience Banner */}
        <div className="bg-[#FAF8F5] border-t border-b border-[#EBE5DC] px-4 py-1.5 text-[11px] text-[#7A6E65]">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Today&apos;s Espresso: <strong className="text-[#1E1B16]">{activeBean ? activeBean.name : 'Specialty Reserve'}</strong>
              </span>
              {activeBean && (
                <span className="font-mono text-[10px] bg-[#EFECE6] px-1.5 py-0.5 rounded text-[#2C241D]">
                  Day {activeBean.days} ({activeBean.stage})
                </span>
              )}
            </div>

            {ambience && (
              <div className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-[#8C8075]">
                <Music className="w-3 h-3 text-[#C9A782]" />
                <span>{ambience.title} ({ambience.color_temp_kelvin}K)</span>
              </div>
            )}
          </div>
        </div>

        {/* Search & Dietary Filter Bar */}
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8C8075]" />
            <input
              type="text"
              placeholder="Search by flavor, terroir, bean or craft..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FFFFFF] border border-[#E5DFD5] rounded-full focus:outline-none focus:border-[#C9A782] text-[#1E1B16] placeholder:text-[#8C8075]"
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                dietaryFilter === 'ALL'
                  ? 'bg-[#1E1B16] text-[#F8F6F0]'
                  : 'bg-[#FFFFFF] border border-[#E5DFD5] text-[#7A6E65] hover:bg-[#F0ECE1]'
              }`}
            >
              All (100% Veg)
            </button>
            <button
              onClick={() => setDietaryFilter('VEGAN')}
              className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${
                dietaryFilter === 'VEGAN'
                  ? 'bg-[#2E5E3A] text-[#F8F6F0]'
                  : 'bg-[#FFFFFF] border border-[#E5DFD5] text-[#7A6E65] hover:bg-[#F0ECE1]'
              }`}
            >
              <Leaf className="w-3 h-3" /> Plant-Based
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs (Horizontally Scrollable) */}
        <div className="max-w-3xl mx-auto px-4 overflow-x-auto no-scrollbar flex items-center gap-2 py-1.5 border-t border-[#EBE5DC]">
          {menuData?.sections.map((sec) => (
            <a
              key={sec.id}
              href={`#${sec.id}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveSectionId(sec.id);
                document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeSectionId === sec.id
                  ? 'bg-[#C9A782] text-[#1E1B16]'
                  : 'text-[#7A6E65] hover:text-[#1E1B16] hover:bg-[#F0ECE1]'
              }`}
            >
              {sec.title}
            </a>
          ))}
        </div>
      </header>

      {/* Main Menu Body */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-12">
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <Coffee className="w-8 h-8 text-[#C9A782] animate-bounce mx-auto" />
            <p className="text-xs uppercase tracking-widest text-[#7A6E65]">
              Decanting Tasting Notes & Fresh Batches...
            </p>
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <Info className="w-8 h-8 text-[#C9A782] mx-auto" />
            <p className="text-sm font-bold text-[#1E1B16]">No items found matching your filter</p>
            <p className="text-xs text-[#7A6E65]">Try clearing your search query or selecting &ldquo;All&rdquo;.</p>
          </div>
        ) : (
          filteredSections.map((sec) => (
            <section key={sec.id} id={sec.id} className="scroll-mt-40 space-y-4">
              {/* Section Header */}
              <div className="border-b border-[#D8D0C5] pb-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-extrabold tracking-wide uppercase text-[#1E1B16]">
                    {sec.title}
                  </h2>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#8C8075]">
                    {sec.items.length} Offerings
                  </span>
                </div>
                <p className="text-xs text-[#7A6E65] italic mt-0.5">{sec.subtitle}</p>
              </div>

              {/* Items Grid / List */}
              <div className="space-y-4">
                {sec.items.map((item) => {
                  const isExpanded = expandedItemId === item.id;
                  const isPlantBased = item.dietary_flags.includes('VEGAN');

                  return (
                    <article
                      key={item.id}
                      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                        !item.is_available
                          ? 'bg-[#EFECE6]/60 border-[#D8D0C5] opacity-60'
                          : isExpanded
                          ? 'bg-[#FFFFFF] border-[#C9A782] shadow-sm'
                          : 'bg-[#FFFFFF] border-[#E5DFD5] hover:border-[#D8D0C5]'
                      }`}
                    >
                      <div className="p-4 sm:p-5 space-y-2.5">
                        {/* Top Line: Name & Price */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-extrabold text-[#1E1B16] leading-snug">
                                {item.name}
                              </h3>
                              {isPlantBased && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF2EC] text-[#2E5E3A]">
                                  <Leaf className="w-2.5 h-2.5" /> Plant-Based
                                </span>
                              )}
                              {!item.is_available && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-600 border border-rose-500/20">
                                  86&apos;d • Sold Out
                                </span>
                              )}
                            </div>
                            {item.tagline && (
                              <p className="text-[11px] font-mono text-[#8C8075]">
                                {item.tagline}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-base font-extrabold font-mono text-[#1E1B16]">
                              ₹{item.price_rupees}
                            </span>
                            <span className="block text-[10px] text-[#8C8075]">+5% GST</span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-[#524941] leading-relaxed">
                          {item.description}
                        </p>

                        {/* Terroir & Origin Tag */}
                        {item.origin && (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#7A6E65] pt-0.5">
                            <MapPin className="w-3 h-3 text-[#C9A782] shrink-0" />
                            <span className="truncate">{item.origin}</span>
                          </div>
                        )}

                        {/* Tasting Notes Highlight Pill */}
                        <div className="flex items-center gap-1.5 text-xs text-[#2C241D] bg-[#F7F4EE] px-3 py-1.5 rounded-lg border border-[#EBE5DC]">
                          <Sparkles className="w-3.5 h-3.5 text-[#C9A782] shrink-0" />
                          <span className="font-semibold text-[11px]">Tasting:</span>
                          <span className="text-[11px] text-[#524941] italic truncate">{item.tasting_notes}</span>
                        </div>

                        {/* Expand Craft Story Button */}
                        <div className="pt-1 flex items-center justify-between border-t border-[#F0ECE1]">
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#7A6E65] hover:text-[#1E1B16] transition-colors"
                          >
                            <span>{isExpanded ? 'Hide Craft Story' : '+ Terroir & Craft Story'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          {item.calories && (
                            <span className="text-[10px] font-mono text-[#8C8075]">
                              {item.calories} kcal
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Expandable Craft Story Drawer */}
                      {isExpanded && (
                        <div className="px-4 pb-4 sm:px-5 sm:pb-5 pt-0 border-t border-[#F0ECE1] bg-[#FAF8F5]/80 space-y-2.5 text-xs">
                          <div className="pt-3 space-y-1">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-[#8C8075] block">
                              Culinary & Extraction Craft
                            </span>
                            <p className="text-[#3D352E] leading-relaxed">{item.craft_story}</p>
                          </div>

                          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#EBE5DC] text-[11px] text-[#7A6E65]">
                            <span className="flex items-center gap-1">
                              <Flame className="w-3 h-3 text-amber-500" />
                              Artisanal Eggless • Strict Zero-Tolerance Invariant
                            </span>
                            <span className="font-mono text-[10px]">
                              SKU #{item.id.replace('item_', '').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}

        {/* Legal & Compliance Footer Card */}
        <footer className="rounded-3xl border border-[#D8D0C5] bg-[#FFFFFF] p-6 sm:p-8 space-y-4 text-center">
          <CfrLogo variant="full" className="w-40 mx-auto text-[#1E1B16]" />

          <div className="space-y-1">
            <h4 className="text-sm font-extrabold tracking-wide uppercase text-[#1E1B16]">
              Coffee First Ritual (CFR)
            </h4>
            <p className="text-xs text-[#7A6E65]">
              Urban Estate, Sector 12, Karnal, Haryana 132001
            </p>
          </div>

          <div className="h-px w-24 bg-[#C9A782]/40 mx-auto" />

          {/* Mandatory Invariant Legal Disclaimers */}
          <div className="space-y-1 text-xs text-[#524941]">
            <p className="font-bold text-[#2E5E3A]">
              🌱 100% Vegetarian & Artisanal Eggless Establishment
            </p>
            <p className="text-[11px] text-[#7A6E65]">
              Zero-tolerance kitchen policy: No gelatin, animal rennet, meat, fish, or poultry egg wash.
            </p>
            <p className="text-[11px] text-[#7A6E65]">
              All prices strictly in ₹10 increments. Taxes calculated as 5% Haryana GST (2.5% CGST + 2.5% SGST) with roundoff to the nearest rupee.
            </p>
          </div>

          <div className="pt-2 text-[10px] font-mono text-[#8C8075]">
            FSSAI License No. 10824005000123 • GSTIN: 06ABCDE1234F1Z5
          </div>
        </footer>
      </main>
    </div>
  );
}
