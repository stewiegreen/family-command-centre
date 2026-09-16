// src/pages/chores/TemplateFormModal.tsx
//
// Create/edit modal for a quest-catalog template (parents only). Same
// self-reset-on-open pattern as QuestFormModal.

import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { ChoreQuestConfig, QuestDifficulty, QuestTemplate } from '../../types';
import { DIFFICULTY_ORDER, buildQuestTemplate, ensureQuestCatalog, rewardsForDifficultyWithConfig } from '../../lib/quest';
import { cn } from '../../lib/cn';

export function TemplateFormModal({
  open,
  onClose,
  editTemplate,
  cq,
}: {
  open: boolean;
  onClose: () => void;
  editTemplate: QuestTemplate | null;
  cq: ChoreQuestConfig;
}) {
  const { update, isParent } = useApp();

  const [tplTitle, setTplTitle] = useState('');
  const [tplDifficulty, setTplDifficulty] = useState<QuestDifficulty>('medium');
  const [tplCustom, setTplCustom] = useState(false);
  const [tplXp, setTplXp] = useState(25);
  const [tplCoins, setTplCoins] = useState(12);

  useEffect(() => {
    if (!open) return;
    if (editTemplate) {
      setTplTitle(editTemplate.title);
      setTplDifficulty(editTemplate.difficulty || 'medium');
      const base = rewardsForDifficultyWithConfig(editTemplate.difficulty || 'medium', cq);
      const isCustom =
        (editTemplate.xp != null && editTemplate.xp !== base.xp) ||
        (editTemplate.coins != null && editTemplate.coins !== base.coins);
      setTplCustom(isCustom);
      setTplXp(editTemplate.xp ?? base.xp);
      setTplCoins(editTemplate.coins ?? base.coins);
    } else {
      setTplTitle('');
      setTplDifficulty('medium');
      setTplCustom(false);
      const r = rewardsForDifficultyWithConfig('medium', cq);
      setTplXp(r.xp);
      setTplCoins(r.coins);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editTemplate]);

  const saveTemplate = () => {
    if (!tplTitle.trim() || !isParent) return;
    const now = new Date().toISOString();
    update((d) => {
      const list = ensureQuestCatalog(d.questCatalog);
      if (editTemplate) {
        return {
          ...d,
          questCatalog: list.map((t) =>
            t.id === editTemplate.id
              ? {
                  ...t,
                  title: tplTitle.trim(),
                  difficulty: tplDifficulty,
                  xp: tplCustom ? Math.max(0, Math.floor(tplXp)) : undefined,
                  coins: tplCustom ? Math.max(0, Math.floor(tplCoins)) : undefined,
                  updatedAt: now,
                }
              : t,
          ),
        };
      }
      const tpl = buildQuestTemplate({
        title: tplTitle,
        difficulty: tplDifficulty,
        xp: tplCustom ? tplXp : undefined,
        coins: tplCustom ? tplCoins : undefined,
        sort: list.length * 10 + 10,
      });
      return { ...d, questCatalog: [...list, tpl] };
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editTemplate ? 'Edit template' : 'New template'}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted mb-1 block">Chore name</label>
          <input
            className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
            value={tplTitle}
            onChange={(e) => setTplTitle(e.target.value)}
            placeholder="e.g. Empty the dishwasher"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTemplate();
            }}
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-2 block">Difficulty</label>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_ORDER.map((d) => {
              const meta = rewardsForDifficultyWithConfig(d, cq);
              const selected = tplDifficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setTplDifficulty(d);
                    if (!tplCustom) {
                      const r = rewardsForDifficultyWithConfig(d, cq);
                      setTplXp(r.xp);
                      setTplCoins(r.coins);
                    }
                  }}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-colors',
                    selected ? 'border-accent bg-accent/10' : 'border-border hover:bg-nav-hover',
                  )}
                >
                  <p className="text-sm font-semibold text-fg">
                    {meta.emoji} {meta.label}
                  </p>
                  <p className="text-[11px] text-muted mt-1">
                    +{meta.xp} XP · +{meta.coins} coins
                  </p>
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={tplCustom}
            onChange={(e) => {
              const on = e.target.checked;
              setTplCustom(on);
              if (!on) {
                const r = rewardsForDifficultyWithConfig(tplDifficulty, cq);
                setTplXp(r.xp);
                setTplCoins(r.coins);
              }
            }}
          />
          Custom XP / coins (advanced)
        </label>
        {tplCustom && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">XP</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={tplXp}
                onChange={(e) => setTplXp(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Coins</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={tplCoins}
                onChange={(e) => setTplCoins(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={saveTemplate} disabled={!tplTitle.trim()}>
            {editTemplate ? 'Save changes' : 'Add to catalog'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
