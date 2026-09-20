/**
 * Temporary parent-only Coin Math debug page.
 * Shows stored balances vs ledger sums, per-reason totals, and the raw ledger.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  ChevronRight,
  Coins,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  KNOWN_PITFALLS,
  LEDGER_CAP,
  REASON_HELP,
  familyReports,
  setBalanceToLedgerSum,
  type MemberCoinReport,
} from '../lib/coinMath';
import { cn } from '../lib/cn';

function fmt(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function MemberBlock({
  report,
  onRebuild,
}: {
  report: MemberCoinReport;
  onRebuild: () => void;
}) {
  const [open, setOpen] = useState(report.role === 'kid');
  const driftBad = report.drift !== 0;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent/5 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-fg">
            {report.name}{' '}
            <span className="text-xs font-medium text-muted">({report.role})</span>
          </p>
          <p className="text-xs text-muted mt-0.5">
            {report.entryCount} ledger rows in retained history
          </p>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          <p className="text-sm font-bold tabular-nums text-fg">
            Stored: {report.stored}
          </p>
          <p className="text-xs tabular-nums text-muted">Ledger Σ: {report.fromLedger}</p>
          <p
            className={cn(
              'text-xs font-semibold tabular-nums',
              driftBad ? 'text-amber-400' : 'text-emerald-400',
            )}
          >
            Drift: {fmt(report.drift)}
          </p>
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
            <div className="rounded-xl bg-surface-2/80 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">UI balance</p>
              <p className="text-lg font-bold tabular-nums">{report.stored}</p>
            </div>
            <div className="rounded-xl bg-surface-2/80 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Ledger sum</p>
              <p className="text-lg font-bold tabular-nums">{report.fromLedger}</p>
            </div>
            <div className="rounded-xl bg-surface-2/80 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Earned (ledger+)</p>
              <p className="text-lg font-bold tabular-nums text-emerald-400">{fmt(report.earned)}</p>
            </div>
            <div className="rounded-xl bg-surface-2/80 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted">Spent (ledger−)</p>
              <p className="text-lg font-bold tabular-nums text-rose-400">{fmt(report.spent)}</p>
            </div>
          </div>

          {driftBad && (
            <div className="flex flex-wrap items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold text-amber-200">
                  Stored balance ≠ sum of retained ledger rows
                </p>
                <p className="text-xs text-muted leading-relaxed">
                  Often caused by the family-wide {LEDGER_CAP}-entry ledger cap (old rows deleted while
                  balance kept growing), or a write that changed one side only. “Set balance = ledger
                  sum” forces the UI balance to match what is still in the ledger — it cannot restore
                  dropped history.
                </p>
                <Button type="button" size="sm" variant="secondary" className="mt-1" onClick={onRebuild}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Set balance = ledger sum ({report.fromLedger})
                </Button>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">By reason</p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-border bg-surface-2/50">
                    <th className="px-3 py-2 font-semibold">Reason</th>
                    <th className="px-3 py-2 font-semibold">Count</th>
                    <th className="px-3 py-2 font-semibold">Sum</th>
                    <th className="px-3 py-2 font-semibold hidden sm:table-cell">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.byReason)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([reason, v]) => (
                      <tr key={reason} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{reason}</td>
                        <td className="px-3 py-2 tabular-nums">{v.count}</td>
                        <td
                          className={cn(
                            'px-3 py-2 tabular-nums font-semibold',
                            v.sum >= 0 ? 'text-emerald-400' : 'text-rose-400',
                          )}
                        >
                          {fmt(v.sum)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted hidden sm:table-cell">
                          {REASON_HELP[reason] || '—'}
                        </td>
                      </tr>
                    ))}
                  {!Object.keys(report.byReason).length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-sm text-muted text-center">
                        No ledger rows for this member in retained history.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              Ledger (newest first)
            </p>
            <div className="overflow-x-auto rounded-xl border border-border max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-elevated">
                  <tr className="text-left text-xs text-muted border-b border-border">
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Δ</th>
                    <th className="px-3 py-2 font-semibold">Reason</th>
                    <th className="px-3 py-2 font-semibold">Label</th>
                    <th className="px-3 py-2 font-semibold hidden md:table-cell">Week</th>
                    <th className="px-3 py-2 font-semibold hidden lg:table-cell">Id</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-1.5 text-xs text-muted whitespace-nowrap">
                        {fmtTime(e.at)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-1.5 tabular-nums font-semibold',
                          e.delta >= 0 ? 'text-emerald-400' : 'text-rose-400',
                        )}
                      >
                        {fmt(e.delta)}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px]">{e.reason}</td>
                      <td className="px-3 py-1.5 text-xs max-w-[14rem] truncate" title={e.label}>
                        {e.label}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted hidden md:table-cell">
                        {e.weekId}
                      </td>
                      <td
                        className="px-3 py-1.5 text-[10px] font-mono text-muted hidden lg:table-cell max-w-[10rem] truncate"
                        title={e.id}
                      >
                        {e.id}
                      </td>
                    </tr>
                  ))}
                  {!report.entries.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-sm text-muted text-center">
                        Empty
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {report.redemptions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                Shop redemptions (coin spends)
              </p>
              <ul className="space-y-1.5">
                {report.redemptions.slice(0, 30).map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-border px-3 py-2"
                  >
                    <span className="font-semibold text-rose-400 tabular-nums">−{r.coinCost}</span>
                    <span className="text-fg">{r.label}</span>
                    <span className="text-muted">· {r.kind}</span>
                    <span className="text-muted">· {r.status}</span>
                    <span className="text-muted ml-auto">{fmtTime(r.requestedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function CoinMathPage() {
  const { data, isParent, currentUser, update, setView } = useApp();
  const reports = useMemo(() => familyReports(data), [data]);
  const ledgerLen = (data.coinLedger || []).length;

  if (!isParent) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        Parents only — coin math debug is hidden from kids.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-accent mb-1">
            <Calculator className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wide">Temporary debug</span>
          </div>
          <h1 className="text-2xl font-bold text-fg tracking-tight">Coin math</h1>
          <p className="text-sm text-muted mt-1 max-w-xl leading-relaxed">
            Compare the balance the app shows with the sum of retained ledger rows. Use this to spot
            missing credits, double spends, or drift after the ledger cap.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => setView('settings')}>
          Back to Settings
        </Button>
      </div>

      <Card className="p-4 space-y-2 border-dashed border-amber-500/30">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Coins className="w-4 h-4 text-accent" />
          Family ledger size: {ledgerLen} / {LEDGER_CAP}
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Current week id context is local ISO week. Ledger rows store their own <code className="text-fg">weekId</code>.
          Logged in as {currentUser?.name || 'parent'}.
        </p>
      </Card>

      <Card className="p-4 space-y-2">
        <p className="text-sm font-bold text-fg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Known pitfalls
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted leading-relaxed">
          {KNOWN_PITFALLS.map((p) => (
            <li key={p.slice(0, 24)}>{p}</li>
          ))}
        </ul>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Per member</h2>
        {reports.map((r) => (
          <MemberBlock
            key={r.memberId}
            report={r}
            onRebuild={() => {
              if (
                !confirm(
                  `Set ${r.name}'s stored balance to ledger sum (${r.fromLedger})? This does not restore deleted ledger history.`,
                )
              ) {
                return;
              }
              update((d) => setBalanceToLedgerSum(d, r.memberId));
            }}
          />
        ))}
        {!reports.length && (
          <p className="text-sm text-muted text-center py-8">No members / coin data yet.</p>
        )}
      </div>

      <Card className="p-4 space-y-2">
        <p className="text-sm font-bold text-fg">Reason legend</p>
        <dl className="grid gap-2 sm:grid-cols-2 text-xs">
          {Object.entries(REASON_HELP).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border px-3 py-2">
              <dt className="font-mono font-semibold text-fg">{k}</dt>
              <dd className="text-muted mt-0.5 leading-relaxed">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <p className="text-[11px] text-muted text-center">
        Remove this page when debugging is done (ViewId <code>coinmath</code>, Settings link,{' '}
        <code>CoinMathPage.tsx</code>).
      </p>
    </div>
  );
}
