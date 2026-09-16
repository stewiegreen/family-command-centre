// src/pages/chores/useQuestCatalogActions.ts
//
// Handlers for the Catalog tab (post/archive/restore/delete templates) plus
// the open/edit-target state for TemplateFormModal. Extracted from
// ChoresPage — the actual create/edit form fields live inside
// TemplateFormModal itself.

import { useCallback, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { ChoreQuestConfig, QuestTemplate } from '../../types';
import { buildQuestFromTemplate, ensureQuestCatalog } from '../../lib/quest';

export function useQuestCatalogActions(cq: ChoreQuestConfig, setTab: (t: 'quests') => void) {
  const { data, update, currentUser, isParent } = useApp();
  const me = currentUser;

  const [catalogEditOpen, setCatalogEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<QuestTemplate | null>(null);

  const openCatalogCreate = useCallback(() => {
    setEditTemplate(null);
    setCatalogEditOpen(true);
  }, []);

  const openCatalogEdit = useCallback((t: QuestTemplate) => {
    setEditTemplate(t);
    setCatalogEditOpen(true);
  }, []);

  const closeCatalogModal = useCallback(() => {
    setCatalogEditOpen(false);
    setEditTemplate(null);
  }, []);

  const archiveTemplate = useCallback(
    (t: QuestTemplate) => {
      if (!isParent) return;
      if (!confirm(`Archive "${t.title}" from the catalog? (You can restore it later.)`)) return;
      update((d) => ({
        ...d,
        questCatalog: ensureQuestCatalog(d.questCatalog).map((x) =>
          x.id === t.id ? { ...x, active: false, updatedAt: new Date().toISOString() } : x,
        ),
      }));
    },
    [isParent, update],
  );

  const restoreTemplate = useCallback(
    (t: QuestTemplate) => {
      if (!isParent) return;
      update((d) => ({
        ...d,
        questCatalog: ensureQuestCatalog(d.questCatalog).map((x) =>
          x.id === t.id ? { ...x, active: true, updatedAt: new Date().toISOString() } : x,
        ),
      }));
    },
    [isParent, update],
  );

  const deleteTemplateForever = useCallback(
    (t: QuestTemplate) => {
      if (!isParent) return;
      if (!confirm(`Permanently delete "${t.title}"? This cannot be undone.`)) return;
      update((d) => ({
        ...d,
        questCatalog: ensureQuestCatalog(d.questCatalog).filter((x) => x.id !== t.id),
      }));
    },
    [isParent, update],
  );

  /** Post a template onto the live quest board (does not remove from catalog). */
  const postTemplate = useCallback(
    (t: QuestTemplate) => {
      if (!isParent || !me) return;
      const q = buildQuestFromTemplate(t, me.id, cq);
      update((d) => ({
        ...d,
        chores: [q, ...(d.chores || [])],
      }));
      // Switch to quests so they see it appear
      setTab('quests');
    },
    [isParent, me, cq, update, setTab],
  );

  return {
    data,
    catalogEditOpen,
    editTemplate,
    openCatalogCreate,
    openCatalogEdit,
    closeCatalogModal,
    archiveTemplate,
    restoreTemplate,
    deleteTemplateForever,
    postTemplate,
  };
}
