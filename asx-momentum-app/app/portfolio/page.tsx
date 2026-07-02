import { sql } from "@/lib/db";
import { TICKERS } from "@/lib/universe";
import { computeSignals, type Bar, type Fundamentals } from "@/lib/momentum";
import { fetchHistory } from "@/lib/yahoo";
import Link from "next/link";
import PortfolioEditor from "@/app/components/PortfolioEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HoldingConfig = {
  id: number;
  ticker: string;
  label: string;
  quantity: number;
  type: "asx-stock" | "asx-etf" | "crypto";
  in_universe: boolean;
};

const SKIP = 21;
const YEAR = 252;
const TREND = 200;

function basicSignal(bars: Bar[]) {
  if (!bars.length) return { lastClose: null, lastDate: null, momentum: null, aboveTrend: null, trendSma: null, pctFromSma: null };
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  let trendSma: number | null = null;
  let aboveTrend: boolean | null = null;
  let pctFromSma: number | null = null;
  if (closes.length >= TREND) {
    trendSma = closes.slice(-TREND).reduce((a, b) => a + b, 0) / TREND;
    aboveTrend = last.close > trendSma;
    pctFromSma = last.close / trendSma - 1;
  }
  let momentum: number | null = null;
  if (closes.length >= YEAR + SKIP) {
    const pSkip = closes[closes.length - 1 - SKIP];
    const p12 = closes[closes.length - 1 - SKIP - (YEAR - SKIP)];
    momentum = pSkip / p12 - 1;
  }
  return { lastClose: last.close, lastDate: last.date, momentum, aboveTrend, trendSma, pctFromSma };
}

type Rec = { action: string; badge: "buy" | "hold" | "out"; reason: string };

function recommend(type: string, aboveTrend: boolean | null, momentum: number | null, compositeScore?: number | null): Rec {
  if (type === "asx-stock") {
    const s = compositeScore ?? 0;
    if (s >= 0.75 && aboveTrend)  return { action: "Add",                badge: "buy",  reason: "Top composite score + above 200d trend" };
    if (s >= 0.5  && aboveTrend)  return { action: "Hold / add on dips", badge: "hold", reason: "Strong score, above trend" };
    if (s >= 0.25 && aboveTrend)  return { action: "Hold",               badge: "hold", reason: "Moderate score, above trend" };
    if (!aboveTrend && s >= 0.5)  return { action: "Hold — watch trend", badge: "hold", reason: "Good score but below 200d MA" };
    if (aboveTrend) return { action: "Hold", badge: "hold", reason: "Above trend — check signal board for composite score" };
return { action: "Consider selling", badge: "out", reason: "Below 200d trend and weak score" };
  }
  if (type === "asx-etf") {
    if (aboveTrend && momentum !== null && momentum > 0.05) return { action: "Good time to add",     badge: "buy",  reason: "Above trend + positive momentum" };
    if (aboveTrend)                                         return { action: "Hold / DCA",            badge: "hold", reason: "Above trend — continue regular contributions" };
    return                                                         { action: "Hold — pause lump sum", badge: "hold", reason: "Below 200d MA — keep DCA, avoid large lump sums" };
  }
  if (type === "crypto") {
    if (aboveTrend && momentum !== null && momentum > 0.3) return { action: "Bullish — hold",              badge: "buy",  reason: "Strong momentum + above 200d trend" };
    if (aboveTrend && momentum !== null && momentum > 0)   return { action: "Hold",                        badge: "hold", reason: "Above trend, moderate momentum" };
    if (aboveTrend)                                        return { action: "Hold — watch closely",        badge: "hold", reason: "Above trend but momentum fading" };
    return                                                        { action: "Caution — consider reducing", badge: "out",  reason: "Below 200-day average" };
  }
  return { action: "Hold", badge: "hold", reason: "" };
}

