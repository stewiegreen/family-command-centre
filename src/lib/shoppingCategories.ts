export type ShoppingCategory =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'bakery'
  | 'frozen'
  | 'pantry'
  | 'household'
  | 'personal_care'
  | 'other';

/** Fixed display order — roughly a typical grocery store walk. */
export const SHOPPING_CATEGORY_ORDER: ShoppingCategory[] = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'frozen',
  'pantry',
  'household',
  'personal_care',
  'other',
];

export const SHOPPING_CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  meat: 'Meat & Seafood',
  bakery: 'Bakery',
  frozen: 'Frozen',
  pantry: 'Pantry',
  household: 'Household',
  personal_care: 'Personal Care',
  other: 'Other',
};

/** Treat any missing/unrecognized category as 'other' — never crash on legacy items. */
export function categoryOf(category: string | undefined): ShoppingCategory {
  return (SHOPPING_CATEGORY_ORDER as string[]).includes(category || '')
    ? (category as ShoppingCategory)
    : 'other';
}

/**
 * Resolve store tab order from saved preference + currently present store names.
 * Saved order first; any new stores append alphabetically.
 */
export function resolveStoreOrder(
  saved: string[] | undefined | null,
  present: string[],
): string[] {
  const known = new Set(present);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const name of saved || []) {
    const n = (name || '').trim();
    if (!n || !known.has(n) || seen.has(n)) continue;
    ordered.push(n);
    seen.add(n);
  }
  const newcomers = present
    .filter((n) => !seen.has(n))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...newcomers];
}
