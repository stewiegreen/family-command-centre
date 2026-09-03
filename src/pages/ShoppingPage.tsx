import { useMemo, useState, type DragEvent } from 'react';
import {
  Plus,
  Trash2,
  ShoppingCart,
  GripVertical,
  Pencil,
  Check,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Archive,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';
import type { ShoppingCatalogItem, ShoppingItem } from '../types';
import { cn } from '../lib/cn';
import {
  SHOPPING_CATEGORY_LABELS,
  SHOPPING_CATEGORY_ORDER,
  categoryOf,
  resolveStoreOrder,
  type ShoppingCategory,
} from '../lib/shoppingCategories';

const ALL_STORES = '__all__';
const NO_STORE = '__none__';

function itemSortKey(s: ShoppingItem): number {
  return typeof s.sort === 'number' ? s.sort : Number.MAX_SAFE_INTEGER;
}

function sortItems(list: ShoppingItem[]): ShoppingItem[] {
  return [...list].sort((a, b) => {
    const ds = itemSortKey(a) - itemSortKey(b);
    if (ds !== 0) return ds;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
}

function catalogSortKey(c: ShoppingCatalogItem): number {
  return typeof c.sort === 'number' ? c.sort : Number.MAX_SAFE_INTEGER;
}

type EditDraft = {
  id: string;
  text: string;
  quantity: string;
  brand: string;
  store: string;
  category: string;
};

type CatalogDraft = {
  id?: string;
  text: string;
  category: string;
  defaultQuantity: string;
  defaultBrand: string;
  defaultStore: string;
};

export function ShoppingPage() {
  const { data, update, currentUser, isParent } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;

  const [shopText, setShopText] = useState('');
  const [shopQty, setShopQty] = useState('');
  const [shopBrand, setShopBrand] = useState('');
  const [shopStore, setShopStore] = useState('');
  const [shopCategory, setShopCategory] = useState<string>('other');
  const [activeStore, setActiveStore] = useState<string>(ALL_STORES);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [tabDrag, setTabDrag] = useState<string | null>(null);
  const [tabOver, setTabOver] = useState<string | null>(null);
  const [usualOpen, setUsualOpen] = useState(false);
  const [manageCatalog, setManageCatalog] = useState(false);
  const [catalogForm, setCatalogForm] = useState<CatalogDraft | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showArchivedCatalog, setShowArchivedCatalog] = useState(false);

  const shopping = data.shopping || [];
  const catalog = data.shoppingCatalog || [];

  const presentStores = useMemo(() => {
    const set = new Set<string>();
    for (const s of shopping) {
      const st = (s.store || '').trim();
      if (st) set.add(st);
    }
    for (const c of catalog) {
      const st = (c.defaultStore || '').trim();
      if (st) set.add(st);
    }
    return Array.from(set);
  }, [shopping, catalog]);

  const storeNames = useMemo(
    () => resolveStoreOrder(data.shoppingStoreOrder, presentStores),
    [data.shoppingStoreOrder, presentStores],
  );

  const matchesSearch = (s: { text?: string; brand?: string; store?: string }) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.text || '').toLowerCase().includes(q) ||
      (s.brand || '').toLowerCase().includes(q) ||
      (s.store || '').toLowerCase().includes(q)
    );
  };

  const openShop = useMemo(
    () => sortItems(shopping.filter((s) => !s.bought)),
    [shopping],
  );
  const boughtShop = useMemo(
    () => sortItems(shopping.filter((s) => s.bought)),
    [shopping],
  );

  const filterByStore = (list: ShoppingItem[]) => {
    if (activeStore === ALL_STORES) return list;
    if (activeStore === NO_STORE) return list.filter((s) => !(s.store || '').trim());
    return list.filter((s) => (s.store || '').trim() === activeStore);
  };

  const visibleOpen = filterByStore(openShop).filter(matchesSearch);
  const visibleBought = filterByStore(boughtShop).filter(matchesSearch);

  const openByCategory = useMemo(() => {
    const map = new Map<ShoppingCategory, ShoppingItem[]>();
    for (const cat of SHOPPING_CATEGORY_ORDER) map.set(cat, []);
    for (const item of visibleOpen) {
      const cat = categoryOf(item.category);
      map.get(cat)!.push(item);
    }
    return SHOPPING_CATEGORY_ORDER.map((cat) => ({
      cat,
      items: map.get(cat) || [],
    })).filter((g) => g.items.length > 0);
  }, [visibleOpen]);

  const activeCatalog = useMemo(
    () =>
      [...catalog.filter((c) => !c.archived)].sort(
        (a, b) => catalogSortKey(a) - catalogSortKey(b) || a.text.localeCompare(b.text),
      ),
    [catalog],
  );
  const archivedCatalog = useMemo(
    () =>
      [...catalog.filter((c) => c.archived)].sort((a, b) =>
        a.text.localeCompare(b.text),
      ),
    [catalog],
  );

  const catalogByCategory = useMemo(() => {
    const map = new Map<ShoppingCategory, ShoppingCatalogItem[]>();
    for (const cat of SHOPPING_CATEGORY_ORDER) map.set(cat, []);
    for (const item of activeCatalog) {
      map.get(categoryOf(item.category))!.push(item);
    }
    return SHOPPING_CATEGORY_ORDER.map((cat) => ({
      cat,
      items: map.get(cat) || [],
    })).filter((g) => g.items.length > 0);
  }, [activeCatalog]);

  const nextSort = () => {
    const max = shopping.reduce(
      (m, s) => Math.max(m, itemSortKey(s) === Number.MAX_SAFE_INTEGER ? -1 : itemSortKey(s)),
      -1,
    );
    return max + 1;
  };

  const nextCatalogSort = () => {
    const max = catalog.reduce((m, c) => Math.max(m, catalogSortKey(c)), -1);
    return max + 1;
  };

  const addShopping = () => {
    if (!shopText.trim()) return;
    const store = (
      shopStore.trim() ||
      (activeStore !== ALL_STORES && activeStore !== NO_STORE ? activeStore : '')
    ).trim();
    const cat = categoryOf(shopCategory);
    update((d) => ({
      ...d,
      shopping: [
        {
          id: uid(),
          text: shopText.trim(),
          quantity: shopQty.trim() || undefined,
          brand: shopBrand.trim() || undefined,
          store: store || undefined,
          category: cat,
          sort: nextSort(),
          claimedById: null,
          bought: false,
          createdById: myId,
          createdAt: new Date().toISOString(),
        },
        ...(d.shopping || []),
      ],
    }));
    setShopText('');
    setShopQty('');
    setShopBrand('');
    // keep store + category for rapid multi-add
  };

  const toggleBought = (id: string) => {
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) =>
        s.id === id ? { ...s, bought: !s.bought } : s,
      ),
    }));
  };

  const removeShopping = (id: string, createdById: string) => {
    if (!isParent && createdById !== myId) return;
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).filter((s) => s.id !== id),
    }));
  };

  const clearBought = () => {
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).filter(
        (s) => !s.bought || (!isParent && s.createdById !== myId),
      ),
    }));
  };

  const startEdit = (s: ShoppingItem) => {
    setEdit({
      id: s.id,
      text: s.text,
      quantity: s.quantity || '',
      brand: s.brand || '',
      store: s.store || '',
      category: categoryOf(s.category),
    });
  };

  const saveEdit = () => {
    if (!edit || !edit.text.trim()) return;
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) =>
        s.id === edit.id
          ? {
              ...s,
              text: edit.text.trim(),
              quantity: edit.quantity.trim() || undefined,
              brand: edit.brand.trim() || undefined,
              store: edit.store.trim() || undefined,
              category: categoryOf(edit.category),
            }
          : s,
      ),
    }));
    setEdit(null);
  };

  /**
   * Reorder open items. Dropping onto an item in another category also
   * re-assigns the dragged item's category to match the drop target.
   */
  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const open = sortItems(shopping.filter((s) => !s.bought));
    const fromIdx = open.findIndex((s) => s.id === fromId);
    const toIdx = open.findIndex((s) => s.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const targetCat = categoryOf(open[toIdx]!.category);
    const next = [...open];
    const [moved] = next.splice(fromIdx, 1);
    const movedWithCat = { ...moved!, category: targetCat };
    // re-find insert index after removal
    const insertAt = next.findIndex((s) => s.id === toId);
    if (insertAt < 0) next.push(movedWithCat);
    else next.splice(insertAt, 0, movedWithCat);
    const sortMap = new Map(next.map((s, i) => [s.id, i]));
    const catMap = new Map(next.map((s) => [s.id, s.category]));
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) =>
        sortMap.has(s.id)
          ? { ...s, sort: sortMap.get(s.id)!, category: catMap.get(s.id) }
          : s,
      ),
    }));
  };

  const onDragStart = (e: DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOver = (e: DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverId(id);
  };
  const onDrop = (e: DragEvent, id: string) => {
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain') || dragId;
    if (from) reorder(from, id);
    setDragId(null);
    setOverId(null);
  };
  const onDragEnd = () => {
    setDragId(null);
    setOverId(null);
  };

  const persistStoreOrder = (order: string[]) => {
    update((d) => ({ ...d, shoppingStoreOrder: order }));
  };

  const moveStoreTab = (name: string, dir: -1 | 1) => {
    const idx = storeNames.indexOf(name);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= storeNames.length) return;
    const next = [...storeNames];
    const [x] = next.splice(idx, 1);
    next.splice(j, 0, x!);
    persistStoreOrder(next);
  };

  const onTabDragStart = (e: DragEvent, name: string) => {
    setTabDrag(name);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name);
  };
  const onTabDrop = (e: DragEvent, name: string) => {
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain') || tabDrag;
    setTabDrag(null);
    setTabOver(null);
    if (!from || from === name) return;
    const next = [...storeNames];
    const fromIdx = next.indexOf(from);
    const toIdx = next.indexOf(name);
    if (fromIdx < 0 || toIdx < 0) return;
    const [x] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, x!);
    persistStoreOrder(next);
  };

  const addFromCatalog = (tpl: ShoppingCatalogItem) => {
    const id = uid();
    update((d) => ({
      ...d,
      shopping: [
        {
          id,
          text: tpl.text,
          quantity: tpl.defaultQuantity || undefined,
          brand: tpl.defaultBrand || undefined,
          store: tpl.defaultStore || undefined,
          category: categoryOf(tpl.category),
          sort: nextSort(),
          claimedById: null,
          bought: false,
          createdById: myId,
          createdAt: new Date().toISOString(),
        },
        ...(d.shopping || []),
      ],
    }));
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 900);
  };

  const saveCatalogForm = () => {
    if (!catalogForm || !catalogForm.text.trim()) return;
    const payload = {
      text: catalogForm.text.trim(),
      category: categoryOf(catalogForm.category),
      defaultQuantity: catalogForm.defaultQuantity.trim() || undefined,
      defaultBrand: catalogForm.defaultBrand.trim() || undefined,
      defaultStore: catalogForm.defaultStore.trim() || undefined,
    };
    if (catalogForm.id) {
      update((d) => ({
        ...d,
        shoppingCatalog: (d.shoppingCatalog || []).map((c) =>
          c.id === catalogForm.id ? { ...c, ...payload } : c,
        ),
      }));
    } else {
      update((d) => ({
        ...d,
        shoppingCatalog: [
          ...(d.shoppingCatalog || []),
          {
            id: uid(),
            ...payload,
            archived: false,
            sort: nextCatalogSort(),
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    }
    setCatalogForm(null);
  };

  const archiveCatalogItem = (id: string) => {
    update((d) => ({
      ...d,
      shoppingCatalog: (d.shoppingCatalog || []).map((c) =>
        c.id === id ? { ...c, archived: true } : c,
      ),
    }));
  };
  const restoreCatalogItem = (id: string) => {
    update((d) => ({
      ...d,
      shoppingCatalog: (d.shoppingCatalog || []).map((c) =>
        c.id === id ? { ...c, archived: false } : c,
      ),
    }));
  };
  const deleteCatalogItem = (id: string) => {
    update((d) => ({
      ...d,
      shoppingCatalog: (d.shoppingCatalog || []).filter((c) => c.id !== id),
    }));
  };

  const storeTabs: { id: string; label: string; count: number }[] = [
    { id: ALL_STORES, label: 'All', count: openShop.length },
    ...storeNames.map((name) => ({
      id: name,
      label: name,
      count: openShop.filter((s) => (s.store || '').trim() === name).length,
    })),
    {
      id: NO_STORE,
      label: 'No store',
      count: openShop.filter((s) => !(s.store || '').trim()).length,
    },
  ].filter((t) => t.id === ALL_STORES || t.count > 0 || t.id === activeStore);

  const categorySelect = (
    value: string,
    onChange: (v: string) => void,
    className?: string,
  ) => (
    <select
      value={categoryOf(value)}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'rounded-xl border border-border bg-inset px-3 py-2 text-sm text-fg outline-none focus:border-accent',
        className,
      )}
    >
      {SHOPPING_CATEGORY_ORDER.map((c) => (
        <option key={c} value={c}>
          {SHOPPING_CATEGORY_LABELS[c]}
        </option>
      ))}
    </select>
  );

  const renderOpenItem = (s: ShoppingItem) => {
    const isEditing = edit?.id === s.id;

    if (isEditing && edit) {
      return (
        <Card key={s.id} className="!p-4 space-y-2 border-accent">
          <Input
            value={edit.text}
            onChange={(e) => setEdit({ ...edit, text: e.target.value })}
            autoFocus
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Input
              value={edit.quantity}
              onChange={(e) => setEdit({ ...edit, quantity: e.target.value })}
              placeholder="Qty"
            />
            <Input
              value={edit.brand}
              onChange={(e) => setEdit({ ...edit, brand: e.target.value })}
              placeholder="Brand"
            />
            <Input
              value={edit.store}
              onChange={(e) => setEdit({ ...edit, store: e.target.value })}
              placeholder="Store"
            />
            {categorySelect(edit.category, (v) => setEdit({ ...edit, category: v }))}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEdit(null)}>
              <X className="w-4 h-4" /> Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={!edit.text.trim()}>
              <Check className="w-4 h-4" /> Save
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <Card
        key={s.id}
        draggable
        onDragStart={(e) => onDragStart(e, s.id)}
        onDragOver={(e) => onDragOver(e, s.id)}
        onDrop={(e) => onDrop(e, s.id)}
        onDragEnd={onDragEnd}
        className={cn(
          '!p-3 sm:!p-4 flex items-center gap-2 sm:gap-3 border-l-4 border-l-transparent cursor-grab active:cursor-grabbing',
          dragId === s.id && 'opacity-40',
          overId === s.id && dragId !== s.id && 'ring-2 ring-accent/40',
          flashId === s.id && 'ring-2 ring-accent',
        )}
      >
        <GripVertical className="w-4 h-4 text-faint shrink-0" />
        <button
          type="button"
          onClick={() => toggleBought(s.id)}
          className="w-6 h-6 rounded-lg border-2 border-border-strong flex items-center justify-center shrink-0 hover:border-accent transition-colors"
          aria-label="Mark bought"
        />
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-fg">
            {s.quantity && (
              <span className="text-accent font-semibold mr-1.5">{s.quantity}</span>
            )}
            {s.text}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1 text-xs text-muted items-center">
            {s.brand && (
              <span className="px-2 py-0.5 rounded-md bg-surface-2 text-fg-secondary">
                {s.brand}
              </span>
            )}
            {s.store && activeStore === ALL_STORES && (
              <span className="px-2 py-0.5 rounded-md bg-surface-2">{s.store}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(isParent || s.createdById === myId) && (
            <button
              type="button"
              onClick={() => startEdit(s)}
              className="p-2 text-faint hover:text-accent rounded-lg hover:bg-accent/10"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {(isParent || s.createdById === myId) && (
            <button
              type="button"
              onClick={() => removeShopping(s.id, s.createdById)}
              className="p-2 text-faint hover:text-red-400 rounded-lg hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shopping</h1>
          <p className="text-sm text-muted mt-1">
            Categories, usual items, store tabs — drag to reorder aisle by aisle.
          </p>
        </div>
        {boughtShop.length > 0 && (
          <button
            type="button"
            onClick={clearBought}
            className="text-sm text-muted hover:text-fg self-start sm:self-auto"
          >
            Clear bought ({boughtShop.length})
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items, brands, stores…"
          className="!pl-9 pr-9"
        />
        {search.trim() && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-faint hover:text-fg"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Add form */}
      <Card className="!p-4 lg:!p-5 space-y-3">
        <Input
          value={shopText}
          onChange={(e) => setShopText(e.target.value)}
          placeholder="Item (milk, stamps, dog food…)"
          onKeyDown={(e) => e.key === 'Enter' && addShopping()}
        />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Input
            value={shopQty}
            onChange={(e) => setShopQty(e.target.value)}
            placeholder="Qty (2, 500g)"
            onKeyDown={(e) => e.key === 'Enter' && addShopping()}
          />
          <Input
            value={shopBrand}
            onChange={(e) => setShopBrand(e.target.value)}
            placeholder="Brand / note"
            onKeyDown={(e) => e.key === 'Enter' && addShopping()}
          />
          <Input
            value={shopStore}
            onChange={(e) => setShopStore(e.target.value)}
            placeholder="Store"
            list="fcc-store-suggestions"
            onKeyDown={(e) => e.key === 'Enter' && addShopping()}
          />
          <datalist id="fcc-store-suggestions">
            {storeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {categorySelect(shopCategory, setShopCategory)}
          <Button onClick={addShopping} className="w-full">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </Card>

      {/* Usual Items catalog */}
      <Card className="!p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setUsualOpen((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-fg"
          >
            <ChevronRight
              className={cn('w-4 h-4 transition-transform', usualOpen && 'rotate-90')}
            />
            Usual Items
            <span className="text-xs font-normal text-muted">
              ({activeCatalog.length})
            </span>
          </button>
          <div className="flex items-center gap-2">
            {usualOpen && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setManageCatalog((v) => !v);
                  setCatalogForm(null);
                }}
              >
                {manageCatalog ? 'Done' : 'Manage'}
              </Button>
            )}
          </div>
        </div>
        {usualOpen && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Tap a chip to add it to the list. Templates stay for next time.
            </p>
            {manageCatalog && (
              <div className="space-y-2 border border-border rounded-xl p-3 bg-inset/40">
                {catalogForm ? (
                  <div className="space-y-2">
                    <Input
                      value={catalogForm.text}
                      onChange={(e) =>
                        setCatalogForm({ ...catalogForm, text: e.target.value })
                      }
                      placeholder="Usual item name"
                      autoFocus
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Input
                        value={catalogForm.defaultQuantity}
                        onChange={(e) =>
                          setCatalogForm({
                            ...catalogForm,
                            defaultQuantity: e.target.value,
                          })
                        }
                        placeholder="Default qty"
                      />
                      <Input
                        value={catalogForm.defaultBrand}
                        onChange={(e) =>
                          setCatalogForm({
                            ...catalogForm,
                            defaultBrand: e.target.value,
                          })
                        }
                        placeholder="Default brand"
                      />
                      <Input
                        value={catalogForm.defaultStore}
                        onChange={(e) =>
                          setCatalogForm({
                            ...catalogForm,
                            defaultStore: e.target.value,
                          })
                        }
                        placeholder="Default store"
                      />
                      {categorySelect(catalogForm.category, (v) =>
                        setCatalogForm({ ...catalogForm, category: v }),
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setCatalogForm(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveCatalogForm}
                        disabled={!catalogForm.text.trim()}
                      >
                        {catalogForm.id ? 'Save' : 'Add template'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      setCatalogForm({
                        text: '',
                        category: shopCategory || 'other',
                        defaultQuantity: '',
                        defaultBrand: '',
                        defaultStore: shopStore || '',
                      })
                    }
                  >
                    <Plus className="w-4 h-4" /> New usual item
                  </Button>
                )}
              </div>
            )}

            {catalogByCategory.length === 0 ? (
              <p className="text-sm text-muted text-center py-2">
                No usual items yet
                {manageCatalog ? ' — add one above.' : '. Open Manage to create templates.'}
              </p>
            ) : (
              catalogByCategory.map(({ cat, items }) => (
                <div key={cat} className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-faint px-0.5">
                    {SHOPPING_CATEGORY_LABELS[cat]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {items.map((tpl) => (
                      <div key={tpl.id} className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => addFromCatalog(tpl)}
                          className="px-3 py-1.5 rounded-full text-sm border border-border bg-surface hover:border-accent hover:bg-accent/10 transition-colors"
                          title="Add to list"
                        >
                          {tpl.text}
                          {tpl.defaultQuantity ? ` · ${tpl.defaultQuantity}` : ''}
                        </button>
                        {manageCatalog && (
                          <>
                            <button
                              type="button"
                              className="p-1.5 text-faint hover:text-accent"
                              title="Edit"
                              onClick={() =>
                                setCatalogForm({
                                  id: tpl.id,
                                  text: tpl.text,
                                  category: categoryOf(tpl.category),
                                  defaultQuantity: tpl.defaultQuantity || '',
                                  defaultBrand: tpl.defaultBrand || '',
                                  defaultStore: tpl.defaultStore || '',
                                })
                              }
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 text-faint hover:text-amber-600"
                              title="Archive"
                              onClick={() => archiveCatalogItem(tpl.id)}
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 text-faint hover:text-red-400"
                              title="Delete forever"
                              onClick={() => deleteCatalogItem(tpl.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {manageCatalog && archivedCatalog.length > 0 && (
              <div className="pt-2 border-t border-border space-y-2">
                <button
                  type="button"
                  className="text-xs text-muted hover:text-fg"
                  onClick={() => setShowArchivedCatalog((v) => !v)}
                >
                  {showArchivedCatalog ? 'Hide' : 'Show'} archived ({archivedCatalog.length})
                </button>
                {showArchivedCatalog &&
                  archivedCatalog.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex items-center gap-2 text-sm text-muted"
                    >
                      <span className="flex-1 truncate">{tpl.text}</span>
                      <button
                        type="button"
                        className="p-1.5 hover:text-accent"
                        title="Restore"
                        onClick={() => restoreCatalogItem(tpl.id)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 hover:text-red-400"
                        title="Delete forever"
                        onClick={() => deleteCatalogItem(tpl.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Store tabs — drag + up/down fallback */}
      {shopping.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {storeTabs.map((t) => {
            const isNamed = t.id !== ALL_STORES && t.id !== NO_STORE;
            const canReorder = isNamed && storeNames.length > 1;
            return (
              <div key={t.id} className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  draggable={canReorder}
                  onDragStart={
                    canReorder ? (e) => onTabDragStart(e, t.id) : undefined
                  }
                  onDragOver={
                    canReorder
                      ? (e) => {
                          e.preventDefault();
                          setTabOver(t.id);
                        }
                      : undefined
                  }
                  onDrop={canReorder ? (e) => onTabDrop(e, t.id) : undefined}
                  onDragEnd={() => {
                    setTabDrag(null);
                    setTabOver(null);
                  }}
                  onClick={() => setActiveStore(t.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    activeStore === t.id
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border-strong text-muted hover:bg-nav-hover hover:text-fg',
                    tabDrag === t.id && 'opacity-40',
                    tabOver === t.id && tabDrag && tabDrag !== t.id && 'ring-2 ring-accent/40',
                    canReorder && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs opacity-70">{t.count}</span>
                </button>
                {canReorder && (
                  <span className="flex flex-col -space-y-1">
                    <button
                      type="button"
                      className="p-0.5 text-faint hover:text-fg"
                      title="Move tab left"
                      onClick={() => moveStoreTab(t.id, -1)}
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 text-faint hover:text-fg"
                      title="Move tab right"
                      onClick={() => moveStoreTab(t.id, 1)}
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {shopping.length === 0 ? (
        <Card className="!p-8">
          <EmptyState
            icon={ShoppingCart}
            title="List is empty"
            description="Add items with category, quantity, brand, and store — or tap a Usual Item."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {openByCategory.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide px-1">
                Need ({visibleOpen.length})
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {openByCategory.map(({ cat, items }) => (
                  <div key={cat} className="space-y-2">
                    <h3 className="text-xs font-semibold text-faint uppercase tracking-wide px-1">
                      {SHOPPING_CATEGORY_LABELS[cat]}
                      <span className="ml-1.5 font-normal opacity-70">{items.length}</span>
                    </h3>
                    <div className="space-y-2">{items.map(renderOpenItem)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visibleOpen.length === 0 && visibleBought.length === 0 && (
            <Card className="!p-6">
              <p className="text-sm text-muted text-center">
                {search.trim()
                  ? 'No items match your search.'
                  : 'Nothing in this store list.'}
              </p>
            </Card>
          )}

          {visibleBought.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide px-1">
                Bought ({visibleBought.length})
              </h2>
              <div className="space-y-2 opacity-70">
                {visibleBought.map((s) => (
                  <Card key={s.id} className="!p-4 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleBought(s.id)}
                      className="w-6 h-6 rounded-lg bg-accent border-2 border-accent flex items-center justify-center shrink-0 text-accent-ink text-xs"
                    >
                      ✓
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-base line-through text-muted">
                        {s.quantity ? `${s.quantity} ` : ''}
                        {s.text}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-faint">
                        {s.brand && <span>{s.brand}</span>}
                        {s.store && <span>{s.store}</span>}
                        <span>{SHOPPING_CATEGORY_LABELS[categoryOf(s.category)]}</span>
                      </div>
                    </div>
                    {(isParent || s.createdById === myId) && (
                      <button
                        type="button"
                        onClick={() => removeShopping(s.id, s.createdById)}
                        className="p-2 text-faint hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
