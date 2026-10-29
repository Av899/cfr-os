/**
 * CFR OS: 100% Vegetarian & Artisanal Eggless Dietary Guard
 *
 * Strict runtime and database verification ensuring that no recipe, ingredient,
 * or menu item at Coffee First Ritual (CFR) can ever contain egg, gelatin,
 * animal rennet, carmine, lard, isinglass, or meat/fish derivatives.
 */

import {
  BANNED_DIETARY_FLAGS,
  BannedDietaryFlag,
  CfrIngredient,
} from '../types/dietary';

export class DietaryViolationError extends Error {
  public readonly code = 'ERR_CFR_DIETARY_VIOLATION';
  public readonly statusCode = 422;
  public readonly bannedFlag: string;
  public readonly itemName?: string;

  constructor(message: string, bannedFlag: string, itemName?: string) {
    super(message);
    this.name = 'DietaryViolationError';
    this.bannedFlag = bannedFlag;
    this.itemName = itemName;
  }
}

/**
 * Parses raw dietary flags into an array of uppercase trimmed tokens.
 */
export function parseDietaryFlags(flags: string[] | string | undefined | null): string[] {
  if (!flags) return [];
  if (Array.isArray(flags)) {
    return flags.map((f) => String(f).trim().toUpperCase()).filter(Boolean);
  }
  return String(flags)
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Returns true if dietary flags contain zero banned non-vegetarian flags.
 */
export function isDietarySafe(flags: string[] | string | undefined | null): boolean {
  const parsed = parseDietaryFlags(flags);
  for (const flag of parsed) {
    if ((BANNED_DIETARY_FLAGS as readonly string[]).includes(flag)) {
      return false;
    }
    // Also guard against common case variations or keywords
    const lower = flag.toLowerCase();
    if (
      lower.includes('egg') &&
      !lower.includes('eggless') &&
      !lower.includes('aquafaba')
    ) {
      return false;
    }
    if (lower.includes('gelatin') || lower.includes('rennet') || lower.includes('carmine') || lower.includes('meat') || lower.includes('lard')) {
      return false;
    }
  }
  return true;
}

/**
 * Validates dietary flags. Throws DietaryViolationError if any banned flag is found.
 */
export function assertDietarySafe(
  flags: string[] | string | undefined | null,
  itemName?: string
): void {
  const parsed = parseDietaryFlags(flags);
  for (const flag of parsed) {
    if ((BANNED_DIETARY_FLAGS as readonly string[]).includes(flag)) {
      throw new DietaryViolationError(
        `Dietary Violation: Item "${itemName || 'Unknown'}" contains forbidden substance flag "${flag}". CFR is strictly 100% vegetarian and artisanal eggless.`,
        flag,
        itemName
      );
    }
    const lower = flag.toLowerCase();
    if (
      lower.includes('egg') &&
      !lower.includes('eggless') &&
      !lower.includes('aquafaba')
    ) {
      throw new DietaryViolationError(
        `Dietary Violation: Item "${itemName || 'Unknown'}" contains egg flag "${flag}". Only eggless ingredients are permitted.`,
        flag,
        itemName
      );
    }
    if (lower.includes('gelatin') || lower.includes('rennet') || lower.includes('carmine') || lower.includes('meat') || lower.includes('lard')) {
      throw new DietaryViolationError(
        `Dietary Violation: Item "${itemName || 'Unknown'}" contains animal derivative flag "${flag}".`,
        flag,
        itemName
      );
    }
  }
}

/**
 * Validates an ingredient before inserting or updating in the database.
 */
export function validateIngredient(
  ingredient: Pick<CfrIngredient, 'name' | 'dietary_flags'>
): void {
  assertDietarySafe(ingredient.dietary_flags, ingredient.name);
}

/**
 * Validates an entire recipe and its components.
 */
export function validateRecipe(
  recipeName: string,
  items: { name?: string; dietary_flags?: string }[]
): void {
  for (const item of items) {
    assertDietarySafe(item.dietary_flags, item.name || recipeName);
  }
}

/**
 * Normalizes dietary flags to sorted, uppercase comma-separated string.
 */
export function normalizeDietaryFlags(flags: string[] | string | undefined | null): string {
  const parsed = parseDietaryFlags(flags);
  assertDietarySafe(parsed);
  return Array.from(new Set(parsed)).sort().join(',');
}
