/**
 * Vault tab — pending and recent redemptions.
 */
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { isoWeekId } from '../../lib/quest';
import type { RedemptionRecord } from '../../types';

export function VaultTab() {
  const { data, update, currentUser, isParent, getMember } = useApp();
  const me = currentUser;
  const myId = me?.id || data.settings.currentUserId;
  const redemptions = data.redemptions || [];

  const pendingRedemptions = useMemo(
    () =>
      redemptions
        .filter((r) => r.status === 'pending')
        .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    [redemptions],
  );
  const myPendingRedemptions = useMemo(
    () => pendingRedemptions.filter((r) => r.memberId === myId),
    [pendingRedemptions, myId],
  );
  const recentRedemptions = useMemo(
    () =>
      redemptions
        .filter((r) => r.status !== 'pending')
        .sort((a, b) => (b.fulfilledAt || b.requestedAt).localeCompare(a.fulfilledAt || a.requestedAt))
        .slice(0, 15),
    [redemptions],
  );

  const fulfillRedemption = (r: RedemptionRecord) => {
    if (!isParent || !me) return;
    update((d) => ({
      ...d,
      redemptions: (d.redemptions || []).map((x) =>
        x.id === r.id
          ? {
              ...x,
              status: 'fulfilled' as const,
              fulfilledAt: new Date().toISOString(),
              fulfilledById: me.id,
            }
          : x,
      ),
    }));
  };

  const cancelRedemption = (r: RedemptionRecord) => {
    if (!isParent || !me) return;
    if (!confirm(`Cancel "${r.label}" and refund ${r.coinCost} coins?`)) return;
    const at = new Date().toISOString();
    const weekId = isoWeekId();

    update((d) => {
      if (r.status !== 'pending') return d;
      const bal = d.coinBalances?.[r.memberId] ?? 0;
      return {
        ...d,
        coinBalances: {
          ...(d.coinBalances || {}),
          [r.memberId]: bal + r.coinCost,
        },
        coinLedger: [
          {
            id: `refund:${r.id}`,
            memberId: r.memberId,
            delta: r.coinCost,
            reason: 'adjust' as const,
            label: `Refund: ${r.label}`,
            refId: r.id,
            byId: me.id,
            at,
            weekId,
          },
          ...(d.coinLedger || []),
        ].slice(0, 200),
        redemptions: (d.redemptions || []).map((x) =>
          x.id === r.id
            ? { ...x, status: 'cancelled' as const, fulfilledAt: at, fulfilledById: me.id }
            : x,
        ),
      };
    });
  };

  return (
<section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
              {isParent ? 'Pending fulfillment' : 'Your pending rewards'}
            </h2>
            {(isParent ? pendingRedemptions : myPendingRedemptions).length === 0 ? (
              <Card className="!p-6 text-center">
                <p className="text-sm text-muted">Nothing waiting — vault is clear.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {(isParent ? pendingRedemptions : myPendingRedemptions).map((r) => {
                  const who = getMember(r.memberId);
                  return (
                    <Card key={r.id} className="!p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {who && <Avatar {...who} size="sm" />}
                        <div className="min-w-0">
                          <p className="font-medium text-fg truncate">{r.label}</p>
                          <p className="text-xs text-muted">
                            {who?.name || 'Someone'}
                            {r.forMemberId && r.forMemberId !== r.memberId
                              ? ` → ${getMember(r.forMemberId)?.name || 'someone'}`
                              : ''}{' '}
                            · {r.coinCost} coins ·{' '}
                            {new Date(r.requestedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      {isParent && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" onClick={() => fulfillRedemption(r)}>
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Fulfilled
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelRedemption(r)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {recentRedemptions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">
                Recent history
              </h2>
              <div className="space-y-2">
                {recentRedemptions
                  .filter((r) => isParent || r.memberId === myId)
                  .map((r) => {
                    const who = getMember(r.memberId);
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-inset border border-border text-sm"
                      >
                        <span className="text-lg">{r.kind === 'screen_time' ? '📱' : '🎁'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-fg truncate">
                            {r.label}
                            <span className="text-muted">
                              {' '}
                              · {who?.name}
                              {r.forMemberId && r.forMemberId !== r.memberId
                                ? ` → ${getMember(r.forMemberId)?.name || 'someone'}`
                                : ''}
                            </span>
                          </p>
                        </div>
                        <span
                          className={cn(
                            'text-xs font-medium shrink-0',
                            r.status === 'fulfilled' ? 'text-emerald-600' : 'text-muted',
                          )}
                        >
                          {r.status === 'fulfilled' ? 'Done' : 'Cancelled'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </section>
  );
}
