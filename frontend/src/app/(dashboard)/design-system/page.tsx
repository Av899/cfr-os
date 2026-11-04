'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stepper } from '@/components/ui/stepper';
import { VegBadge } from '@/components/ui/veg-badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { CraftBadge } from '@/components/ui/craft-badge';
import { rupees, gst } from '@/lib/money';

export default function DesignSystemPage() {
  const [clockValue, setClockValue] = React.useState(600); // 10:00 AM (minutes from midnight)
  const isNight = clockValue >= 1080 || clockValue < 360; // 6 PM (1080) to 6 AM (360)

  const [quantity, setQuantity] = React.useState(1);
  const [drawerOpen1, setDrawerOpen1] = React.useState(false);
  const [drawerOpen2, setDrawerOpen2] = React.useState(true);

  const [activeSectionPill, setActiveSectionPill] = React.useState(0);
  const sectionPills = [
    'I. Espresso Bar',
    'II. Manual Brews',
    'III. Cold Rituals',
    'IV. Beyond Coffee',
    'V. Eggless Boulangerie',
  ];

  const formatClock = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const h12 = ((h + 11) % 12) + 1;
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
    return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
  };

  // Bill items state
  const [billItems, setBillItems] = React.useState([
    { name: 'Classic Cappuccino', price: 240, qty: 1 },
    { name: 'Classic Cultured Butter Croissant', price: 220, qty: 1 },
  ]);

  const updateBillQty = (index: number, delta: number) => {
    setBillItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, qty: Math.max(1, Math.min(9, item.qty + delta)) } : item,
      ),
    );
  };

  const subtotalPaise = billItems.reduce((acc, item) => acc + item.price * 100 * item.qty, 0);
  const tax = gst(subtotalPaise);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 max-w-6xl mx-auto space-y-12">
      {/* Hero */}
      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-xs font-semibold uppercase tracking-wider text-primary border border-border">
          CFR OS Design System
        </div>
        <h1 className="text-4xl md:text-5xl font-light tracking-tight text-foreground">
          Coffee First Ritual (CFR OS)
        </h1>
        <p className="text-lg text-muted-foreground max-w-3xl leading-relaxed">
          One unified visual language for every screen in the café: POS register, kitchen display,
          server pagers, back office and customer menu. Paper-first aesthetic, high contrast AAA
          typography, 44px/56px/64px hit targets, and venue clock lighting synchronization.
        </p>

        {/* Venue Clock Controller */}
        <Card className="p-6 bg-card border-border mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                Venue Clock Simulation
              </span>
              <div className="text-2xl font-bold tabular-nums text-foreground">
                {formatClock(clockValue)}
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-accent text-sm font-semibold">
              <span
                className={`size-2.5 rounded-full ${isNight ? 'bg-status-new' : 'bg-status-ready'}`}
              />
              <span>{isNight ? 'Night: Espresso ground' : 'Day: Cream ground'}</span>
            </div>
          </div>
          <input
            type="range"
            min="540"
            max="1320"
            step="15"
            value={clockValue}
            onChange={(e) => setClockValue(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
            <span>9:00 AM</span>
            <span>6:00 PM (Lighting change)</span>
            <span>10:00 PM</span>
          </div>
        </Card>
      </section>

      {/* Brand Palette */}
      <section className="space-y-4">
        <h2 className="text-2xl font-light text-foreground">Brand Palette</h2>
        <p className="text-sm text-muted-foreground">
          Five signature tones carrying the identity: Espresso, Roast, Latte, Cream, and Sage.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 rounded-[14px] bg-[#1E1B16] text-[#F6F4ED] border border-border flex flex-col justify-between min-h-[160px]">
            <div>
              <div className="font-bold text-base">Espresso</div>
              <div className="text-xs font-mono opacity-80">#1E1B16</div>
            </div>
            <div className="text-xs opacity-75 mt-4">Ground at night. Text &amp; buttons by day.</div>
          </div>

          <div className="p-4 rounded-[14px] bg-[#8B5E3C] text-[#F6F4ED] border border-border flex flex-col justify-between min-h-[160px]">
            <div>
              <div className="font-bold text-base">Roast</div>
              <div className="text-xs font-mono opacity-80">#8B5E3C</div>
            </div>
            <div className="text-xs opacity-75 mt-4">Serving sizes, secondary text &amp; Preparing status.</div>
          </div>

          <div className="p-4 rounded-[14px] bg-[#C9A782] text-[#1E1B16] border border-border flex flex-col justify-between min-h-[160px]">
            <div>
              <div className="font-bold text-base">Latte</div>
              <div className="text-xs font-mono opacity-80">#C9A782</div>
            </div>
            <div className="text-xs opacity-75 mt-4">Fills, borders &amp; primary action at night.</div>
          </div>

          <div className="p-4 rounded-[14px] bg-[#F6F4ED] text-[#1E1B16] border border-[#DCDAD3] flex flex-col justify-between min-h-[160px]">
            <div>
              <div className="font-bold text-base">Cream</div>
              <div className="text-xs font-mono opacity-80">#F6F4ED</div>
            </div>
            <div className="text-xs opacity-75 mt-4">The paper ground by day. High-contrast cards.</div>
          </div>

          <div className="p-4 rounded-[14px] bg-[#4A5A4A] text-[#F6F4ED] border border-border flex flex-col justify-between min-h-[160px]">
            <div>
              <div className="font-bold text-base">Sage</div>
              <div className="text-xs font-mono opacity-80">#4A5A4A</div>
            </div>
            <div className="text-xs opacity-75 mt-4">Ready, synced states &amp; open disclosure pills.</div>
          </div>
        </div>
      </section>

      {/* Buttons & Hit Targets */}
      <section className="space-y-4">
        <h2 className="text-2xl font-light text-foreground">Buttons &amp; Hit Targets</h2>
        <p className="text-sm text-muted-foreground">
          Pill-shaped with outcome-oriented labels. Minimum 44px for guest/back-office, 56px for POS register, and 64px for KDS.
        </p>
        <Card className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Send to kitchen</Button>
            <Button variant="secondary">Hold order</Button>
            <Button variant="quiet">Add note</Button>
            <Button variant="destructive">Void item</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-border">
            <Button size="pos" className="w-full sm:w-auto">
              Charge ₹483.00 (POS 56px)
            </Button>
            <Button size="kds" className="w-full sm:w-auto">
              Bump Order (KDS 64px)
            </Button>
          </div>
        </Card>
      </section>

      {/* Section Pills */}
      <section className="space-y-4">
        <h2 className="text-2xl font-light text-foreground">Section Navigation Pills</h2>
        <Card className="p-6">
          <div className="flex flex-wrap gap-2">
            {sectionPills.map((pill, idx) => (
              <button
                key={pill}
                type="button"
                onClick={() => setActiveSectionPill(idx)}
                aria-pressed={activeSectionPill === idx}
                className={`min-h-[44px] px-5 rounded-full text-xs font-semibold tracking-wider transition-all cursor-pointer ${
                  activeSectionPill === idx
                    ? 'bg-primary text-primary-foreground border border-primary'
                    : 'bg-card text-foreground border border-border hover:bg-muted'
                }`}
              >
                {pill}
              </button>
            ))}
          </div>
        </Card>
      </section>

      {/* Menu Items with Tasting Notes Drawer */}
      <section className="space-y-4">
        <h2 className="text-2xl font-light text-foreground">Menu Items &amp; Craft Drawers</h2>
        <Card className="p-6 divide-y divide-border">
          <article className="pb-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="font-bold text-base text-foreground">Melbourne Magic</h3>
                <span className="text-xs text-muted-foreground">150 ml</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-base tabular-nums">₹230</span>
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setDrawerOpen1(!drawerOpen1)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs font-semibold bg-accent text-foreground hover:bg-muted"
              >
                <span>{drawerOpen1 ? '−' : '+'}</span>
                <span>Tasting Notes &amp; Craft</span>
              </button>
            </div>
            {drawerOpen1 && (
              <div className="mt-3 p-4 rounded-[14px] bg-accent/60 border border-border space-y-2 text-sm">
                <p className="text-foreground">
                  Double ristretto with 3/4 steamed micro-foam for a punchy, sweet finish.
                </p>
                <CraftBadge>Brewed on La Marzocco</CraftBadge>
              </div>
            )}
          </article>

          <article className="pt-6">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h3 className="font-bold text-base text-foreground">Classic Cultured Butter Croissant</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="eggless">Eggless</Badge>
                  <VegBadge size={16} />
                </div>
              </div>
              <div className="text-right">
                <span className="font-semibold text-base tabular-nums">₹220</span>
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setDrawerOpen2(!drawerOpen2)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs font-semibold bg-accent text-foreground hover:bg-muted"
              >
                <span>{drawerOpen2 ? '−' : '+'}</span>
                <span>Tasting Notes &amp; Craft</span>
              </button>
            </div>
            {drawerOpen2 && (
              <div className="mt-3 p-4 rounded-[14px] bg-accent/60 border border-border space-y-2 text-sm">
                <p className="text-foreground">
                  27 honeycomb layers laminated in our 20°C cold room with French-style cultured butter. 100% Eggless. Allergens: Gluten, Dairy.
                </p>
                <CraftBadge>Baked in Unox Combi</CraftBadge>
              </div>
            )}
          </article>
        </Card>
      </section>

      {/* Stepper, Badges & Statuses */}
      <section className="space-y-4">
        <h2 className="text-2xl font-light text-foreground">Controls, Badges &amp; Statuses</h2>
        <Card className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-xs uppercase font-semibold text-muted-foreground block mb-2">
                Quantity Stepper
              </span>
              <Stepper value={quantity} onChange={setQuantity} min={1} max={10} />
            </div>

            <div>
              <span className="text-xs uppercase font-semibold text-muted-foreground block mb-2">
                Dietary Marks
              </span>
              <div className="flex items-center gap-3">
                <Badge variant="eggless">Eggless</Badge>
                <VegBadge size={20} />
                <CraftBadge>Brewed on La Marzocco</CraftBadge>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <span className="text-xs uppercase font-semibold text-muted-foreground block mb-3">
              Operational Status Indicators
            </span>
            <div className="flex flex-wrap gap-3">
              <StatusBadge status="new" />
              <StatusBadge status="prep" />
              <StatusBadge status="ready" />
              <StatusBadge status="attn" />
              <StatusBadge status="late" />
            </div>
          </div>
        </Card>
      </section>

      {/* Bill & Tax Split */}
      <section className="space-y-4">
        <h2 className="text-2xl font-light text-foreground">Live Bill Calculation (Paise &amp; 5% GST)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-base text-foreground">Order Ticket (Paise Engine)</h3>
            <div className="divide-y divide-border">
              {billItems.map((item, idx) => (
                <div key={item.name} className="py-3 flex justify-between items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">₹{item.price}.00 each</div>
                  </div>
                  <Stepper
                    value={item.qty}
                    onChange={(newVal) => updateBillQty(idx, newVal - item.qty)}
                    min={1}
                    max={9}
                    size="sm"
                  />
                  <div className="text-sm font-semibold tabular-nums min-w-[70px] text-right">
                    {rupees(item.price * 100 * item.qty, 2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-border space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums font-mono">{rupees(subtotalPaise, 2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>CGST (2.5%)</span>
                <span className="tabular-nums font-mono">{rupees(tax.cgst, 2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>SGST (2.5%)</span>
                <span className="tabular-nums font-mono">{rupees(tax.sgst, 2)}</span>
              </div>
              {tax.roundOff !== 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Round-off</span>
                  <span className="tabular-nums font-mono">{tax.roundOff > 0 ? `+${rupees(tax.roundOff, 2)}` : rupees(tax.roundOff, 2)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-3 border-t border-border text-lg font-bold text-foreground">
                <span>Total</span>
                <span className="text-2xl font-bold tabular-nums font-mono">{rupees(tax.payable, 2)}</span>
              </div>
            </div>

            <Button size="pos" className="w-full mt-4">
              Charge {rupees(tax.payable, 2)}
            </Button>
          </Card>

          <Card className="p-6 bg-card space-y-4">
            <h3 className="font-bold text-base text-foreground">Thermal Receipt (48 Columns)</h3>
            <pre className="p-4 bg-muted/60 rounded-[10px] text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre border border-border">
{`                  CFR COFFEE
             COFFEE FIRST RITUAL
           Sector 12, Karnal, Haryana
        GSTIN [GSTIN]   FSSAI [LICENCE NO]
------------------------------------------------
Order 128                                Table 7
29 Oct 2026                                16:32
------------------------------------------------
${billItems
  .map(
    (item) =>
      `${item.name.padEnd(28).slice(0, 28)} ${String(item.qty).padStart(2)} ${(
        item.price * item.qty
      )
        .toFixed(2)
        .padStart(16)}`,
  )
  .join('\n')}
------------------------------------------------
Subtotal                                ${(subtotalPaise / 100).toFixed(2).padStart(8)}
CGST 2.5%                               ${(tax.cgst / 100).toFixed(2).padStart(8)}
SGST 2.5%                               ${(tax.sgst / 100).toFixed(2).padStart(8)}
------------------------------------------------
TOTAL                                 INR ${(tax.total / 100).toFixed(2)}
------------------------------------------------
                   Paid by UPI

            Good Coffee. Better Days.`}
            </pre>
          </Card>
        </div>
      </section>
    </div>
  );
}
