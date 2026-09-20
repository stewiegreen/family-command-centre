/**
 * Quest catalog tab (parents) — templates to post / archive.
 */
import { useMemo, useState } from 'react';
import { BookMarked, Pencil, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  ensureQuestCatalog,
  getChoreQuestConfig,
  rewardsForDifficultyWithConfig,
} from '../../lib/quest';
import type { CatalogActions } from './useQuestCatalogActions';

export function CatalogTab({ catalogActions }: { catalogActions: CatalogActions }) {
  const { data, isParent } = useApp();
  const cq = getChoreQuestConfig(data);
  const questCatalog = ensureQuestCatalog(data.questCatalog);
  const [showArchived, setShowArchived] = useState(false);

  const activeTemplates = useMemo(
    () => questCatalog.filter((t) => t.active !== false),
    [questCatalog],
  );
  const archivedTemplates = useMemo(
    () => questCatalog.filter((t) => t.active === false),
    [questCatalog],
  );

  if (!isParent) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-1 flex items-center gap-2">
          <BookMarked className="w-4 h-4" />
          Quest catalog
        </h2>
        <p className="text-xs text-muted">
          Your master chore list. Templates stay here until you post them to the live board.
          Archive to hide without deleting.
        </p>
      </div>

      {activeTemplates.length === 0 ? (
        <Card className="!p-6 text-center">
          <p className="text-muted text-sm">No templates yet. Build your master list once, post when needed.</p>
          <Button className="mt-4" onClick={catalogActions.openCatalogCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add template
          </Button>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {activeTemplates.map((t) => {
            const meta = rewardsForDifficultyWithConfig(t.difficulty, cq);
            const xp = t.xp ?? meta.xp;
            const coins = t.coins ?? meta.coins;
            return (
              <Card key={t.id} className="!p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-fg leading-snug">{t.title}</p>
                    <p className="text-xs text-muted mt-1">
                      {meta.emoji} {meta.label} · +{xp} XP · +{coins}c
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => catalogActions.postTemplate(t)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Post to board
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => catalogActions.openCatalogEdit(t)}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => catalogActions.archiveTemplate(t)}>
                    Archive
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {archivedTemplates.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            className="text-xs font-medium text-muted hover:text-fg"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide' : 'Show'} archived ({archivedTemplates.length})
          </button>
          {showArchived && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {archivedTemplates.map((t) => (
                <Card key={t.id} className="!p-4 space-y-2 opacity-80">
                  <p className="font-medium text-fg text-sm">{t.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => catalogActions.restoreTemplate(t)}>
                      Restore
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => catalogActions.deleteTemplateForever(t)}>
                      Delete forever
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
