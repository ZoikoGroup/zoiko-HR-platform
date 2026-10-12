import { lazy, Suspense } from "react";
import { formatCurrencyFromCents, formatCompactNumber, BLUE, EMERALD, INK, INK_SOFT } from "./format";

// The chart library (recharts) is not part of the dashboard's own code: it is fetched as its own chunk. The fetch starts
// as soon as this card's module loads, so it runs alongside the card's data request instead of after it.
const loadTrendChart = () => import("./CommercialTrendChart");
const CommercialTrendChart = lazy(loadTrendChart);
loadTrendChart().catch(() => {});

export default function CommercialHealthCard({ data, loading, pricingConfigured }) {
  const trend = (data?.trend || []).map((p) => ({
    date: p.date?.slice(5),
    mrr: (p.mrr_cents || 0) / 100,
    workforce: p.workforce || 0,
  }));

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold" style={{ color: INK }}>Commercial Health</h2>
      </div>
      {!pricingConfigured && !loading && (
        <p className="text-[11px] mb-3 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 inline-block">
          Plan pricing isn't configured yet — revenue figures below will read $0 until prices are set on the Billing Plans page.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 mt-3">
        <div>
          <div className="flex items-center gap-4 mb-2 text-[11px] font-semibold" style={{ color: INK_SOFT }}>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: BLUE }} /> MRR (USD)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: EMERALD }} /> Workforce</span>
          </div>
          {loading ? (
            <div className="h-[220px] bg-slate-100 rounded-2xl animate-pulse" />
          ) : trend.length < 2 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-center px-6" style={{ color: INK_SOFT }}>
              Trend data starts accumulating from today — check back after a few days for a fuller picture.
            </div>
          ) : (
            <Suspense fallback={<div className="h-[220px] bg-slate-100 rounded-2xl animate-pulse" />}>
              <CommercialTrendChart trend={trend} />
            </Suspense>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 content-start">
          <StatBox label="Revenue (Next 30 Days)" value={formatCurrencyFromCents(data?.revenue_next_30_days_cents)} loading={loading} />
          <StatBox
            label="Failed Payments"
            value={formatCurrencyFromCents(data?.failed_payments_cents)}
            sub={data?.failed_payments_org_count ? `${data.failed_payments_org_count} account(s)` : undefined}
            tone="red"
            loading={loading}
          />
          <StatBox
            label="Plan Overages"
            value={formatCurrencyFromCents(data?.plan_overages_cents)}
            sub={data?.plan_overages_org_count ? `${data.plan_overages_org_count} account(s)` : undefined}
            tone="amber"
            loading={loading}
          />
          <StatBox
            label="Entitlement Mismatches"
            value={formatCompactNumber(data?.entitlement_mismatch_count)}
            sub={data?.entitlement_mismatch_count ? `${data.entitlement_mismatch_count} account(s)` : undefined}
            tone="amber"
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub, tone, loading }) {
  const toneText = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "";
  return (
    <div className="min-w-0 p-3 rounded-2xl bg-slate-50 border border-slate-100">
      <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide leading-tight break-words">{label}</p>
      {loading ? (
        <div className="h-5 w-16 bg-slate-200 rounded mt-1.5 animate-pulse" />
      ) : (
        <>
          <p className={`text-lg font-extrabold mt-1 break-words ${toneText}`} style={!tone ? { color: "#0A1128" } : undefined}>{value}</p>
          {sub && <p className="text-[10.5px] text-slate-400 mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}
