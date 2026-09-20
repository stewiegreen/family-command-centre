/**
 * Shop tab — redeem rewards + parent catalog management.
 */
import { useMemo, useState } from 'react';
import { Coins, Pencil, ShoppingBag, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import {
  ensureRewardCatalog,
  isoWeekId,
} from '../../lib/quest';
import { markThemeStudioUnlockedLocally } from '../../lib/themeStudioUnlock';
import { cn } from '../../lib/cn';
import type { RedemptionRecord, RewardItem, RewardKind } from '../../types';

function newId() {
  return crypto.randomUUID();
}

const KIND_LABEL: Record<RewardKind, string> = {
  screen_time: 'Screen time',
  treat: 'Treat',
  choice: 'Choice',
  late_bed: 'Late bedtime',
  allowance: 'Allowance',
  avatar_flair: 'Avatar flair',
  name_flair: 'Name flair',
  picture_frame: 'Picture frame',
  picture_frame_2: 'Second picture frame',
  theme_studio: 'Theme Studio',
  theme_slot: 'Theme slot +1',
  theme_accents: 'Accent packs',
  theme_wallpapers: 'Wallpaper packs',
  theme_fonts: 'Font vibe packs',
  custom: 'Custom',
};


export function ShopTab() {
  const { data, update, currentUser, isParent, getMember, setView } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;
  const catalog = ensureRewardCatalog(data.rewardCatalog);
  const coinBalances = data.coinBalances || {};
  const myCoins = coinBalances[myId] ?? 0;
  const shopRecipients = useMemo(
    () => (data.members || []).filter((m) => m.role !== 'media'),
    [data.members],
  );

  const [shopEditOpen, setShopEditOpen] = useState(false);
  const [screenGiftFor, setScreenGiftFor] = useState<Record<string, string>>({});
  const [shopForm, setShopForm] = useState<{
    id?: string;
    label: string;
    icon: string;
    kind: RewardKind;
    coinCost: number;
    screenMinutes: number;
    featured: boolean;
  }>({
    label: '',
    icon: '🎁',
    kind: 'custom',
    coinCost: 10,
    screenMinutes: 15,
    featured: false,
  });

  const activeShop = useMemo(
    () => catalog.filter((r) => r.active !== false),
    [catalog],
  );

  const redeem = (item: RewardItem) => {
    if (!me || me.role === 'media') return;
    const balance = coinBalances[myId] ?? 0;
    if (balance < item.coinCost) return;

    // One-shot unlocks: never charge again if already owned
    const app = data.appearance?.[myId];
    if (item.kind === 'theme_studio' && app?.unlockThemeStudio) {
      setView('themestudio');
      return;
    }
    if (item.kind === 'avatar_flair' && app?.unlockAvatarFlair) {
      setView('dashboard');
      return;
    }
    if (item.kind === 'name_flair' && app?.unlockNameFlair) {
      setView('dashboard');
      return;
    }
    if (item.kind === 'picture_frame' && app?.unlockPictureFrame) {
      setView('dashboard');
      return;
    }
    if (item.kind === 'picture_frame_2' && app?.unlockPictureFrame2) {
      setView('dashboard');
      return;
    }
    if (item.kind === 'theme_accents' && app?.unlockAccentPacks) {
      setView('themestudio');
      return;
    }
    if (item.kind === 'theme_wallpapers' && app?.unlockWallpapers) {
      setView('themestudio');
      return;
    }
    if (item.kind === 'theme_fonts' && app?.unlockFontPacks) {
      setView('themestudio');
      return;
    }

    const isScreen = item.kind === 'screen_time' && (item.screenMinutes || 0) > 0;
    const forId =
      isScreen
        ? screenGiftFor[item.id] || myId
        : myId;
    const forMember = getMember(forId);
    const forName = forMember?.name || 'them';
    const isGift = isScreen && forId !== myId;

    if (
      (item.kind === 'theme_slot' ||
        item.kind === 'theme_accents' ||
        item.kind === 'theme_wallpapers' ||
        item.kind === 'theme_fonts') &&
      !data.appearance?.[myId]?.unlockThemeStudio
    ) {
      alert('Unlock Theme Studio first — these are Studio add-ons.');
      return;
    }
    if (
      item.kind === 'picture_frame_2' &&
      !data.appearance?.[myId]?.unlockPictureFrame
    ) {
      alert('Unlock your first picture frame before buying a second one.');
      return;
    }

    const confirmMsg = isGift
      ? `Spend ${item.coinCost} coins on “${item.label}” for ${forName}?`
      : `Spend ${item.coinCost} coins on “${item.label}”?`;
    if (!confirm(confirmMsg)) return;

    const at = new Date().toISOString();
    const weekId = isoWeekId();
    const redemptionId = newId();

    update((d) => {
      const bal = d.coinBalances?.[myId] ?? 0;
      if (bal < item.coinCost) return d;

      const nextBalances = {
        ...(d.coinBalances || {}),
        [myId]: bal - item.coinCost,
      };

      const spendEntry = {
        id: `redeem:${redemptionId}`,
        memberId: myId,
        delta: -item.coinCost,
        reason: 'redeem' as const,
        label: isGift ? `${item.label} → ${forName}` : item.label,
        refId: redemptionId,
        byId: me.id,
        at,
        weekId,
      };

      const isFlair = item.kind === 'avatar_flair' || item.kind === 'name_flair';
      const isPictureFrame = item.kind === 'picture_frame';
      const isPictureFrame2 = item.kind === 'picture_frame_2';
      const isThemeStudio = item.kind === 'theme_studio';
      const isThemeSlot = item.kind === 'theme_slot';
      const isThemeAccents = item.kind === 'theme_accents';
      const isThemeWallpapers = item.kind === 'theme_wallpapers';
      const isThemeFonts = item.kind === 'theme_fonts';
      const autoDone = isScreen || isFlair || isPictureFrame || isPictureFrame2 || isThemeStudio || isThemeSlot || isThemeAccents || isThemeWallpapers || isThemeFonts;

      const record: RedemptionRecord = {
        id: redemptionId,
        memberId: myId,
        forMemberId: isScreen ? forId : undefined,
        rewardItemId: item.id,
        label: item.label,
        kind: item.kind,
        coinCost: item.coinCost,
        screenMinutes: item.screenMinutes,
        status: autoDone ? 'fulfilled' : 'pending',
        requestedAt: at,
        fulfilledAt: autoDone ? at : undefined,
        fulfilledById: autoDone ? me.id : undefined,
      };

      let nextScreen = d.screenTime || {};
      let nextLog = d.screenTimeLog || [];
      if (isScreen) {
        const mins = item.screenMinutes || 0;
        const beneficiary = forId;
        nextScreen = {
          ...nextScreen,
          [beneficiary]: (nextScreen[beneficiary] || 0) + mins,
        };
        nextLog = [
          {
            id: newId(),
            memberId: beneficiary,
            delta: mins,
            reason: isGift
              ? `Gift from ${me.name}: ${item.label}`
              : `Redeemed: ${item.label}`,
            byId: me.id,
            at,
          },
          ...nextLog,
        ].slice(0, 100);
      }

      let nextAppearance = d.appearance || {};
      if (isFlair || isPictureFrame || isPictureFrame2 || isThemeStudio || isThemeSlot || isThemeAccents || isThemeWallpapers || isThemeFonts) {
        const prev = nextAppearance[myId] || {};
        let homescreenRows = prev.homescreenRows;
        if (isPictureFrame || isPictureFrame2) {
          // Pin the frame card onto this member's homescreen if missing
          const docs = Array.isArray(homescreenRows) ? [...homescreenRows] : [];
          const wid = isPictureFrame2 ? 'pictureframe2' : 'pictureframe';
          const has = docs.some(
            (row) => Array.isArray(row?.ids) && row.ids.includes(wid),
          );
          if (!has) {
            docs.push({ ids: [wid] });
            homescreenRows = docs;
          }
        }
        nextAppearance = {
          ...nextAppearance,
          [myId]: {
            ...prev,
            ...(item.kind === 'avatar_flair' ? { unlockAvatarFlair: true } : {}),
            ...(item.kind === 'name_flair' ? { unlockNameFlair: true } : {}),
            ...(isPictureFrame ? { unlockPictureFrame: true } : {}),
            ...(isPictureFrame2 ? { unlockPictureFrame2: true } : {}),
            ...(isThemeStudio ? { unlockThemeStudio: true } : {}),
            ...(isThemeSlot
              ? {
                  extraThemeSlots: Math.min(
                    5,
                    (typeof prev.extraThemeSlots === 'number' ? prev.extraThemeSlots : 0) + 1,
                  ),
                }
              : {}),
            ...(isThemeAccents ? { unlockAccentPacks: true } : {}),
            ...(isThemeWallpapers ? { unlockWallpapers: true } : {}),
            ...(isThemeFonts ? { unlockFontPacks: true } : {}),
            ...(homescreenRows ? { homescreenRows } : {}),
          },
        };
      }

      return {
        ...d,
        coinBalances: nextBalances,
        coinLedger: [spendEntry, ...(d.coinLedger || [])].slice(0, 200),
        redemptions: [record, ...(d.redemptions || [])].slice(0, 100),
        screenTime: nextScreen,
        screenTimeLog: nextLog,
        appearance: nextAppearance,
        rewardCatalog: ensureRewardCatalog(d.rewardCatalog),
      };
    });

    // Flair is customized on the Your Look card (homescreen)
    if (item.kind === 'avatar_flair' || item.kind === 'name_flair') {
      setView('dashboard');
    }
    if (item.kind === 'theme_studio') {
      markThemeStudioUnlockedLocally(myId);
      setView('themestudio');
    } else if (
      item.kind === 'theme_slot' ||
      item.kind === 'theme_accents' ||
      item.kind === 'theme_wallpapers' ||
      item.kind === 'theme_fonts'
    ) {
      setView('themestudio');
    }
  };


  const openShopCreate = () => {
    setShopForm({
      label: '',
      icon: '🎁',
      kind: 'custom',
      coinCost: 20,
      screenMinutes: 0,
      featured: false,
    });
    setShopEditOpen(true);
  };

  const openShopEdit = (item: RewardItem) => {
    setShopForm({
      id: item.id,
      label: item.label,
      icon: item.icon,
      kind: item.kind,
      coinCost: item.coinCost,
      screenMinutes: item.screenMinutes || 0,
      featured: !!item.featured,
    });
    setShopEditOpen(true);
  };

  const saveShopItem = () => {
    if (!shopForm.label.trim() || !isParent) return;
    update((d) => {
      const list = ensureRewardCatalog(d.rewardCatalog);
      if (shopForm.id) {
        return {
          ...d,
          rewardCatalog: list.map((r) =>
            r.id === shopForm.id
              ? {
                  ...r,
                  label: shopForm.label.trim(),
                  icon: shopForm.icon || '🎁',
                  kind: shopForm.kind,
                  coinCost: Math.max(1, Math.floor(shopForm.coinCost) || 1),
                  screenMinutes:
                    shopForm.kind === 'screen_time'
                      ? Math.max(0, Math.floor(shopForm.screenMinutes) || 0)
                      : undefined,
                  featured: shopForm.featured,
                }
              : r,
          ),
        };
      }
      const item: RewardItem = {
        id: newId(),
        label: shopForm.label.trim(),
        icon: shopForm.icon || '🎁',
        kind: shopForm.kind,
        coinCost: Math.max(1, Math.floor(shopForm.coinCost) || 1),
        screenMinutes:
          shopForm.kind === 'screen_time'
            ? Math.max(0, Math.floor(shopForm.screenMinutes) || 0)
            : undefined,
        featured: shopForm.featured,
        active: true,
        sort: list.length * 10 + 10,
      };
      return { ...d, rewardCatalog: [...list, item] };
    });
    setShopEditOpen(false);
  };

  const deactivateShopItem = (item: RewardItem) => {
    if (!isParent) return;
    if (!confirm(`Remove “${item.label}” from the shop?`)) return;
    update((d) => ({
      ...d,
      rewardCatalog: ensureRewardCatalog(d.rewardCatalog).map((r) =>
        r.id === item.id ? { ...r, active: false } : r,
      ),
    }));
  };


  /** Spend accrued screen-time minutes (TV / games). */

  return (
    <>
<section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              Reward shop
            </h2>
            <p className="text-sm font-semibold text-amber-600 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              {myCoins} coins
            </p>
          </div>

          {activeShop.length === 0 ? (
            <Card className="!p-8 text-center">
              <p className="text-muted text-sm">Shop is empty.</p>
              {isParent && (
                <Button className="mt-4" onClick={openShopCreate}>
                  Add reward
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {activeShop.map((item) => {
                const canAfford = myCoins >= item.coinCost;
                return (
                  <Card
                    key={item.id}
                    className={cn('!p-4 flex flex-col gap-3', item.featured && 'border-accent/40')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl w-10 h-10 rounded-xl bg-inset flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-fg leading-tight">
                          {item.label}
                          {item.featured && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-accent font-bold">
                              Featured
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted mt-0.5">{KIND_LABEL[item.kind]}</p>
                        <p className="text-sm font-semibold text-amber-600 mt-1 flex items-center gap-1">
                          <Coins className="w-3.5 h-3.5" />
                          {item.coinCost}
                          {item.kind === 'screen_time' && item.screenMinutes
                            ? ` · ${item.screenMinutes}m`
                            : ''}
                        </p>
                      </div>
                      {item.kind === 'screen_time' && me && me.role !== 'media' && (
                        <select
                          className="shrink-0 max-w-[8rem] rounded-lg border border-border bg-inset px-1.5 py-1 text-xs text-fg outline-none focus:border-accent"
                          value={screenGiftFor[item.id] || myId}
                          onChange={(e) =>
                            setScreenGiftFor((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          title="Give screen time to"
                        >
                          {shopRecipients.map((m) => {
                            const look = getMember(m.id) || m;
                            return (
                              <option key={m.id} value={m.id}>
                                {(look.emoji ? `${look.emoji} ` : '') + look.name}
                                {m.id === myId ? ' (me)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      {me && me.role !== 'media' && (() => {
                        const unlockedAvatar =
                          item.kind === 'avatar_flair' &&
                          !!data.appearance?.[myId]?.unlockAvatarFlair;
                        const unlockedName =
                          item.kind === 'name_flair' &&
                          !!data.appearance?.[myId]?.unlockNameFlair;
                        const unlockedFrame =
                          item.kind === 'picture_frame' &&
                          !!data.appearance?.[myId]?.unlockPictureFrame;
                        const unlockedFrame2 =
                          item.kind === 'picture_frame_2' &&
                          !!data.appearance?.[myId]?.unlockPictureFrame2;
                        const unlockedStudio =
                          item.kind === 'theme_studio' &&
                          !!data.appearance?.[myId]?.unlockThemeStudio;
                        const unlockedAccents =
                          item.kind === 'theme_accents' &&
                          !!data.appearance?.[myId]?.unlockAccentPacks;
                        const unlockedWalls =
                          item.kind === 'theme_wallpapers' &&
                          !!data.appearance?.[myId]?.unlockWallpapers;
                        const unlockedFonts =
                          item.kind === 'theme_fonts' &&
                          !!data.appearance?.[myId]?.unlockFontPacks;
                        if (unlockedAvatar || unlockedName) {
                          return (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1"
                              onClick={() => setView('dashboard')}
                            >
                              Customize in Your Look
                            </Button>
                          );
                        }
                        if (unlockedFrame || unlockedFrame2) {
                          return (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1"
                              onClick={() => setView('dashboard')}
                            >
                              Open on Home
                            </Button>
                          );
                        }
                        if (unlockedStudio || unlockedAccents || unlockedWalls || unlockedFonts) {
                          return (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="flex-1"
                              onClick={() => setView('themestudio')}
                            >
                              Open Studio
                            </Button>
                          );
                        }
                        return (
                          <Button
                            size="sm"
                            disabled={!canAfford}
                            onClick={() => redeem(item)}
                            className="flex-1"
                          >
                            {canAfford
                              ? item.kind === 'screen_time' &&
                                (screenGiftFor[item.id] || myId) !== myId
                                ? 'Gift'
                                : 'Redeem'
                              : 'Need more coins'}
                          </Button>
                        );
                      })()}
                      {isParent && (
                        <>
                          <button
                            type="button"
                            onClick={() => openShopEdit(item)}
                            className="p-2 rounded-lg text-muted hover:text-fg hover:bg-nav-hover"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deactivateShopItem(item)}
                            className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-nav-hover"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted text-center pt-2">
            Screen-time items add minutes to your bank instantly. Spend them above when you watch or play.
            Other rewards wait in the Vault for a parent.
          </p>
        </section>
    
      <Modal open={shopEditOpen} onClose={() => setShopEditOpen(false)} title={shopForm.id ? 'Edit reward' : 'Add reward'}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Label</label>
            <input
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={shopForm.label}
              onChange={(e) => setShopForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Pick the movie"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Icon (emoji)</label>
              <input
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={shopForm.icon}
                onChange={(e) => setShopForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Coin cost</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={shopForm.coinCost}
                onChange={(e) =>
                  setShopForm((f) => ({ ...f, coinCost: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Kind</label>
            <select
              className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
              value={shopForm.kind}
              onChange={(e) =>
                setShopForm((f) => ({ ...f, kind: e.target.value as RewardKind }))
              }
            >
              {(Object.keys(KIND_LABEL) as RewardKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {shopForm.kind === 'screen_time' && (
            <div>
              <label className="text-xs text-muted mb-1 block">Screen minutes</label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-fg text-sm outline-none focus:border-accent"
                value={shopForm.screenMinutes}
                onChange={(e) =>
                  setShopForm((f) => ({ ...f, screenMinutes: Number(e.target.value) || 0 }))
                }
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={shopForm.featured}
              onChange={(e) => setShopForm((f) => ({ ...f, featured: e.target.checked }))}
            />
            Featured (highlight as aspirational, e.g. Weekend Pass)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShopEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveShopItem} disabled={!shopForm.label.trim()}>
              {shopForm.id ? 'Save' : 'Add to shop'}
            </Button>
          </div>
        </div>
      </Modal>

    </>
  );
}
