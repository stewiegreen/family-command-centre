import { useState } from 'react';
import { Plus, Trash2, ShoppingCart } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { uid } from '../lib/uid';

export function ShoppingPage() {
  const { data, update, currentUser, getMember, isParent } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const [shopText, setShopText] = useState('');
  const [shopStore, setShopStore] = useState('');

  const shopping = data.shopping || [];
  const openShop = shopping.filter((s) => !s.bought);
  const boughtShop = shopping.filter((s) => s.bought);

  const addShopping = () => {
    if (!shopText.trim()) return;
    update((d) => ({
      ...d,
      shopping: [
        {
          id: uid(),
          text: shopText.trim(),
          store: shopStore.trim() || undefined,
          claimedById: null,
          bought: false,
          createdById: myId,
          createdAt: new Date().toISOString(),
        },
        ...(d.shopping || []),
      ],
    }));
    setShopText('');
    setShopStore('');
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

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shopping</h1>
          <p className="text-sm text-muted mt-1">
            Shared list for the household — claim an item, then mark it bought.
          </p>
        </div>
        {boughtShop.length > 0 && (
          <button type="button" onClick={clearBought} className="text-sm text-muted hover:text-fg self-start sm:self-auto">
            Clear bought ({boughtShop.length})
          </button>
        )}
      </div>

      <Card className="!p-5 lg:!p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={shopText}
            onChange={(e) => setShopText(e.target.value)}
            placeholder="Milk, stamps, dog food…"
            onKeyDown={(e) => e.key === 'Enter' && addShopping()}
            className="flex-1"
          />
          <Input
            value={shopStore}
            onChange={(e) => setShopStore(e.target.value)}
            placeholder="Store (optional)"
            className="sm:w-40"
          />
          <Button onClick={addShopping} className="sm:shrink-0">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      </Card>

      {shopping.length === 0 ? (
        <Card className="!p-8">
          <EmptyState
            icon={ShoppingCart}
            title="List is empty"
            description="Add groceries or errands — anyone in the family can claim them."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {openShop.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide px-1">
                Need ({openShop.length})
              </h2>
              <div className="space-y-2">
                {openShop.map((s) => {
                  const claimer = s.claimedById ? getMember(s.claimedById) : null;
                  const canClaim = !s.claimedById || s.claimedById === myId;
                  const claimColor = claimer?.color;
                  return (
                    <Card
                      key={s.id}
                      className="!p-4 flex items-center gap-4 border-l-4"
                      style={
                        claimColor
                          ? {
                              borderLeftColor: claimColor,
                              backgroundColor: claimColor + '22',
                            }
                          : { borderLeftColor: 'transparent' }
                      }
                    >
                      <button
                        type="button"
                        onClick={() => toggleBought(s.id)}
                        className="w-6 h-6 rounded-lg border-2 border-border-strong flex items-center justify-center shrink-0 hover:border-accent transition-colors"
                        aria-label="Mark bought"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-fg">{s.text}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted items-center">
                          {s.store && <span className="px-2 py-0.5 rounded-md bg-surface-2">{s.store}</span>}
                          {claimer && (
                            <span className="inline-flex items-center gap-1.5" style={{ color: claimColor }}>
                              <Avatar {...claimer} size="sm" className="!w-6 !h-6 !text-sm" />
                              {claimer.id === myId ? 'You claimed this' : `${claimer.name} claimed this`}
                            </span>
                          )}
                        </div>
                      </div>
                      {canClaim && (
                        <Button size="sm" variant={s.claimedById === myId ? 'secondary' : 'ghost'} onClick={() => claimShopping(s.id)}>
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
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {boughtShop.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide px-1">
                Bought ({boughtShop.length})
              </h2>
              <div className="space-y-2 opacity-70">
                {boughtShop.map((s) => (
                  <Card key={s.id} className="!p-4 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => toggleBought(s.id)}
                      className="w-6 h-6 rounded-lg bg-accent border-2 border-accent flex items-center justify-center shrink-0 text-accent-ink text-xs"
                    >
                      ✓
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-base line-through text-muted">{s.text}</p>
                      {s.store && <span className="text-xs text-faint">{s.store}</span>}
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
