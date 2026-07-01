import { sql } from "@/lib/db";
import { TICKERS, BENCHMARK } from "@/lib/universe";
import { computeSignals, rankSignals, backtest, type Bar, type Fundamentals, type Signal } from "@/lib/momentum";
import EquityChart from "./components/EquityChart";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function loadData() {
  const [priceRows, fundRows] = await Promise.all([
    sql`SELECT ticker, date::text, close FROM prices
        WHERE ticker = ANY(${[...TICKERS, BENCHMARK]})
        ORDER BY ticker, date ASC` as unknown as Promise<{ ticker: string; date: string; close: number }[]>,
    sql`SELECT * FROM fundamentals WHERE ticker = ANY(${TICKERS})` as unknown as Promise<Fundamentals[]>,
  ]);

  const byTicker: Record<string, Bar[]> = {};
  for (const r of priceRows) {
    (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  }

  const fundsByTicker: Record<string, Fundamentals> = {};
  for (const f of fundRows) fundsByTicker[f.ticker] = f;

  return { byTicker, fundsByTicker };
}

function pct(x: number) {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
}

function score(x: number) {
  return Math.round(x * 100);
}

export default async function Page() {
  let byTicker: Record<string, Bar[]> = {};
  let fundsByTicker: Record<string, Fundamentals> = {};
  let dbError: string | null = null;

  try {
    ({ byTicker, fundsByTicker } = await loadData());
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Unknown database error";
  }

  const benchmarkBars = byTicker[BENCHMARK] ?? [];
  const stockBars = { ...byTicker };
  delete stockBars[BENCHMARK];

  const hasData = Object.keys(stockBars).length > 0 && benchmarkBars.length > 0;
  const hasFundamentals = Object.keys(fundsByTicker).length > 0;

  let signals: Signal[] = [];
  let picks: Signal[] = [];
  let eligibleCount = 0;
  let universeCount = 0;
  let equityCurve: { date: string; strategy: number; benchmark: number }[] = [];
  let stats = { cagrStrategy: 0, cagrBenchmark: 0, maxDrawdownStrategy: 0, weeks: 0 };

  if (hasData) {
    signals = computeSignals(stockBars, fundsByTicker)
      .sort((a, b) => b.compositeScore - a.compositeScore);

    const ranked = rankSignals(signals, 0.15);
    picks = ranked.picks;
    eligibleCount = ranked.eligibleCount;
    universeCount = ranked.universeCount;

    const result = backtest(stockBars, benchmarkBars, 0.15);
    equityCurve = result.equityCurve;
    stats = result.stats;
  }

  return (
    <main>
      <div className="tape">
        <div className="tape-track">
          {[...picks, ...picks].slice(0, 30).map((s, i) => (
            <span key={i} className="up">
              {s.ticker.replace(".AX", "")} {pct(s.momentum)}
            </span>
          ))}
          {!picks.length && signals.slice(0, 15).map((s, i) => (
            <span key={i} className={s.momentum >= 0 ? "up" : "down"}>
              {s.ticker.replace(".AX", "")} {pct(s.momentum)}
            </span>
          ))}
          {!signals.length && <span>No signal data yet — run /api/backfill to get started</span>}
        </div>
      </div>

      <div className="page">
        <div className="header">
          <div className="eyebrow">ASX · Multi-factor signals</div>
          <h1>Signal board</h1>
          <p>
            Composite score: <strong>momentum 40%</strong>, <strong>value 30%</strong>, <strong>quality 30%</strong>.
            Stocks must be above their 200-day average to be eligible. Weekly rebalance,
            equal-weighted top 15% of eligible universe. Click any ticker for full detail.
          </p>
        </div>

        {dbError && (
          <div className="panel">
            <p className="empty-state">
              Database error: <code>{dbError}</code>
            </p>
          </div>
        )}

        {!dbError && !hasData && (
          <div className="panel">
            <p className="empty-state">
              No price history yet. Run the one-off backfill once, e.g.:
              <br />
              <code>curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://your-app.vercel.app/api/backfill</code>
            </p>
          </div>
        )}

        {!dbError && hasData && !hasFundamentals && (
          <div className="panel">
            <p className="empty-state">
              ⚠ Fundamental data not yet loaded — value and quality scores will show as —.
              Run <code>/api/backfill-fundamentals</code> in batches to populate them.
            </p>
          </div>
        )}

        {hasData && (
          <>
            <div className="panel">
              <p className="panel-title">
                Weekly picks — top {picks.length} of {eligibleCount} above-trend stocks
                (universe: {universeCount}) · as of {signals[0]?.lastDate}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="num">Composite</th>
                    <th className="num">Momentum</th>
                    <th className="num">Value</th>
                    <th className="num">Quality</th>
                    <th className="num">12-1 return</th>
                    <th className="num">Last close</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((p) => (
                    <tr key={p.ticker}>
                      <td>
                        <Link href={`/stock/${p.ticker.replace(".AX", "")}`} className="ticker-link">
                          {p.ticker.replace(".AX", "")}
                        </Link>
                        {p.fundamentals?.company_name && (
                          <span className="company-name"> {p.fundamentals.company_name}</span>
                        )}
                      </td>
                      <td className="num"><strong>{score(p.compositeScore)}</strong></td>
                      <td className="num">{score(p.momentumScore)}</td>
                      <td className="num">{p.valueScore != null ? score(p.valueScore) : "—"}</td>
                      <td className="num">{p.qualityScore != null ? score(p.qualityScore) : "—"}</td>
                      <td className="num">{pct(p.momentum)}</td>
                      <td className="num">${p.lastClose.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <p className="panel-title">
                Backtest vs ASX 200 — weekly rebalance, momentum-only
                <span style={{ fontWeight: 400, marginLeft: 8, color: "var(--text-dim)" }}>
                  (historical fundamentals not available with free data)
                </span>
              </p>
              <div className="stat-grid" style={{ marginBottom: 24 }}>
                <div>
                  <div className="stat-label">Strategy CAGR</div>
                  <div className={`stat-value ${stats.cagrStrategy >= 0 ? "positive" : "negative"}`}>
                    {pct(stats.cagrStrategy)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">ASX200 CAGR</div>
                  <div className={`stat-value ${stats.cagrBenchmark >= 0 ? "positive" : "negative"}`}>
                    {pct(stats.cagrBenchmark)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Max drawdown</div>
                  <div className="stat-value negative">{pct(stats.maxDrawdownStrategy)}</div>
                </div>
                <div>
                  <div className="stat-label">Weeks tested</div>
                  <div className="stat-value">{stats.weeks}</div>
                </div>
              </div>
              <EquityChart data={equityCurve} />
            </div>

            <div className="panel">
              <p className="panel-title">Full universe — ranked by composite score</p>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="num">Composite</th>
                    <th className="num">Momentum</th>
                    <th className="num">Value</th>
                    <th className="num">Quality</th>
                    <th className="num">12-1 return</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => (
                    <tr key={s.ticker}>
                      <td>
                        <Link href={`/stock/${s.ticker.replace(".AX", "")}`} className="ticker-link">
                          {s.ticker.replace(".AX", "")}
                        </Link>
                      </td>
                      <td className="num"><strong>{score(s.compositeScore)}</strong></td>
                      <td className="num">{score(s.momentumScore)}</td>
                      <td className="num">{s.valueScore != null ? score(s.valueScore) : "—"}</td>
                      <td className="num">{s.qualityScore != null ? score(s.qualityScore) : "—"}</td>
                      <td className="num">{pct(s.momentum)}</td>
                      <td>
                        <span className={`pill ${s.aboveTrend ? "buy" : "out"}`}>
                          {s.aboveTrend ? "above" : "below"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer>
          Free-data prototype · ~80 liquid ASX names · not the exact point-in-time ASX200 constituent list
        </footer>
      </div>
    </main>
  );
}
