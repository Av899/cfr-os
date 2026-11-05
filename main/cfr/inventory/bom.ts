/**
 * CFR OS: Gram-Level BOM (Bill of Materials) Engine
 * Maps menu items to raw ingredients and sub-recipes with exact gram/ml measurements.
 * Handles sub-recipe recursion and addon ingredient substitutions.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  CfrRecipe,
  CfrRecipeItem,
  OrderBomDeductionResult,
  ResolvedLeafIngredient,
} from '../types/inventory';
import { allocateFefoStock, reverseOrderFefoStock } from './fefo';

/**
 * Normalizes text for fuzzy recipe matching.
 */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves a recipe and all nested sub-recipes into a flat list of leaf ingredients with scaled quantities.
 */
export function resolveRecipeLeafIngredients(
  db: Database.Database,
  recipeId: string,
  targetQuantity: number,
  visitedRecipeIds: Set<string> = new Set(),
): Map<string, { quantity: number; unit: string; name: string }> {
  const leafMap = new Map<string, { quantity: number; unit: string; name: string }>();

  if (visitedRecipeIds.has(recipeId)) {
    console.warn(`[CFR BOM] Circular sub-recipe detected for recipe ID "${recipeId}". Breaking recursion.`);
    return leafMap;
  }
  visitedRecipeIds.add(recipeId);

  const recipe = db
    .prepare('SELECT id, name, yield_quantity, yield_unit, is_sub_recipe FROM cfr_recipes WHERE id = ?')
    .get(recipeId) as CfrRecipe | undefined;

  if (!recipe) return leafMap;

  const yieldQty = recipe.yield_quantity > 0 ? recipe.yield_quantity : 1;
  const scale = targetQuantity / yieldQty;

  const items = db
    .prepare(`
      SELECT ri.id, ri.recipe_id, ri.ingredient_id, ri.sub_recipe_id, ri.quantity, ri.unit,
             ing.name as ingredient_name, ing.base_unit as ingredient_base_unit
      FROM cfr_recipe_items ri
      LEFT JOIN cfr_ingredients ing ON ri.ingredient_id = ing.id
      WHERE ri.recipe_id = ?
    `)
    .all(recipeId) as Array<{
    id: string;
    recipe_id: string;
    ingredient_id: string | null;
    sub_recipe_id: string | null;
    quantity: number;
    unit: string;
    ingredient_name: string | null;
    ingredient_base_unit: string | null;
  }>;

  for (const item of items) {
    const itemQty = item.quantity * scale;

    if (item.sub_recipe_id) {
      // Recurse into sub-recipe
      const nested = resolveRecipeLeafIngredients(
        db,
        item.sub_recipe_id,
        itemQty,
        new Set(visitedRecipeIds),
      );
      for (const [ingId, data] of nested.entries()) {
        const existing = leafMap.get(ingId);
        if (existing) {
          existing.quantity = Math.round((existing.quantity + data.quantity) * 10000) / 10000;
        } else {
          leafMap.set(ingId, { ...data });
        }
      }
    } else if (item.ingredient_id) {
      const ingId = item.ingredient_id;
      const ingName = item.ingredient_name || ingId;
      const ingUnit = item.ingredient_base_unit || item.unit;

      const existing = leafMap.get(ingId);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + itemQty) * 10000) / 10000;
      } else {
        leafMap.set(ingId, {
          quantity: Math.round(itemQty * 10000) / 10000,
          unit: ingUnit,
          name: ingName,
        });
      }
    }
  }

  return leafMap;
}

/**
 * Finds the matching recipe for a product by ID or name.
 */
export function findRecipeForProduct(
  db: Database.Database,
  productId?: string | null,
  productName?: string | null,
): CfrRecipe | null {
  if (productId) {
    const byId = db
      .prepare('SELECT * FROM cfr_recipes WHERE product_id = ?')
      .get(productId) as CfrRecipe | undefined;
    if (byId) return byId;
  }

  if (productName) {
    const cleanTarget = normalizeName(productName);
    const allRecipes = db
      .prepare('SELECT * FROM cfr_recipes WHERE is_sub_recipe = 0')
      .all() as CfrRecipe[];

    // 1. Exact normalized match
    for (const r of allRecipes) {
      if (normalizeName(r.name) === cleanTarget) return r;
    }

    // 2. Contains match
    for (const r of allRecipes) {
      const cleanRecipe = normalizeName(r.name);
      if (cleanTarget.includes(cleanRecipe) || cleanRecipe.includes(cleanTarget)) {
        return r;
      }
    }
  }

  return null;
}

/**
 * Resolves an order item and any selected addons into total leaf ingredients.
 */
