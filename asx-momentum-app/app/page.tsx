import { sql } from "@/lib/db";
import { TICKERS, BENCHMARK } from "@/lib/universe";
import { computeSignal, rankSignals, backtest, type Bar, type Signal } from "@/lib/momentum";
import EquityChart from "./components/EquityChart";

export const dynamic = "force-dynamic"; // always read fresh from the DB

async function loadPrices() {
  const rows = (await sql`
    SELECT ticker, date::text, close FROM prices
    WHERE ticker = ANY(${[...TICKERS, BENCHMARK]})
    ORDER BY ticker, date ASC
  `) as { ticker: string; date: string; close: number }[];

  const byTicker: Record<string, Bar[]> = {};
  for (const r of rows) {
    (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  }
  return byTicker;
}

function pct(x: number) {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
}

export default async function Page() {
  let byTicker: Record<string, Bar[]> = {};
  let dbError: string | null = null;
  try {
    byTicker = await loadPrices();
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Unknown database error";
  }

  const benchmarkBars = byTicker[BENCHMARK] ?? [];
  const stockBars = { ...byTicker };
  delete stockBars[BENCHMARK];

  const hasData = Object.keys(stockBars).length > 0 && benchmarkBars.length > 0;

  let signals: Signal[] = [];
  let picks: Signal[] = [];
  let eligibleCount = 0;
  let universeCount = 0;
  let equityCurve: { date: string; strategy: number; benchmark: number }[] = [];
  let stats = { cagrStrategy: 0, cagrBenchmark: 0, maxDrawdownStrategy: 0, months: 0 };

  if (hasData) {
    signals = Object.entries(stockBars)
      .map(([ticker, bars]) => computeSignal(ticker, bars))
      .filter((s): s is Signal => s !== null)
      .sort((a, b) => b.momentum - a.momentum);

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
          {[...signals, ...signals].slice(0, 40).map((s, i) => (
            <span key={i} className={s.momentum >= 0 ? "up" : "down"}>
              {s.ticker.replace(".AX", "")} {pct(s.momentum)}
            </span>
          ))}
          {!signals.length && <span>No signal data yet — run the backfill route to get started</span>}
        </div>
      </div>

      <div className="page">
        <div className="header">
          <div className="eyebrow">ASX · Long-term momentum</div>
          <h1>Momentum signal board</h1>
          <p>
            12-month momentum (skipping the most recent month) filtered to stocks trading above
            their 200-day average. Monthly rebalance, equal-weighted top 15% of the eligible
            universe. Signals only — you decide what to actually trade.
          </p>
        </div>

        {dbError && (
          <div className="panel">
            <p className="empty-state">
              Couldn&apos;t reach the database: <code>{dbError}</code>. Check that{" "}
              <code>DATABASE_URL</code> is set in your Vercel project&apos;s environment variables.
            </p>
          </div>
        )}

        {!dbError && !hasData && (
          <div className="panel">
            <p className="empty-state">
              No price history yet. Run the one-off backfill once, e.g.:
              <br />
              <code>curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://your-app.vercel.app/api/backfill</code>
              <br />
              Then the daily cron job will keep things current automatically.
            </p>
          </div>
        )}

        {hasData && (
          <>
            <div className="panel">
              <p className="panel-title">
                Current picks — top {picks.length} of {eligibleCount} eligible
                (universe: {universeCount}) — as of {signals[0]?.lastDate}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="num">12-1 momentum</th>
                    <th className="num">Last close</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((p) => (
                    <tr key={p.ticker}>
                      <td>{p.ticker.replace(".AX", "")}</td>
                      <td className="num">{pct(p.momentum)}</td>
                      <td className="num">${p.lastClose.toFixed(2)}</td>
                      <td>
                        <span className="pill buy">above trend</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <p className="panel-title">Backtest vs ASX 200 (no fees/slippage modelled)</p>
              <div className="stat-grid" style={{ marginBottom: 24 }}>
                <div>
                  <div className="stat-label">Strategy CAGR</div>
                  <div
                    className={`stat-value ${stats.cagrStrategy >= 0 ? "positive" : "negative"}`}
                  >
                    {pct(stats.cagrStrategy)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">ASX200 CAGR</div>
                  <div
                    className={`stat-value ${stats.cagrBenchmark >= 0 ? "positive" : "negative"}`}
                  >
                    {pct(stats.cagrBenchmark)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Max drawdown</div>
                  <div className="stat-value negative">{pct(stats.maxDrawdownStrategy)}</div>
                </div>
                <div>
                  <div className="stat-label">Months tested</div>
                  <div className="stat-value">{stats.months}</div>
                </div>
              </div>
              <EquityChart data={equityCurve} />
            </div>

            <div className="panel">
              <p className="panel-title">Full universe ranking</p>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="num">12-1 momentum</th>
                    <th>Trend filter</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => (
                    <tr key={s.ticker}>
                      <td>{s.ticker.replace(".AX", "")}</td>
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
          Free-data prototype — ~80 liquid ASX names, not the exact point-in-time ASX200
          constituent list. Good for testing logic, not for trusting absolute returns.
        </footer>
      </div>
    </main>
  );
}
