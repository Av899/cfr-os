/**
 * CFR OS: Dietary Invariants and Types
 * Coffee First Ritual (CFR) - 100% Vegetarian & Artisanal Eggless Policy
 */

export const BANNED_DIETARY_FLAGS = [
  'CONTAINS_EGG',
  'GELATIN',
  'ANIMAL_RENNET',
  'CARMINE',
  'MEAT_FISH',
  'LARD',
  'ISINGLASS',
  'BONE_CHAR',
] as const;

export type BannedDietaryFlag = (typeof BANNED_DIETARY_FLAGS)[number];

export const ALLOWED_DIETARY_FLAGS = [
  'VEGAN',
  'LACTO_VEG',
  'EGGLESS',
  'GLUTEN_FREE',
  'NUT_FREE',
  'SOY_FREE',
  'DAIRY_FREE',
] as const;

export type AllowedDietaryFlag = (typeof ALLOWED_DIETARY_FLAGS)[number];

export type DietaryFlag = BannedDietaryFlag | AllowedDietaryFlag | string;

export interface CfrIngredient {
  id: string;
  name: string;
  category:
    | 'coffee_beans'
    | 'dairy'
    | 'plant_milk'
    | 'flour'
    | 'fat_butter'
    | 'sweetener'
    | 'chocolate_cocoa'
    | 'nuts_pastes'
    | 'produce'
    | 'spices_flavor'
    | 'packaging';
  base_unit: 'g' | 'ml' | 'piece';
  cost_per_unit_paise: number;
  par_level: number;
  dietary_flags: string; // Comma-separated list of flags (e.g. "LACTO_VEG,EGGLESS")
  created_at?: string;
  updated_at?: string;
}

export interface CfrRecipe {
  id: string;
  product_id: string | null;
  name: string;
  yield_quantity: number;
  yield_unit: string;
  is_sub_recipe: number; // 0 or 1
  created_at?: string;
  updated_at?: string;
}

export interface CfrRecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  quantity: number;
  unit: string;
}