export function resolveOrderItemIngredients(
  db: Database.Database,
  item: {
    product_id?: string | null;
    product_name?: string | null;
    quantity: number;
    addons?: Array<{ id?: string | number; name?: string; quantity?: number }>;
  },
): Map<string, { quantity: number; unit: string; name: string }> {
  const leafMap = new Map<string, { quantity: number; unit: string; name: string }>();
  const quantity = Math.max(1, Number(item.quantity) || 1);

  const recipe = findRecipeForProduct(db, item.product_id, item.product_name);
  if (recipe) {
    const resolved = resolveRecipeLeafIngredients(db, recipe.id, quantity);
    for (const [id, data] of resolved.entries()) {
      leafMap.set(id, { ...data });
    }
  }

  // Handle Addon modifiers (substitutions & additions)
  if (Array.isArray(item.addons)) {
    for (const addon of item.addons) {
      const addonName = (addon.name || '').toLowerCase();
      const addonQty = Math.max(1, Number(addon.quantity) || 1) * quantity;

      // Addon: Oat Milk Swap
      if (addonName.includes('oat') || addonName.includes('oatly') || addonName.includes('plant')) {
        const dairyEntry = leafMap.get('ing_milk_a2_whole');
        if (dairyEntry) {
          const ml = dairyEntry.quantity;
          leafMap.delete('ing_milk_a2_whole');
          leafMap.set('ing_milk_oatly_barista', {
            quantity: ml,
            unit: 'ml',
            name: 'Oatly Barista Edition Oat Milk',
          });
        }
      }

      // Addon: Extra Shot (+18g espresso beans)
      if (addonName.includes('extra shot') || addonName.includes('extra espresso') || addonName.includes('double')) {
        const beansEntry = leafMap.get('ing_beans_bt_attikan');
        const extraGrams = 18 * addonQty;
        if (beansEntry) {
          beansEntry.quantity = Math.round((beansEntry.quantity + extraGrams) * 10000) / 10000;
        } else {
          leafMap.set('ing_beans_bt_attikan', {
            quantity: extraGrams,
            unit: 'g',
            name: 'Blue Tokai Attikan Estate Coffee Beans',
          });
        }
      }
    }
  }

  return leafMap;
}

/**
 * Deducts all raw ingredients for an order from stock lots using FEFO.
 * Executes atomically inside a database transaction.
 */
export function deductOrderBOM(
  db: Database.Database,
  orderId: string | number,
  orderItems: Array<{
    product_id?: string | null;
    product_name?: string | null;
    quantity: number;
    addons?: any;
  }>,
): OrderBomDeductionResult {
  const orderIdStr = String(orderId);
  const aggregatedIngredients = new Map<string, { quantity: number; unit: string; name: string }>();

  // 1. Resolve and aggregate leaf ingredients across all items in this order
  for (const item of orderItems) {
    const itemLeaves = resolveOrderItemIngredients(db, item);
    for (const [ingId, data] of itemLeaves.entries()) {
      const existing = aggregatedIngredients.get(ingId);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + data.quantity) * 10000) / 10000;
      } else {
        aggregatedIngredients.set(ingId, { ...data });
      }
    }
  }

  const resolvedLeaves: ResolvedLeafIngredient[] = [];
  let totalCogsPaise = 0;
  const now = new Date().toISOString();

  // 2. Perform FEFO deductions inside a transaction
  const executeDeduction = db.transaction(() => {
    for (const [ingId, data] of aggregatedIngredients.entries()) {
      const allocationResult = allocateFefoStock(
        db,
        ingId,
        data.quantity,
        'DEDUCTION_ORDER',
        'ORDER_FIRE',
        orderIdStr,
      );

      totalCogsPaise += allocationResult.total_cost_paise;
      resolvedLeaves.push({
        ingredient_id: ingId,
        ingredient_name: data.name,
        base_unit: data.unit as any,
        total_qty: data.quantity,
        allocations: allocationResult.allocations,
        unallocated_qty: allocationResult.unallocated_qty,
        total_cost_paise: allocationResult.total_cost_paise,
      });
    }
  });

  executeDeduction();

  return {
    order_id: orderIdStr,
    deducted_at: now,
    ingredients: resolvedLeaves,
    total_cogs_paise: totalCogsPaise,
  };
}

/**
 * Reverses all BOM deductions for an order when it is cancelled or refunded.
 */
export function reverseOrderBOM(
  db: Database.Database,
  orderId: string | number,
): { reversedCount: number } {
  const orderIdStr = String(orderId);
  let count = 0;
  const executeReversal = db.transaction(() => {
    const res = reverseOrderFefoStock(db, orderIdStr);
    count = res.reversedCount;
  });
  executeReversal();
  return { reversedCount: count };
}

/**
 * Seeds standard CFR signature recipes if the recipe table is empty.
 */
