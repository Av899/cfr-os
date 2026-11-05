/**
 * CFR OS: Inventory & Recipe Types
 * Gram-Level BOM (Bill of Materials) & FEFO (First-Expiry, First-Out) Tracking
 */

export type CfrIngredientBaseUnit = 'g' | 'ml' | 'piece';

export type CfrStockMovementType =
  | 'PURCHASE'
  | 'DEDUCTION_ORDER'
  | 'DEDUCTION_BATCH'
  | 'WASTE'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export type CfrWasteReason =
  | 'DIAL_IN_SHOT'
  | 'MILK_PURGE'
  | 'PAST_EXPIRY'
  | 'DROPPED'
  | 'SPOILED'
  | 'STAFF_TRAINING'
  | 'COUNT_ADJUSTMENT';

export interface CfrStockLot {
  id: string;
  ingredient_id: string;
  batch_no: string;
  supplier_name: string | null;
  received_at: string;
  expiry_date: string; // YYYY-MM-DD
  initial_qty: number;
  remaining_qty: number;
  unit_cost_paise: number;
  created_at: string;
}

export interface CfrStockMovement {
  id: string;
  ingredient_id: string;
  lot_id: string | null;
  type: CfrStockMovementType;
  qty: number;
  reason: string | null;
  order_id: string | null;
  created_at: string;
}

export interface CfrRecipe {
  id: string;
  product_id: string | null;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  is_sub_recipe: number; // 0 | 1
  created_at: string;
  updated_at: string;
  items?: CfrRecipeItem[];
}

export interface CfrRecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  quantity: number;
  unit: string;
  // Hydrated helper properties
  ingredient_name?: string;
  sub_recipe_name?: string;
}

export interface FefoLotAllocation {
  lot_id: string;
  batch_no: string;
  expiry_date: string;
  qty_deducted: number;
  unit_cost_paise: number;
}

export interface ResolvedLeafIngredient {
  ingredient_id: string;
  ingredient_name: string;
  base_unit: CfrIngredientBaseUnit;
  total_qty: number;
  allocations: FefoLotAllocation[];
  unallocated_qty: number;
  total_cost_paise: number;
}

export interface OrderBomDeductionResult {
  order_id: string;
  deducted_at: string;
  ingredients: ResolvedLeafIngredient[];
  total_cogs_paise: number;
}

export interface IngredientStockSummary {
  id: string;
  name: string;
  category: string;
  base_unit: CfrIngredientBaseUnit;
  par_level: number;
  current_stock: number;
  is_low_stock: boolean;
  earliest_expiry: string | null;
  active_lots_count: number;
  lots: Array<{
    id: string;
    batch_no: string;
    expiry_date: string;
    remaining_qty: number;
    unit_cost_paise: number;
  }>;
}

