/**
 * CFR OS: Express API Routes
 * Mounts dedicated CFR OS endpoints under /api/cfr/
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db';
import { validateIngredient, isDietarySafe, DietaryViolationError, parseDietaryFlags } from '../dietary/guard';
import { CfrIngredient } from '../types/dietary';

export const cfrRouter = Router();

/**
 * GET /api/cfr/health
 * Returns CFR OS module health, database version, and summary stats.
 */
cfrRouter.get('/health', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const versionRow = db.prepare("SELECT value FROM cfr_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    const ingredientCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_ingredients').get() as { count: number }).count;
    const recipeCount = (db.prepare('SELECT COUNT(*) as count FROM cfr_recipes').get() as { count: number }).count;

    res.json({
      status: 'ok',
      brand: 'Coffee First Ritual (CFR)',
      location: 'Sector 12, Karnal, Haryana',
      dietary_policy: '100% Vegetarian & Artisanal Eggless (Zero Tolerance)',
      schema_version: Number(versionRow?.value || 1),
      counts: {
        ingredients: ingredientCount,
        recipes: recipeCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to check CFR health' });
  }
});

/**
 * GET /api/cfr/ingredients
 * Returns all CFR ingredients.
 */
cfrRouter.get('/ingredients', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const ingredients = db.prepare(`
      SELECT id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
      FROM cfr_ingredients
      ORDER BY category, name
    `).all() as CfrIngredient[];

    res.json({
      total: ingredients.length,
      ingredients,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to fetch ingredients' });
  }
});

/**
 * POST /api/cfr/ingredients
 * Adds a new ingredient, strictly guarded by the 100% vegetarian & eggless policy.
 */
cfrRouter.post('/ingredients', (req: Request, res: Response) => {
  try {
    const { id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags } = req.body;

    if (!name || !category || !base_unit || !dietary_flags) {
      return res.status(400).json({ error: 'Missing required fields (name, category, base_unit, dietary_flags)' });
    }

    const ingredientId = id || `ing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const candidate: Pick<CfrIngredient, 'name' | 'dietary_flags'> = {
      name: String(name).trim(),
      dietary_flags: String(dietary_flags).trim(),
    };

    // 1. Guard check: Throws 422 if egg/gelatin/animal derivative
    validateIngredient(candidate);

    // 2. Insert into SQLite (protected by DB-level CHECK constraint as second barrier)
    const db = getDatabase();
    db.prepare(`
      INSERT INTO cfr_ingredients (
        id, name, category, base_unit, cost_per_unit_paise, par_level, dietary_flags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ingredientId,
      candidate.name,
      category,
      base_unit,
      cost_per_unit_paise || 0,
      par_level || 0,
      candidate.dietary_flags,
      now,
      now
    );

    res.status(201).json({
      message: 'Ingredient created successfully',
      ingredient: {
        id: ingredientId,
        name: candidate.name,
        category,
        base_unit,
        cost_per_unit_paise: cost_per_unit_paise || 0,
        par_level: par_level || 0,
        dietary_flags: candidate.dietary_flags,
      },
    });
  } catch (error: any) {
    if (error instanceof DietaryViolationError || error.name === 'DietaryViolationError' || error.code === 'ERR_CFR_DIETARY_VIOLATION') {
      return res.status(422).json({
        error: error.message,
        banned_flag: error.bannedFlag,
        code: error.code,
      });
    }
    if (error?.message?.includes('CHECK constraint failed')) {
      return res.status(422).json({
        error: 'Database constraint violation: Ingredient contains forbidden non-vegetarian flags.',
        code: 'ERR_DB_CHECK_FAILED',
      });
    }
    res.status(500).json({ error: error?.message || 'Failed to create ingredient' });
  }
});

/**
 * POST /api/cfr/dietary/validate
 * Inspects any recipe or list of flags to confirm dietary safety.
 */
cfrRouter.post('/dietary/validate', (req: Request, res: Response) => {
  try {
    const { items, flags } = req.body;

    if (flags) {
      const safe = isDietarySafe(flags);
      return res.json({
        safe,
        flags: parseDietaryFlags(flags),
        policy: '100% Vegetarian & Artisanal Eggless',
      });
    }

    if (Array.isArray(items)) {
      const violations: { item: string; flag: string }[] = [];
      for (const item of items) {
        const itemFlags = parseDietaryFlags(item.dietary_flags);
        for (const f of itemFlags) {
          if (!isDietarySafe(f)) {
            violations.push({ item: item.name || 'Unnamed item', flag: f });
          }
        }
      }

      return res.json({
        safe: violations.length === 0,
        violations,
        policy: '100% Vegetarian & Artisanal Eggless',
      });
    }

    res.status(400).json({ error: 'Provide either "flags" string or "items" array' });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to validate dietary safety' });
  }
});