function fmtAud(v: number | null): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export default async function PortfolioPage() {
  const holdingRows = await sql`
    SELECT id, ticker, label, quantity, type, in_universe
    FROM portfolio ORDER BY id ASC
  ` as unknown as HoldingConfig[];

  const [priceRows, fundRows] = await Promise.all([
    sql`SELECT ticker, date::text, close FROM prices WHERE ticker = ANY(${TICKERS}) ORDER BY ticker, date ASC` as unknown as Promise<{ ticker: string; date: string; close: number }[]>,
    sql`SELECT * FROM fundamentals WHERE ticker = ANY(${TICKERS})` as unknown as Promise<Fundamentals[]>,
  ]);

  const byTicker: Record<string, Bar[]> = {};
  for (const r of priceRows) (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  const fundsByTicker: Record<string, Fundamentals> = {};
  for (const f of fundRows) fundsByTicker[f.ticker] = f;

  const allSignals = computeSignals(byTicker, fundsByTicker);
  const signalMap = new Map(allSignals.map((s) => [s.ticker, s]));

  const from = new Date();
  from.setFullYear(from.getFullYear() - 2);
  const liveBars: Record<string, Bar[]> = {};
  await Promise.all(
    holdingRows.filter((h) => !h.in_universe).map(async (h) => {
      try { liveBars[h.ticker] = await fetchHistory(h.ticker, from); }
      catch { liveBars[h.ticker] = []; }
    })
  );

  const rows = holdingRows.map((h) => {
    if (h.in_universe) {
      const sig = signalMap.get(h.ticker);
      return {
        ...h,
        lastClose: sig?.lastClose ?? null,
        lastDate: sig?.lastDate ?? null,
        value: sig?.lastClose != null ? sig.lastClose * h.quantity : null,
        momentum: sig?.momentum ?? null,
        aboveTrend: sig?.aboveTrend ?? null,
        pctFromSma: sig?.pctFromSma ?? null,
        compositeScore: sig?.compositeScore ?? null,
        rec: recommend(h.type, sig?.aboveTrend ?? null, sig?.momentum ?? null, sig?.compositeScore ?? null),
      };
    } else {
      const sig = basicSignal(liveBars[h.ticker] ?? []);
      return {
        ...h, ...sig,
        value: sig.lastClose != null ? sig.lastClose * h.quantity : null,
        compositeScore: null,
        rec: recommend(h.type, sig.aboveTrend, sig.momentum),
      };
    }
  });

  const totalValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const COLORS = ["#d4a24c", "#6fae8c", "#7b9fc4", "#c47b9f", "#a4c47b", "#c47ba4"];

  return (
    <main>
      <div className="page">
        <div className="header">
          <div className="eyebrow">Portfolio · Signal overlay</div>
          <h1>My portfolio</h1>
          <p>
            Buy / hold / reduce signals applied to your current holdings. ASX stocks use the
            full multi-factor composite score. ETFs and crypto use momentum + 200-day trend only.
          </p>
        </div>

        {holdingRows.length === 0 && (
          <div className="panel">
            <p className="empty-state">No holdings yet — add your first one using the editor below.</p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="panel">
              <p className="panel-title">Summary · as of {rows.find((r) => r.lastDate)?.lastDate}</p>
              <div className="stat-grid">
                <div>
                  <div className="stat-label">Total value (AUD)</div>
                  <div className="stat-value">{fmtAud(totalValue)}</div>
                </div>
                {rows.map((r) => (
                  <div key={r.id}>
                    <div className="stat-label">{r.label}</div>
                    <div className="stat-value" style={{ fontSize: 18 }}>
                      {fmtAud(r.value)}
                      {totalValue > 0 && r.value != null && (
                        <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 6 }}>
                          {((r.value / totalValue) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Allocation</p>
              <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", gap: 2 }}>
                {rows.map((r, i) => {
                  const pct = totalValue > 0 && r.value != null ? (r.value / totalValue) * 100 : 0;
                  return (
                    <div key={r.id} style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#11151c", overflow: "hidden", whiteSpace: "nowrap", padding: "0 6px" }} title={`${r.label}: ${pct.toFixed(1)}%`}>
                      {pct > 8 ? `${r.label} ${pct.toFixed(1)}%` : ""}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                {rows.map((r, i) => {
                  const pct = totalValue > 0 && r.value != null ? (r.value / totalValue) * 100 : 0;
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                      {r.label} {pct.toFixed(1)}%
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">Holdings · signals + recommendations</p>
              <table>
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Value</th>
                    <th className="num">12-1 return</th>
                    <th>Trend</th>
                    <th className="num">Composite</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.in_universe ? (
                          <Link href={`/stock/${r.ticker.replace(".AX", "")}`} className="ticker-link">{r.label}</Link>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{r.label}</span>
                        )}
                        <span className="company-name"> {r.ticker}</span>
                      </td>
                      <td className="num" style={{ fontSize: 12 }}>
                        {r.type === "crypto" ? Number(r.quantity).toFixed(8) : r.quantity}
                      </td>
                      <td className="num">{fmtAud(r.lastClose)}</td>
                      <td className="num"><strong>{fmtAud(r.value)}</strong></td>
                      <td className="num">{fmtPct(r.momentum)}</td>
                      <td>
                        {r.aboveTrend !== null ? (
                          <>
                            <span className={`pill ${r.aboveTrend ? "buy" : "out"}`}>
                              {r.aboveTrend ? "▲ above" : "▼ below"}
                            </span>
                            {r.pctFromSma != null && (
                              <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-dim)" }}>
                                {fmtPct(r.pctFromSma)}
                              </span>
                            )}
                          </>
                        ) : "—"}
                      </td>
                      <td className="num">
                        {r.compositeScore != null
                          ? <strong>{Math.round(r.compositeScore * 100)}</strong>
                          : <span style={{ color: "var(--text-dim)" }}>—</span>}
                      </td>
                      <td>
                        <span className={`pill ${r.rec.badge}`} style={{ fontSize: 12, padding: "3px 10px" }}>
                          {r.rec.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.map((r) => (
              <div key={r.id} className="panel">
                <p className="panel-title">
                  {r.label}
                  {r.in_universe && (
                    <Link href={`/stock/${r.ticker.replace(".AX", "")}`} style={{ marginLeft: 10, fontSize: 12, textTransform: "none", letterSpacing: 0 }}>
                      → full detail
                    </Link>
                  )}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))" }}>
                    <div>
                      <div className="stat-label">Price</div>
                      <div className="stat-value" style={{ fontSize: 20 }}>{fmtAud(r.lastClose)}</div>
                    </div>
                    <div>
                      <div className="stat-label">12-1 momentum</div>
                      <div className={`stat-value ${r.momentum != null && r.momentum >= 0 ? "positive" : "negative"}`} style={{ fontSize: 20 }}>
                        {fmtPct(r.momentum)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">vs 200d MA</div>
                      <div className={`stat-value ${r.aboveTrend ? "positive" : "negative"}`} style={{ fontSize: 20 }}>
                        {fmtPct(r.pctFromSma)}
                      </div>
                    </div>
                    {r.compositeScore != null && (
                      <div>
                        <div className="stat-label">Composite</div>
                        <div className="stat-value" style={{ fontSize: 20 }}>{Math.round(r.compositeScore * 100)}/100</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ marginBottom: 10 }}>
                      <span className={`pill ${r.rec.badge}`} style={{ fontSize: 13, padding: "4px 14px" }}>
                        {r.rec.action}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>{r.rec.reason}</p>
                    {r.type === "asx-etf" && (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>
                        Diversified ETFs are designed for long-term holding. Use this signal to time additional contributions, not as a reason to sell.
                      </p>
                    )}
                    {r.type === "crypto" && (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-dim)", fontStyle: "italic" }}>
                        Crypto signals use price trend only — no fundamental factor scoring applies.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        <PortfolioEditor initial={holdingRows.map((h) => ({ ...h }))} />

        <footer>
          Signals are for informational purposes only — not financial advice.
        </footer>
      </div>
    </main>
  );
}
