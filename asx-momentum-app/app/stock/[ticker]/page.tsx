import { sql } from "@/lib/db";
import { TICKERS } from "@/lib/universe";
import { computeSignals, type Bar, type Fundamentals } from "@/lib/momentum";
import Link from "next/link";
import EquityChart from "@/app/components/EquityChart";

export const dynamic = "force-dynamic";

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function fmtMarketCap(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function scoreBadge(score: number): string {
  if (score >= 0.75) return "strong";
  if (score >= 0.5)  return "neutral";
  return "weak";
}

export default async function StockPage({
  params,
}: {
  params: { ticker: string };
}) {
  const rawTicker = params.ticker.toUpperCase();
  const ticker = rawTicker.includes(".") ? rawTicker : `${rawTicker}.AX`;

  if (!TICKERS.includes(ticker)) {
    return (
      <main>
        <div className="page">
          <div className="header">
            <Link href="/" className="back-link">← Back</Link>
            <h1>{ticker} — not in universe</h1>
          </div>
        </div>
      </main>
    );
  }

  const priceRows = await sql`
    SELECT ticker, date::text, close FROM prices
    WHERE ticker = ANY(${TICKERS})
    ORDER BY ticker, date ASC
  ` as unknown as { ticker: string; date: string; close: number }[];

  const byTicker: Record<string, Bar[]> = {};
  for (const r of priceRows) {
    (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  }

  const fundRows = await sql`
    SELECT * FROM fundamentals WHERE ticker = ANY(${TICKERS})
  ` as unknown as Fundamentals[];

  const fundsByTicker: Record<string, Fundamentals> = {};
  for (const f of fundRows) fundsByTicker[f.ticker] = f;

  const allSignals = computeSignals(byTicker, fundsByTicker);
  const signal = allSignals.find((s) => s.ticker === ticker);
  const fund = fundsByTicker[ticker] ?? null;

  const bars = byTicker[ticker] ?? [];
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const chartBars = bars
    .filter((b) => b.date >= cutoffStr)
    .map((b) => ({ date: b.date, strategy: b.close, benchmark: b.close }));

  const name = fund?.company_name ?? ticker.replace(".AX", "");

  return (
    <main>
      <div className="page">
        <div className="header">
          <Link href="/" className="back-link">← Back to signals</Link>
          <div className="eyebrow">
            {fund?.sector ?? "ASX"} · {fund?.industry ?? ticker.replace(".AX", "")}
          </div>
          <h1>{name}</h1>
          <p style={{ fontSize: 16 }}>
            <strong>{ticker.replace(".AX", "")}</strong>
            {signal && (
              <> · Last close <strong>${signal.lastClose.toFixed(2)}</strong> · {signal.lastDate}</>
            )}
          </p>
        </div>

        {/* Factor scores */}
        {signal && (
          <div className="panel">
            <p className="panel-title">
              Factor scores — percentile rank vs ASX universe (higher = better)
            </p>
            <div className="factor-grid">
              <div className={`factor-card ${scoreBadge(signal.compositeScore)}`}>
                <div className="factor-label">Composite</div>
                <div className="factor-value">{Math.round(signal.compositeScore * 100)}</div>
                <div className="factor-sub">0.4 × momentum + 0.3 × value + 0.3 × quality</div>
              </div>
              <div className={`factor-card ${scoreBadge(signal.momentumScore)}`}>
                <div className="factor-label">Momentum (40%)</div>
                <div className="factor-value">{Math.round(signal.momentumScore * 100)}</div>
                <div className="factor-sub">
                  12-1 month return: {signal.momentum >= 0 ? "+" : ""}{(signal.momentum * 100).toFixed(1)}%
                </div>
              </div>
              <div className={`factor-card ${signal.valueScore != null ? scoreBadge(signal.valueScore) : "neutral"}`}>
                <div className="factor-label">Value (30%)</div>
                <div className="factor-value">
                  {signal.valueScore != null ? Math.round(signal.valueScore * 100) : "—"}
                </div>
                <div className="factor-sub">Based on P/E and P/B earnings yields</div>
              </div>
              <div className={`factor-card ${signal.qualityScore != null ? scoreBadge(signal.qualityScore) : "neutral"}`}>
                <div className="factor-label">Quality (30%)</div>
                <div className="factor-value">
                  {signal.qualityScore != null ? Math.round(signal.qualityScore * 100) : "—"}
                </div>
                <div className="factor-sub">Based on ROE and debt/equity</div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <span className={`pill ${signal.aboveTrend ? "buy" : "out"}`}>
                {signal.aboveTrend ? "▲ above 200-day trend" : "▼ below 200-day trend"}
              </span>
              {signal.pctFromSma != null && (
                <span style={{ marginLeft: 10, fontSize: 13, color: "var(--text-dim)" }}>
                  {signal.pctFromSma >= 0 ? "+" : ""}{(signal.pctFromSma * 100).toFixed(1)}% from SMA
                  ({fmt(signal.trendSma, 2)})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Key stats */}
        {fund && (
          <div className="panel">
            <p className="panel-title">Key statistics</p>
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <div>
                <div className="stat-label">Market cap</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmtMarketCap(fund.market_cap)}</div>
              </div>
              <div>
                <div className="stat-label">Trailing P/E</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(fund.trailing_pe, 1)}</div>
              </div>
              <div>
                <div className="stat-label">Forward P/E</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(fund.forward_pe, 1)}</div>
              </div>
              <div>
                <div className="stat-label">Price / Book</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(fund.price_to_book, 2)}</div>
              </div>
              <div>
                <div className="stat-label">ROE</div>
                <div
                  className={`stat-value ${fund.return_on_equity != null && fund.return_on_equity > 0 ? "positive" : ""}`}
                  style={{ fontSize: 18 }}
                >
                  {fmtPct(fund.return_on_equity)}
                </div>
              </div>
              <div>
                <div className="stat-label">Debt / Equity</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(fund.debt_to_equity, 1)}</div>
              </div>
              <div>
                <div className="stat-label">Current ratio</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(fund.current_ratio, 2)}</div>
              </div>
              <div>
                <div className="stat-label">Gross margin</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmtPct(fund.gross_margins)}</div>
              </div>
              <div>
                <div className="stat-label">Op. margin</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmtPct(fund.operating_margins)}</div>
              </div>
              <div>
                <div className="stat-label">Beta</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmt(fund.beta, 2)}</div>
              </div>
              <div>
                <div className="stat-label">Div. yield</div>
                <div className="stat-value" style={{ fontSize: 18 }}>{fmtPct(fund.dividend_yield)}</div>
              </div>
              <div>
                <div className="stat-label">52w range</div>
                <div className="stat-value" style={{ fontSize: 14 }}>
                  ${fmt(fund.fifty_two_week_low, 2)} – ${fmt(fund.fifty_two_week_high, 2)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Price chart */}
        {chartBars.length > 0 && (
          <div className="panel">
            <p className="panel-title">Price — last 12 months</p>
            <EquityChart
              data={chartBars}
              singleLine
              label={ticker.replace(".AX", "")}
            />
          </div>
        )}

        {/* Business description */}
        {fund?.description && (
          <div className="panel">
            <p className="panel-title">About</p>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-dim)", margin: 0 }}>
              {fund.description}
            </p>
          </div>
        )}

        {!fund && (
          <div className="panel">
            <p className="empty-state">
              No fundamental data yet. Run{" "}
              <code>/api/backfill-fundamentals?secret=YOUR_SECRET</code> to populate it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
