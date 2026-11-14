'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  RefreshCw,
  Search,
  Calendar,
  ChefHat,
  History,
  Coffee,
  PackageMinus,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface StockLot {
  id: string;
  batch_no: string;
  expiry_date: string;
  remaining_qty: number;
  unit_cost_paise: number;
}

interface IngredientSummary {
  id: string;
  name: string;
  category: string;
  base_unit: 'g' | 'ml' | 'piece';
  par_level: number;
  current_stock: number;
  is_low_stock: boolean;
  earliest_expiry: string | null;
  active_lots_count: number;
  lots?: StockLot[];
}

interface RecipeItem {
  id: string;
  quantity: number;
  unit: string;
  ingredient_name?: string;
  sub_recipe_name?: string;
}

interface CfrRecipe {
  id: string;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  is_sub_recipe: number;
  items?: RecipeItem[];
}

interface StockMovement {
  id: string;
  ingredient_name: string;
  type: string;
  qty: number;
  unit: string;
  reason: string | null;
  order_id: string | null;
  lot_batch_no: string | null;
  created_at: string;
}

export function CfrInventoryView() {
  const [activeTab, setActiveTab] = useState<'stock' | 'recipes' | 'movements'>('stock');
  const [loading, setLoading] = useState(true);
  const [ingredients, setIngredients] = useState<IngredientSummary[]>([]);
  const [recipes, setRecipes] = useState<CfrRecipe[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Receive Stock Lot Modal State
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [initialQty, setInitialQty] = useState('');
  const [unitCostPaise, setUnitCostPaise] = useState('');
  const [submittingReceive, setSubmittingReceive] = useState(false);

  // Waste Log Modal State
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteIngredientId, setWasteIngredientId] = useState('');
  const [wasteQty, setWasteQty] = useState('');
  const [wasteReason, setWasteReason] = useState<string>('DIAL_IN_SHOT');
  const [submittingWaste, setSubmittingWaste] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/cfr/inventory/stock'),
      api.get('/cfr/recipes'),
      api.get('/cfr/inventory/movements?limit=50'),
    ])
      .then(([stockRes, recipesRes, movementsRes]) => {
        if (!active) return;
        setIngredients(stockRes.data?.stock || []);
        setRecipes(recipesRes.data?.recipes || []);
        setMovements(movementsRes.data?.movements || []);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const errorMsg =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err && 'response' in err
              ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Unknown error'
              : 'Unknown error';
        toast.error('Failed to load CFR inventory: ' + errorMsg);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIngredientId || !batchNo || !expiryDate || !initialQty) {
      toast.error('Please complete all required fields.');
      return;
    }

    try {
      setSubmittingReceive(true);
      await api.post('/cfr/inventory/lots', {
        ingredient_id: selectedIngredientId,
        batch_no: batchNo.trim(),
        supplier_name: supplierName.trim() || undefined,
        expiry_date: expiryDate,
        initial_qty: parseFloat(initialQty),
        unit_cost_paise: unitCostPaise ? Math.round(parseFloat(unitCostPaise) * 100) : 0,
      });

      toast.success('Stock lot received successfully under FEFO control!');
      setShowReceiveModal(false);
      // Reset form
      setBatchNo('');
      setSupplierName('');
      setExpiryDate('');
      setInitialQty('');
      setUnitCostPaise('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : typeof err === 'object' && err && 'response' in err ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Unknown error' : 'Unknown error';
      toast.error('Failed to receive stock lot: ' + errorMsg);
    } finally {
      setSubmittingReceive(false);
    }
  };

  const handleRecordWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteIngredientId || !wasteQty) {
      toast.error('Please select an ingredient and enter quantity.');
      return;
    }

    try {
      setSubmittingWaste(true);
      await api.post('/cfr/inventory/waste', {
        ingredient_id: wasteIngredientId,
        qty: parseFloat(wasteQty),
        reason: wasteReason,
      });

      toast.success('Zero-revenue barista waste recorded & FEFO stock deducted.');
      setShowWasteModal(false);
      setWasteQty('');
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : typeof err === 'object' && err && 'response' in err ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Unknown error' : 'Unknown error';
      toast.error('Failed to record waste: ' + errorMsg);
    } finally {
      setSubmittingWaste(false);
    }
  };

  const filteredIngredients = ingredients.filter((ing) =>
    ing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ing.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border p-5 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#8B5E3C]/10 flex items-center justify-center text-[#8B5E3C]">
              <Coffee className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              CFR OS: Gram-Level BOM & FEFO Stock Engine
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Artisanal eggless bill of materials, sub-recipe recursion, and First-Expiry First-Out inventory tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-9 px-3 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowWasteModal(true)}
            className="h-9 px-3 text-xs text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            <PackageMinus className="w-3.5 h-3.5 mr-1.5" />
            Log Barista Waste
          </Button>

          <Button
            size="sm"
            onClick={() => setShowReceiveModal(true)}
            className="h-9 px-3 text-xs bg-[#8B5E3C] hover:bg-[#724C30] text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Receive Stock Lot (FEFO)
          </Button>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'stock'
                ? 'bg-[#8B5E3C] text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className="flex items-center gap-2">
              <Boxes className="w-4 h-4" />
              FEFO Staple Ingredients ({ingredients.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'recipes'
                ? 'bg-[#8B5E3C] text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className="flex items-center gap-2">
              <ChefHat className="w-4 h-4" />
              Gram-Level BOM Recipes ({recipes.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'movements'
                ? 'bg-[#8B5E3C] text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <span className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Movement Audit Ledger ({movements.length})
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search ingredients or recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
          />
        </div>
      </div>

      {/* Content or Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <RefreshCw className="w-6 h-6 animate-spin text-[#8B5E3C]" />
          <p className="text-xs">Loading CFR inventory & recipes...</p>
        </div>
      ) : (
        <>
          {/* Tab 1: FEFO Stock */}
          {activeTab === 'stock' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIngredients.map((ing) => {
                const pct = ing.par_level > 0 ? Math.min(100, Math.round((ing.current_stock / ing.par_level) * 100)) : 100;
                return (
                  <div
                    key={ing.id}
                    className="bg-card border border-border rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-[#8B5E3C]/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#8B5E3C] bg-[#8B5E3C]/10 px-2 py-0.5 rounded-sm">
                            {ing.category.replace('_', ' ')}
                          </span>
                          <h3 className="font-semibold text-sm text-foreground mt-1.5 line-clamp-1">
                            {ing.name}
                          </h3>
                        </div>
                        {ing.is_low_stock ? (
                          <Badge variant="destructive" className="text-[10px] shrink-0">
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] shrink-0 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400">
                            In Stock
                          </Badge>
                        )}
                      </div>

                      {/* Stock Bar */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Available Stock:</span>
                          <span className="font-bold text-foreground">
                            {ing.current_stock.toLocaleString()} {ing.base_unit}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ing.is_low_stock ? 'bg-rose-500' : 'bg-[#8B5E3C]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Par Level: {ing.par_level.toLocaleString()} {ing.base_unit}</span>
                          <span>{pct}% filled</span>
                        </div>
                      </div>

                      {/* Expiry Details */}
                      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> Earliest Expiry:
                        </span>
                        <span className={ing.earliest_expiry ? 'font-medium text-foreground' : 'text-muted-foreground italic'}>
                          {ing.earliest_expiry || 'No active lots'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Active lots: <strong className="text-foreground">{ing.active_lots_count}</strong>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedIngredientId(ing.id);
                          setShowReceiveModal(true);
                        }}
                        className="h-7 text-[11px] px-2.5"
                      >
                        + Add Batch
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 2: Gram-Level Recipes */}
          {activeTab === 'recipes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecipes.map((recipe) => (
                <div
                  key={recipe.id}
                  className="bg-card border border-border rounded-xl p-5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-foreground">{recipe.name}</h3>
                        {recipe.is_sub_recipe === 1 && (
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">
                            Sub-Recipe
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Yield: <strong>{recipe.yield_quantity} {recipe.yield_unit}</strong>
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Bill of Materials (BOM):
                    </p>

                    <div className="space-y-1.5 bg-muted/40 p-3 rounded-lg border border-border/60">
                      {recipe.items && recipe.items.length > 0 ? (
                        recipe.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-b-0">
                            <span className="text-foreground flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#8B5E3C]" />
                              {item.ingredient_name || item.sub_recipe_name}
                            </span>
                            <span className="font-mono font-medium text-foreground">
                              {item.quantity} {item.unit}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No line items configured.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-[#8B5E3C]">
                      <Sparkles className="w-3.5 h-3.5" /> Auto-deducted on order placement
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 3: Stock Movement Ledger */}
          {activeTab === 'movements' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted text-muted-foreground uppercase font-semibold text-[10px] tracking-wider border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Ingredient</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Delta Qty</th>
                      <th className="py-3 px-4">Reason / Order #</th>
                      <th className="py-3 px-4">Batch Lot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movements.length > 0 ? (
                      movements.map((m) => (
                        <tr key={m.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 px-4 text-muted-foreground font-mono text-[11px]">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-foreground">
                            {m.ingredient_name}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                m.type === 'PURCHASE'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                  : m.type === 'DEDUCTION_ORDER'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                                  : m.type === 'WASTE'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                  : 'bg-muted text-foreground'
                              }`}
                            >
                              {m.type}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-4 font-mono font-medium ${
                              m.qty < 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {m.qty > 0 ? `+${m.qty}` : m.qty} {m.unit}
                          </td>
                          <td className="py-2.5 px-4 text-muted-foreground">
                            {m.order_id ? `Order #${m.order_id.slice(-6)}` : m.reason || '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                            {m.lot_batch_no || '—'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">
                          No stock movements recorded yet. Receive a batch or place an order to see live audit logs.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal: Receive Stock Lot (FEFO) */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Receive Stock Lot (FEFO)</h3>
                <p className="text-xs text-muted-foreground">Enter batch details for expiration-first allocation</p>
              </div>
              <button
                onClick={() => setShowReceiveModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReceiveStock} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Ingredient *</label>
                <select
                  value={selectedIngredientId}
                  onChange={(e) => setSelectedIngredientId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                  required
                >
                  <option value="">-- Select CFR Staple Ingredient --</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.base_unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Batch / Lot # *</label>
                  <input
                    type="text"
                    placeholder="e.g. BATCH-202611-01"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Expiry Date *</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Supplier Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Blue Tokai / Normandy Import"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Quantity (in Base Unit) *</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5000"
                    value={initialQty}
                    onChange={(e) => setInitialQty(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground mb-1 font-medium">Unit Cost (₹) (Optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 1.25"
                    value={unitCostPaise}
                    onChange={(e) => setUnitCostPaise(e.target.value)}
                    className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReceiveModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingReceive}
                  className="bg-[#8B5E3C] hover:bg-[#724C30] text-white"
                >
                  {submittingReceive ? 'Receiving...' : 'Record Batch (FEFO)'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Barista Waste */}
      {showWasteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Log Barista Waste / Calibration</h3>
                <p className="text-xs text-muted-foreground">Immediate FEFO deduction for zero-revenue operations</p>
              </div>
              <button
                onClick={() => setShowWasteModal(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordWaste} className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Ingredient *</label>
                <select
                  value={wasteIngredientId}
                  onChange={(e) => setWasteIngredientId(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                  required
                >
                  <option value="">-- Select Ingredient --</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.base_unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Reason *</label>
                <select
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                >
                  <option value="DIAL_IN_SHOT">Barista Morning Dial-in Shot (18g)</option>
                  <option value="MILK_PURGE">Steam Wand Milk Purge (50ml)</option>
                  <option value="DROPPED">Dropped / Physical Damage</option>
                  <option value="PAST_EXPIRY">Past Expiry Date</option>
                  <option value="SPOILED">Spoiled / Quality Defect</option>
                  <option value="STAFF_TRAINING">Staff Latte Art Training</option>
                </select>
              </div>

              <div>
                <label className="block text-muted-foreground mb-1 font-medium">Quantity to Deduct *</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 18 (for 18g espresso dose)"
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  className="w-full bg-muted/50 border border-border rounded-lg p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-[#8B5E3C]"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWasteModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingWaste}
                  className="bg-amber-700 hover:bg-amber-800 text-white"
                >
                  {submittingWaste ? 'Deducting...' : 'Deduct FEFO Waste'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
