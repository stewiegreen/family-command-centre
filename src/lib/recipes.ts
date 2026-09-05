import type { Recipe, RecipeIngredient, ShoppingItem } from '../types';
import type { ShoppingCategory } from './shoppingCategories';
import { categoryOf } from './shoppingCategories';
import { uid } from './uid';

/** Lightweight category guess from ingredient name — good enough for Phase A. */
export function guessIngredientCategory(name: string): ShoppingCategory {
  const n = name.toLowerCase();
  const rules: [RegExp, ShoppingCategory][] = [
    [/\b(milk|cream|butter|cheese|yogurt|yoghurt|egg|eggs)\b/, 'dairy'],
    [/\b(chicken|beef|pork|lamb|bacon|sausage|turkey|fish|salmon|shrimp|prawn|mince|steak)\b/, 'meat'],
    [/\b(bread|bun|roll|bagel|tortilla|pita|croissant)\b/, 'bakery'],
    [/\b(frozen|ice cream)\b/, 'frozen'],
    [
      /\b(onion|garlic|tomato|lettuce|spinach|carrot|potato|pepper|cucumber|lemon|lime|apple|banana|berry|berries|avocado|celery|broccoli|herb|parsley|cilantro|basil|ginger|mushroom)\b/,
      'produce',
    ],
    [/\b(flour|sugar|rice|pasta|oil|vinegar|salt|pepper|spice|sauce|stock|broth|bean|lentil|can |canned|tin |honey|maple)\b/, 'pantry'],
    [/\b(soap|detergent|paper towel|foil|wrap)\b/, 'household'],
  ];
  for (const [re, cat] of rules) {
    if (re.test(n)) return cat;
  }
  return 'other';
}

export function formatIngredientLine(ing: RecipeIngredient): string {
  const qty = [ing.quantity, ing.unit].filter(Boolean).join(' ').trim();
  const base = qty ? `${qty} ${ing.name}` : ing.name;
  return ing.note ? `${base} (${ing.note})` : base;
}

/** Scale factor from recipe servings → cook-for servings. */
export function scaleFactor(recipeServings: number | undefined, cookFor: number | undefined): number {
  const base = recipeServings && recipeServings > 0 ? recipeServings : 1;
  const target = cookFor && cookFor > 0 ? cookFor : base;
  return target / base;
}

function scaleQuantity(qty: string | undefined, factor: number): string | undefined {
  if (!qty || factor === 1) return qty;
  const trimmed = qty.trim();
  // simple n or n.n
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed) * factor;
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  }
  // a/b fraction
  const frac = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const n = (parseInt(frac[1]!, 10) / parseInt(frac[2]!, 10)) * factor;
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  }
  // leave free-form as-is (e.g. "a pinch")
  return qty;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Push recipe ingredients onto the shopping list.
 * - Scales quantities when cookFor ≠ recipe.servings
 * - Merges into an existing open item with the same name (case-insensitive)
 * - Assigns category from ingredient or guess
 */
export function addRecipeToShopping(
  shopping: ShoppingItem[],
  recipe: Recipe,
  opts: {
    createdById: string;
    cookFor?: number;
    /** Only these ingredient ids; default all. */
    ingredientIds?: string[];
    store?: string;
  },
): ShoppingItem[] {
  const factor = scaleFactor(recipe.servings, opts.cookFor);
  const want = new Set(opts.ingredientIds || recipe.ingredients.map((i) => i.id));
  const lines = recipe.ingredients.filter((i) => want.has(i.id) && i.name.trim());
  let next = [...shopping];
  const openByName = new Map<string, number>();
  next.forEach((s, idx) => {
    if (!s.bought) openByName.set(normalizeName(s.text), idx);
  });

  let maxSort = next.reduce((m, s) => Math.max(m, typeof s.sort === 'number' ? s.sort : 0), 0);

  for (const ing of lines) {
    const name = ing.name.trim();
    const key = normalizeName(name);
    const qty = scaleQuantity(ing.quantity, factor);
    const quantityStr = [qty, ing.unit].filter(Boolean).join(' ').trim() || undefined;
    const cat = categoryOf(ing.category || guessIngredientCategory(name));
    const existingIdx = openByName.get(key);

    if (existingIdx !== undefined) {
      const cur = next[existingIdx]!;
      // Prefer keeping existing quantity; append note that recipe also needs it
      const noteBits = [cur.brand, ing.note, recipe.title ? `from ${recipe.title}` : '']
        .filter(Boolean)
        .join(' · ');
      next[existingIdx] = {
        ...cur,
        quantity: cur.quantity || quantityStr,
        category: cur.category || cat,
        brand: noteBits || cur.brand,
        store: cur.store || opts.store,
      };
      continue;
    }

    maxSort += 1;
    const item: ShoppingItem = {
      id: uid(),
      text: name,
      quantity: quantityStr,
      category: cat,
      brand: ing.note || undefined,
      store: opts.store,
      bought: false,
      createdById: opts.createdById,
      createdAt: new Date().toISOString(),
      sort: maxSort,
    };
    openByName.set(key, next.length);
    next.push(item);
  }
  return next;
}

export function emptyIngredient(): RecipeIngredient {
  return { id: uid(), name: '', quantity: '', unit: '', category: undefined, note: '' };
}

/** Result from POST /api/recipe/parse */
export type ParsedRecipeResponse = {
  title: string;
  servings?: number;
  ingredients: { name: string; quantity?: string; unit?: string; note?: string }[];
  instructions?: string;
  parser?: 'ai' | 'heuristic';
  error?: string;
};

export async function parseRecipeFromText(text: string): Promise<ParsedRecipeResponse> {
  const res = await fetch('/api/recipe/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json()) as ParsedRecipeResponse;
  if (!res.ok) {
    throw new Error(data.error || `Parse failed (${res.status})`);
  }
  return data;
}
