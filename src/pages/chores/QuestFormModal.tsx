// src/pages/chores/QuestFormModal.tsx
//
// Create/edit modal for a single quest on the live board. Extracted from
// ChoresPage.tsx — owns its own form state (reset from `editQuest` whenever
// it opens) and calls useApp() directly for the save, same pattern the rest
// of the app uses instead of prop-drilling data down from the page.

import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { ChoreQuestConfig, FamilyData, Quest, QuestDifficulty } from '../../types';
import {
  DIFFICULTY_ORDER,
  buildQuest,
  buildQuestTemplate,
  ensureQuestCatalog,
  rewardsForDifficultyWithConfig,
} from '../../lib/quest';
import { cn } from '../../lib/cn';

export function QuestFormModal({
  open,
  onClose,
  editQuest,
  cq,
}: {
  open: boolean;
  onClose: () => void;
  editQuest: Quest | null;
  cq: ChoreQuestConfig;
}) {
  const { update, currentUser, isParent } = useApp();
  const me = currentUser;

  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<QuestDifficulty>('medium');
  const [customRewards, setCustomRewards] = useState(false);
  const [repeatable, setRepeatable] = useState(true);
  const [customXp, setCustomXp] = useState(25);
  const [customCoins, setCustomCoins] = useState(12);
  const [alsoSaveToCatalog, setAlsoSaveToCatalog] = useState(false);

  // Reset the form whenever the modal opens (new quest or a specific edit target).
  useEffect(() => {
    if (!open) return;
    if (editQuest) {
      setTitle(editQuest.title);
      setDifficulty(editQuest.difficulty || 'medium');
      const base = rewardsForDifficultyWithConfig(editQuest.difficulty || 'medium', cq);
      const isCustom =
        (editQuest.xp ?? base.xp) !== base.xp || (editQuest.coins ?? base.coins) !== base.coins;
      setCustomRewards(isCustom);
      setCustomXp(editQuest.xp ?? base.xp);
      setCustomCoins(editQuest.coins ?? base.coins);
      setRepeatable(editQuest.repeatable !== false);
    } else {
      setTitle('');
      setDifficulty('medium');
      setCustomRewards(false);
      setRepeatable(true);
      const r = rewardsForDifficultyWithConfig('medium', cq);
      setCustomXp(r.xp);
      setCustomCoins(r.coins);
    }
    setAlsoSaveToCatalog(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editQuest]);

  const saveQuest = () => {
    if (!title.trim() || !me) return;
    const meta = rewardsForDifficultyWithConfig(difficulty, cq);
    const xp = customRewards ? customXp : meta.xp;
    const coins = customRewards ? customCoins : meta.coins;
    if (editQuest) {
      update((d) => ({
        ...d,
        chores: (d.chores || []).map((c) =>
          c.id === editQuest.id
            ? {
                ...c,
                title: title.trim(),
                difficulty,
                xp: Math.max(0, Math.floor(xp)),
                coins: Math.max(0, Math.floor(coins)),
                repeatable,
                rewardMinutes: 0,
              }
            : c,
        ),
      }));
    } else {
      const q = buildQuest({
        title,
        difficulty,
        createdById: me.id,
        xp: customRewards ? xp : undefined,
        coins: customRewards ? coins : undefined,
        repeatable,
        config: cq,
      });
      update((d) => {
        let next: FamilyData = {
          ...d,
          chores: [q, ...(d.chores || [])],
        };
        // Optionally also add a reusable template to the master catalog
        if (alsoSaveToCatalog && isParent) {
          const list = ensureQuestCatalog(d.questCatalog);
          const tpl = buildQuestTemplate({
            title,
            difficulty,
            xp: customRewards ? xp : undefined,
            coins: customRewards ? coins : undefined,
            sort: list.length * 10 + 10,
          });
          next = { ...next, questCatalog: [...list, tpl] };
        }
        return next;
      });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={editQuest ? 'Edit quest' : 'New quest'}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted mb-1 block">What needs doing?</label>
          <input
            className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Vacuum the living room"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveQuest();
            }}
          />
        </div>
        <div>
          <label className="text-xs text-muted mb-2 block">Difficulty</label>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_ORDER.map((d) => {
              const meta = rewardsForDifficultyWithConfig(d, cq);
              const selected = difficulty === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDifficulty(d);
                    if (!customRewards) {
                      const r = rewardsForDifficultyWithConfig(d, cq);
                      setCustomXp(r.xp);
                      setCustomCoins(r.coins);
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
            checked={repeatable}
            onChange={(e) => setRepeatable(e.target.checked)}
          />
          Repeatable quest — stays available after approval
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={customRewards}
            onChange={(e) => {
              const on = e.target.checked;
              setCustomRewards(on);
              if (!on) {
                const r = rewardsForDifficultyWithConfig(difficulty, cq);
                setCustomXp(r.xp);
                setCustomCoins(r.coins);
              }
            }}
          />
          Custom XP / coins (advanced)
        </label>
        {customRewards && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">XP</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={customXp}
                onChange={(e) => setCustomXp(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Coins</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={customCoins}
                onChange={(e) => setCustomCoins(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        )}
        {!editQuest && isParent && (
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={alsoSaveToCatalog}
              onChange={(e) => setAlsoSaveToCatalog(e.target.checked)}
            />
            Also save to catalog (reusable template)
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={saveQuest} disabled={!title.trim()}>
            {editQuest ? 'Save changes' : 'Post quest'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
