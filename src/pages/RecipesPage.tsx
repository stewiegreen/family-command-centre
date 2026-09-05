import { useMemo, useState } from 'react';
import { ChefHat, Plus, Pencil, Trash2, ShoppingCart, Archive, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { uid } from '../lib/uid';
import {
  addRecipeToShopping,
  emptyIngredient,
  formatIngredientLine,
} from '../lib/recipes';
import {
  SHOPPING_CATEGORY_LABELS,
  SHOPPING_CATEGORY_ORDER,
  type ShoppingCategory,
} from '../lib/shoppingCategories';
import type { Recipe, RecipeIngredient } from '../types';
import { cn } from '../lib/cn';

type FormState = {
  id?: string;
  title: string;
  servings: string;
  source: string;
  instructions: string;
  ingredients: RecipeIngredient[];
};

function blankForm(): FormState {
  return {
    title: '',
    servings: '4',
    source: '',
    instructions: '',
    ingredients: [emptyIngredient(), emptyIngredient(), emptyIngredient()],
  };
}

export function RecipesPage() {
  const { data, update, currentUser, getMember, setView } = useApp();
  const myId = currentUser?.id || data.settings.currentUserId;
  const recipes = data.recipes || [];

  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [shopOpen, setShopOpen] = useState<Recipe | null>(null);
  const [viewRecipe, setViewRecipe] = useState<Recipe | null>(null);
  const [cookFor, setCookFor] = useState('');
  const [selectedIng, setSelectedIng] = useState<Record<string, boolean>>({});
  const [store, setStore] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const active = useMemo(
    () => recipes.filter((r) => !r.archived).sort((a, b) => a.title.localeCompare(b.title)),
    [recipes],
  );
  const archived = useMemo(
    () => recipes.filter((r) => r.archived).sort((a, b) => a.title.localeCompare(b.title)),
    [recipes],
  );
  const list = showArchived ? archived : active;

  const openNew = () => {
    setForm(blankForm());
    setFormOpen(true);
  };

  const openEdit = (r: Recipe) => {
    setForm({
      id: r.id,
      title: r.title,
      servings: r.servings != null ? String(r.servings) : '',
      source: r.source || '',
      instructions: r.instructions || '',
      ingredients:
        r.ingredients.length > 0
          ? r.ingredients.map((i) => ({ ...i }))
          : [emptyIngredient()],
    });
    setFormOpen(true);
  };

  const saveForm = () => {
    const title = form.title.trim();
    if (!title) return;
    const ingredients = form.ingredients
      .map((i) => ({
        ...i,
        name: i.name.trim(),
        quantity: i.quantity?.trim() || undefined,
        unit: i.unit?.trim() || undefined,
        note: i.note?.trim() || undefined,
        category: i.category || undefined,
      }))
      .filter((i) => i.name);
    if (ingredients.length === 0) {
      alert('Add at least one ingredient.');
      return;
    }
    const servingsNum = form.servings.trim() ? parseFloat(form.servings) : undefined;
    const now = new Date().toISOString();

    update((d) => {
      const list = d.recipes || [];
      if (form.id) {
        return {
          ...d,
          recipes: list.map((r) =>
            r.id === form.id
              ? {
                  ...r,
                  title,
                  servings: Number.isFinite(servingsNum) ? servingsNum : undefined,
                  source: form.source.trim() || undefined,
                  instructions: form.instructions.trim() || undefined,
                  ingredients,
                  updatedAt: now,
                }
              : r,
          ),
        };
      }
      const recipe: Recipe = {
        id: uid(),
        title,
        servings: Number.isFinite(servingsNum) ? servingsNum : undefined,
        source: form.source.trim() || undefined,
        instructions: form.instructions.trim() || undefined,
        ingredients,
        createdById: myId,
        createdAt: now,
        updatedAt: now,
      };
      return { ...d, recipes: [recipe, ...list] };
    });
    setFormOpen(false);
  };

  const setArchived = (id: string, archived: boolean) => {
    update((d) => ({
      ...d,
      recipes: (d.recipes || []).map((r) =>
        r.id === id ? { ...r, archived, updatedAt: new Date().toISOString() } : r,
      ),
    }));
  };

  const removeRecipe = (id: string) => {
    if (!confirm('Delete this recipe permanently?')) return;
    update((d) => ({ ...d, recipes: (d.recipes || []).filter((r) => r.id !== id) }));
  };

  const openShop = (r: Recipe) => {
    setShopOpen(r);
    setCookFor(r.servings != null ? String(r.servings) : '');
    const sel: Record<string, boolean> = {};
    r.ingredients.forEach((i) => {
      sel[i.id] = true;
    });
    setSelectedIng(sel);
    setStore('');
  };

  const pushToShopping = () => {
    if (!shopOpen) return;
    const ids = Object.entries(selectedIng)
      .filter(([, on]) => on)
      .map(([id]) => id);
    if (ids.length === 0) {
      alert('Select at least one ingredient.');
      return;
    }
    const cook = cookFor.trim() ? parseFloat(cookFor) : undefined;
    update((d) => ({
      ...d,
      shopping: addRecipeToShopping(d.shopping || [], shopOpen, {
        createdById: myId,
        cookFor: Number.isFinite(cook) ? cook : undefined,
        ingredientIds: ids,
        store: store.trim() || undefined,
      }),
    }));
    setShopOpen(null);
    setToast(`Added ${ids.length} item(s) to shopping`);
    window.setTimeout(() => setToast(null), 2500);
  };

  const updateIng = (idx: number, patch: Partial<RecipeIngredient>) => {
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing)),
    }));
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-accent" />
            Recipes
          </h1>
          <p className="text-sm text-muted mt-1">
            Save recipes and push ingredients to the shopping list.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4" /> Add recipe
        </Button>
      </div>

      {toast && (
        <div className="rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent flex items-center justify-between gap-2">
          <span>{toast}</span>
          <button type="button" className="underline text-xs" onClick={() => setView('shopping')}>
            Open shopping
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-sm font-medium border',
            !showArchived ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted',
          )}
        >
          Active ({active.length})
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-sm font-medium border',
            showArchived ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted',
          )}
        >
          Archived ({archived.length})
        </button>
      </div>

      {list.length === 0 ? (
        <Card className="!p-8 text-center text-muted text-sm">
          {showArchived ? 'No archived recipes.' : 'No recipes yet — add one to get started.'}
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const author = getMember(r.createdById);
            return (
              <Card
                key={r.id}
                className="!p-4 space-y-2"
                onClick={() => setViewRecipe(r)}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-fg truncate">{r.title}</h2>
                    <p className="text-xs text-muted mt-0.5">
                      {r.servings ? `${r.servings} servings · ` : ''}
                      {r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'}
                      {author ? ` · ${author.name}` : ''}
                    </p>
                  </div>
                  {author && <Avatar {...author} size="sm" className="!w-8 !h-8 !text-sm" />}
                </div>
                <ul className="text-sm text-fg-secondary space-y-0.5 max-h-28 overflow-y-auto">
                  {r.ingredients.slice(0, 8).map((ing) => (
                    <li key={ing.id} className="truncate">
                      · {formatIngredientLine(ing)}
                    </li>
                  ))}
                  {r.ingredients.length > 8 && (
                    <li className="text-muted text-xs">+{r.ingredients.length - 8} more</li>
                  )}
                </ul>
                <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  {!r.archived && (
                    <Button size="sm" onClick={() => openShop(r)}>
                      <ShoppingCart className="w-3.5 h-3.5" /> Add to list
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  {r.archived ? (
                    <Button size="sm" variant="ghost" onClick={() => setArchived(r.id, false)}>
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setArchived(r.id, true)}>
                      <Archive className="w-3.5 h-3.5" /> Archive
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => removeRecipe(r.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? 'Edit recipe' : 'New recipe'}
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs text-muted block mb-1">Title</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Weeknight pasta"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted block mb-1">Servings</label>
              <Input
                value={form.servings}
                onChange={(e) => setForm((f) => ({ ...f, servings: e.target.value }))}
                placeholder="4"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Source (optional)</label>
              <Input
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="Book / URL note"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted">Ingredients</label>
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() =>
                  setForm((f) => ({ ...f, ingredients: [...f.ingredients, emptyIngredient()] }))
                }
              >
                + Line
              </button>
            </div>
            <div className="space-y-2">
              {form.ingredients.map((ing, idx) => (
                <div
                  key={ing.id}
                  className="rounded-xl border border-border bg-surface-2/40 p-2 space-y-1.5"
                >
                  <div className="grid grid-cols-6 gap-1.5">
                    <Input
                      className="col-span-2"
                      placeholder="Qty"
                      value={ing.quantity || ''}
                      onChange={(e) => updateIng(idx, { quantity: e.target.value })}
                    />
                    <Input
                      className="col-span-2"
                      placeholder="Unit"
                      value={ing.unit || ''}
                      onChange={(e) => updateIng(idx, { unit: e.target.value })}
                    />
                    <select
                      className="col-span-2 rounded-xl border border-border bg-inset px-2 text-xs text-fg"
                      value={ing.category || ''}
                      onChange={(e) =>
                        updateIng(idx, {
                          category: (e.target.value || undefined) as ShoppingCategory | undefined,
                        })
                      }
                    >
                      <option value="">Auto</option>
                      {SHOPPING_CATEGORY_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {SHOPPING_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      className="flex-1"
                      placeholder="Ingredient name"
                      value={ing.name}
                      onChange={(e) => updateIng(idx, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      className="p-2 text-muted hover:text-red-500"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          ingredients: f.ingredients.filter((_, i) => i !== idx),
                        }))
                      }
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Input
                    placeholder="Note (optional)"
                    value={ing.note || ''}
                    onChange={(e) => updateIng(idx, { note: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Instructions (optional)</label>
            <Textarea
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={4}
              placeholder="Steps…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveForm} disabled={!form.title.trim()}>
              Save recipe
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add to shopping */}
      <Modal
        open={!!shopOpen}
        onClose={() => setShopOpen(null)}
        title={shopOpen ? `Shop: ${shopOpen.title}` : 'Shop'}
      >
        {shopOpen && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted block mb-1">
                  Recipe servings: {shopOpen.servings ?? '—'}
                </label>
                <label className="text-xs text-muted block mb-1">Cook for</label>
                <Input
                  value={cookFor}
                  onChange={(e) => setCookFor(e.target.value)}
                  placeholder={shopOpen.servings != null ? String(shopOpen.servings) : '4'}
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Store tab (optional)</label>
                <Input
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  placeholder="e.g. Coles"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted">
              Uncheck anything you already have. Matching names on the Need list are merged, not
              duplicated.
            </p>
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {shopOpen.ingredients.map((ing) => (
                <li key={ing.id}>
                  <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!selectedIng[ing.id]}
                      onChange={(e) =>
                        setSelectedIng((s) => ({ ...s, [ing.id]: e.target.checked }))
                      }
                    />
                    <span className="truncate">{formatIngredientLine(ing)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShopOpen(null)}>
                Cancel
              </Button>
              <Button onClick={pushToShopping}>
                <ShoppingCart className="w-4 h-4" /> Add to shopping
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* View full recipe */}
      <Modal
        open={!!viewRecipe}
        onClose={() => setViewRecipe(null)}
        title={viewRecipe?.title || 'Recipe'}
      >
        {viewRecipe && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-3">
              {(() => {
                const author = getMember(viewRecipe.createdById);
                return author ? (
                  <>
                    <Avatar {...author} size="sm" className="!w-8 !h-8 !text-sm" />
                    <p className="text-xs text-muted">
                      {viewRecipe.servings ? `${viewRecipe.servings} servings · ` : ''}
                      Added by {author.name}
                    </p>
                  </>
                ) : viewRecipe.servings ? (
                  <p className="text-xs text-muted">{viewRecipe.servings} servings</p>
                ) : null;
              })()}
            </div>

            {viewRecipe.source && (
              <p className="text-xs text-muted">
                Source: <span className="text-fg-secondary">{viewRecipe.source}</span>
              </p>
            )}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                Ingredients
              </h3>
              <ul className="text-sm text-fg space-y-1">
                {viewRecipe.ingredients.map((ing) => (
                  <li key={ing.id}>· {formatIngredientLine(ing)}</li>
                ))}
              </ul>
            </div>

            {viewRecipe.instructions && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                  Instructions
                </h3>
                <p className="text-sm text-fg whitespace-pre-wrap">{viewRecipe.instructions}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {!viewRecipe.archived && (
                <Button
                  size="sm"
                  onClick={() => {
                    const r = viewRecipe;
                    setViewRecipe(null);
                    openShop(r);
                  }}
                >
                  <ShoppingCart className="w-3.5 h-3.5" /> Add to list
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const r = viewRecipe;
                  setViewRecipe(null);
                  openEdit(r);
                }}
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