export function seedStandardCfrRecipes(db: Database.Database): void {
  const existingCount = (
    db.prepare('SELECT COUNT(*) as count FROM cfr_recipes').get() as { count: number }
  ).count;
  if (existingCount > 0) return;

  const now = new Date().toISOString();

  const insertRecipeStmt = db.prepare(`
    INSERT INTO cfr_recipes (id, product_id, name, yield_quantity, yield_unit, is_sub_recipe, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItemStmt = db.prepare(`
    INSERT INTO cfr_recipe_items (id, recipe_id, ingredient_id, sub_recipe_id, quantity, unit)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    // ── 1. Sub-Recipe: Artisanal Croissant Dough Batch (Yields 10 Plain Croissants) ──
    const doughId = 'recipe_sub_croissant_dough';
    insertRecipeStmt.run(doughId, null, 'Artisanal Croissant Dough Batch', 10, 'croissants', 1, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, doughId, 'ing_flour_t55_french', null, 600, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, doughId, 'ing_butter_cultured_84', null, 350, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, doughId, 'ing_sugar_cane_raw', null, 80, 'g');

    // ── 2. Plain Butter Croissant (Uses 1 unit of Croissant Dough) ──
    const plainCroissantId = 'recipe_croissant_plain';
    insertRecipeStmt.run(plainCroissantId, null, 'Plain Butter Croissant', 1, 'serving', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, plainCroissantId, null, doughId, 1, 'croissants');

    // ── 3. Artisanal Pistachio Croissant (Sub-recipe: 1 Plain Croissant + 30g Pure Pistachio Paste) ──
    const pistachioCroissantId = 'recipe_croissant_pistachio';
    insertRecipeStmt.run(pistachioCroissantId, null, 'Artisanal Pistachio Croissant', 1, 'serving', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, pistachioCroissantId, null, plainCroissantId, 1, 'serving');
    insertItemStmt.run(`ri_${randomUUID()}`, pistachioCroissantId, 'ing_paste_pistachio_pure', null, 30, 'g');

    // ── 4. Espresso (Double Shot - 18g Attikan Beans) ──
    const espressoId = 'recipe_coffee_espresso';
    insertRecipeStmt.run(espressoId, null, 'Double Espresso', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, espressoId, 'ing_beans_bt_attikan', null, 18, 'g');

    // ── 5. Americano (18g Attikan Beans) ──
    const americanoId = 'recipe_coffee_americano';
    insertRecipeStmt.run(americanoId, null, 'Americano', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, americanoId, 'ing_beans_bt_attikan', null, 18, 'g');

    // ── 6. Flat White (18g Attikan Beans + 180ml A2 Whole Cow Milk) ──
    const flatWhiteId = 'recipe_coffee_flat_white';
    insertRecipeStmt.run(flatWhiteId, null, 'Flat White', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, flatWhiteId, 'ing_beans_bt_attikan', null, 18, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, flatWhiteId, 'ing_milk_a2_whole', null, 180, 'ml');

    // ── 7. Cappuccino (18g Attikan Beans + 150ml A2 Milk) ──
    const cappuccinoId = 'recipe_coffee_cappuccino';
    insertRecipeStmt.run(cappuccinoId, null, 'Cappuccino', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, cappuccinoId, 'ing_beans_bt_attikan', null, 18, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, cappuccinoId, 'ing_milk_a2_whole', null, 150, 'ml');

    // ── 8. Cafe Latte (18g Attikan Beans + 220ml A2 Milk) ──
    const latteId = 'recipe_coffee_latte';
    insertRecipeStmt.run(latteId, null, 'Cafe Latte', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, latteId, 'ing_beans_bt_attikan', null, 18, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, latteId, 'ing_milk_a2_whole', null, 220, 'ml');

    // ── 9. Oat Milk Flat White (18g Attikan Beans + 180ml Oatly Barista) ──
    const oatFlatWhiteId = 'recipe_coffee_oat_flat_white';
    insertRecipeStmt.run(oatFlatWhiteId, null, 'Oat Flat White', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, oatFlatWhiteId, 'ing_beans_bt_attikan', null, 18, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, oatFlatWhiteId, 'ing_milk_oatly_barista', null, 180, 'ml');

    // ── 10. Valrhona 70% Dark Hot Chocolate (30g Valrhona 70% + 200ml A2 Milk + 10g Cane Sugar) ──
    const hotChocId = 'recipe_valrhona_hot_chocolate';
    insertRecipeStmt.run(hotChocId, null, 'Valrhona 70% Hot Chocolate', 1, 'cup', 0, now, now);
    insertItemStmt.run(`ri_${randomUUID()}`, hotChocId, 'ing_cocoa_valrhona_70', null, 30, 'g');
    insertItemStmt.run(`ri_${randomUUID()}`, hotChocId, 'ing_milk_a2_whole', null, 200, 'ml');
    insertItemStmt.run(`ri_${randomUUID()}`, hotChocId, 'ing_sugar_cane_raw', null, 10, 'g');
  })();

  console.log('[CFR BOM] Successfully seeded standard CFR recipes & sub-recipes.');
}

