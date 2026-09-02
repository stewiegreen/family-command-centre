import { useMemo, useState, type DragEvent } from 'react';
import { Plus, Trash2, ShoppingCart, GripVertical, Pencil, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';
import type { ShoppingItem } from '../types';
import { cn } from '../lib/cn';

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

type EditDraft = {
  id: string;
  text: string;
  quantity: string;
  brand: string;
  store: string;
};

export function ShoppingPage() {
  const { data, update, currentUser, getMember, isParent } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;

  const [shopText, setShopText] = useState('');
  const [shopQty, setShopQty] = useState('');
  const [shopBrand, setShopBrand] = useState('');
  const [shopStore, setShopStore] = useState('');
  const [activeStore, setActiveStore] = useState<string>(ALL_STORES);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const shopping = data.shopping || [];

  const storeNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of shopping) {
      const st = (s.store || '').trim();
      if (st) set.add(st);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [shopping]);

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

  const visibleOpen = filterByStore(openShop);
  const visibleBought = filterByStore(boughtShop);

  const nextSort = () => {
    const max = shopping.reduce((m, s) => Math.max(m, itemSortKey(s) === Number.MAX_SAFE_INTEGER ? -1 : itemSortKey(s)), -1);
    return max + 1;
  };

  const addShopping = () => {
    if (!shopText.trim()) return;
    const store = (shopStore.trim() || (activeStore !== ALL_STORES && activeStore !== NO_STORE ? activeStore : '')).trim();
    update((d) => ({
      ...d,
      shopping: [
        {
          id: uid(),
          text: shopText.trim(),
          quantity: shopQty.trim() || undefined,
          brand: shopBrand.trim() || undefined,
          store: store || undefined,
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
    // keep store field for rapid multi-add at same store
  };

  const claimShopping = (id: string) => {
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) => {
        if (s.id !== id) return s;
        if (s.claimedById === myId) return { ...s, claimedById: null };
        if (s.claimedById && s.claimedById !== myId) return s;
        return { ...s, claimedById: myId };
      }),
    }));
  };

  const toggleBought = (id: string) => {
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) => (s.id === id ? { ...s, bought: !s.bought } : s)),
    }));
  };

  const removeShopping = (id: string, createdById: string) => {
    if (!isParent && createdById !== myId) return;
    update((d) => ({ ...d, shopping: (d.shopping || []).filter((s) => s.id !== id) }));
  };

  const clearBought = () => {
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).filter((s) => !s.bought || (!isParent && s.createdById !== myId)),
    }));
  };

  const startEdit = (s: ShoppingItem) => {
    setEdit({
      id: s.id,
      text: s.text,
      quantity: s.quantity || '',
      brand: s.brand || '',
      store: s.store || '',
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
            }
          : s,
      ),
    }));
    setEdit(null);
  };

  /** Reorder open items: move dragId before/after targetId within the full shopping array sorts. */
  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const open = sortItems(shopping.filter((s) => !s.bought));
    const fromIdx = open.findIndex((s) => s.id === fromId);
    const toIdx = open.findIndex((s) => s.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...open];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    // Assign sequential sort 0..n for open items; leave bought sorts alone
    const sortMap = new Map(next.map((s, i) => [s.id, i]));
    update((d) => ({
      ...d,
      shopping: (d.shopping || []).map((s) =>
        sortMap.has(s.id) ? { ...s, sort: sortMap.get(s.id)! } : s,
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

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shopping</h1>
          <p className="text-sm text-muted mt-1">
            Quantities, brands, store lists — drag to reorder. Claim items while you shop.
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

      {/* Add form */}
      <Card className="!p-4 lg:!p-5 space-y-3">
        <Input
          value={shopText}
          onChange={(e) => setShopText(e.target.value)}
          placeholder="Item (milk, stamps, dog food…)"
          onKeyDown={(e) => e.key === 'Enter' && addShopping()}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
          <Button onClick={addShopping} className="w-full">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </Card>

      {/* Store tabs */}
      {shopping.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {storeTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveStore(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                activeStore === t.id
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border-strong text-muted hover:bg-nav-hover hover:text-fg',
              )}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-70">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {shopping.length === 0 ? (
        <Card className="!p-8">
          <EmptyState
            icon={ShoppingCart}
            title="List is empty"
            description="Add items with quantity, brand, and store — then drag to put them in aisle order."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleOpen.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide px-1">
                Need ({visibleOpen.length})
              </h2>
              <div className="space-y-2">
                {visibleOpen.map((s) => {
                  const claimer = s.claimedById ? getMember(s.claimedById) : null;
                  const canClaim = !s.claimedById || s.claimedById === myId;
                  const claimColor = claimer?.color;
                  const isEditing = edit?.id === s.id;

                  if (isEditing && edit) {
                    return (
                      <Card key={s.id} className="!p-4 space-y-2 border-accent">
                        <Input
                          value={edit.text}
                          onChange={(e) => setEdit({ ...edit, text: e.target.value })}
                          autoFocus
                        />
                        <div className="grid grid-cols-3 gap-2">
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
                        '!p-3 sm:!p-4 flex items-center gap-2 sm:gap-3 border-l-4 cursor-grab active:cursor-grabbing',
                        dragId === s.id && 'opacity-40',
                        overId === s.id && dragId !== s.id && 'ring-2 ring-accent/40',
                      )}
                      style={
                        claimColor
                          ? {
                              borderLeftColor: claimColor,
                              backgroundColor: claimColor + '22',
                            }
                          : { borderLeftColor: 'transparent' }
                      }
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
                          {claimer && (
                            <span
                              className="inline-flex items-center gap-1.5"
                              style={{ color: claimColor }}
                            >
                              <Avatar {...claimer} size="sm" className="!w-6 !h-6 !text-sm" />
                              {claimer.id === myId ? 'You' : claimer.name}
                            </span>
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
                        {canClaim && (
                          <Button
                            size="sm"
                            variant={s.claimedById === myId ? 'secondary' : 'ghost'}
                            onClick={() => claimShopping(s.id)}
                          >
                            {s.claimedById === myId ? 'Unclaim' : 'Claim'}
                          </Button>
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
                })}
              </div>
            </section>
          )}

          {visibleOpen.length === 0 && visibleBought.length === 0 && (
            <Card className="!p-6">
              <p className="text-sm text-muted text-center">Nothing in this store list.</p>
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
