import type { Recipe, RecipeIngredient, ShoppingItem } from '../types';

/** Suggested tag chips — users can still add any custom tag. */
export const SUGGESTED_RECIPE_TAGS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'quick',
  'cheap',
  'favorite',
  'kids',
  'vegetarian',
  'batch',
] as const;

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeTags(tags: string[] | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags || []) {
    const n = normalizeTag(t);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function recipeMatchesSearch(recipe: Recipe, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (recipe.title.toLowerCase().includes(q)) return true;
  if ((recipe.source || '').toLowerCase().includes(q)) return true;
  if ((recipe.instructions || '').toLowerCase().includes(q)) return true;
  for (const tag of recipe.tags || []) {
    if (tag.includes(q)) return true;
  }
  for (const ing of recipe.ingredients || []) {
    if (ing.name.toLowerCase().includes(q)) return true;
  }
  return false;
}

/** Active filters: recipe must include every selected tag (AND). */
export function recipeMatchesTags(recipe: Recipe, selected: string[]): boolean {
  if (!selected.length) return true;
  const have = new Set((recipe.tags || []).map(normalizeTag));
  return selected.every((t) => have.has(normalizeTag(t)));
}
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

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Push recipe ingredients onto the shopping list.
 * - Uses ingredient **names only** (no 2 tsp / 1 egg / 2 cups on the list)
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

  // Shopping list gets names only — recipe amounts (2 tsp, 1 egg, 2 cups) are not useful at the store.
  void factor;

  for (const ing of lines) {
    const name = ing.name.trim();
    const key = normalizeName(name);
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
      // Intentionally omit quantity/unit from recipes
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
  /** Whether env.AI was present on the server for this request */
  aiBound?: boolean;
  /** Why AI was not used (binding missing, model error, empty result) */
  aiError?: string;
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
