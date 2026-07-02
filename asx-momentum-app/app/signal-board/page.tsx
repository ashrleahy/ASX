import { sql } from "@/lib/db";
import { TICKERS, BENCHMARK } from "@/lib/universe";
import { computeSignals, rankSignals, backtest, computeMarketRegime, type Bar, type Fundamentals, type Signal, type RankedPick } from "@/lib/momentum";
import EquityChart from "./components/EquityChart";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadData() {
  const priceRows = await sql`
    SELECT ticker, date::text, close FROM prices
    WHERE ticker = ANY(${[...TICKERS, BENCHMARK]})
    ORDER BY ticker, date ASC
  ` as unknown as { ticker: string; date: string; close: number }[];

  const fundRows = await sql`
    SELECT * FROM fundamentals WHERE ticker = ANY(${TICKERS})
  ` as unknown as Fundamentals[];

  const byTicker: Record<string, Bar[]> = {};
  for (const r of priceRows) (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });

  const fundsByTicker: Record<string, Fundamentals> = {};
  for (const f of fundRows) fundsByTicker[f.ticker] = f;

  return { byTicker, fundsByTicker };
}

function pct(x: number) { return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`; }
function score(x: number) { return Math.round(x * 100); }

function qualityBadge(q: Signal['dataQuality']) {
  if (q === 'full')    return { stars: '★★★', color: 'var(--accent-green)', title: 'All 3 factors: momentum + value + quality' };
  if (q === 'partial') return { stars: '★★☆', color: 'var(--accent-gold)',  title: '2 factors: missing one fundamental metric' };
  return                      { stars: '★☆☆', color: 'var(--text-dim)',     title: 'Price only — no fundamental data available' };
}

export default async function Page() {
  let byTicker: Record<string, Bar[]> = {};
  let fundsByTicker: Record<string, Fundamentals> = {};
  let dbError: string | null = null;

  try {
    ({ byTicker, fundsByTicker } = await loadData());
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'Unknown database error';
  }

  const benchmarkBars = byTicker[BENCHMARK] ?? [];
  const stockBars = { ...byTicker };
  delete stockBars[BENCHMARK];

  const hasData         = Object.keys(stockBars).length > 0 && benchmarkBars.length > 0;
  const hasFundamentals = Object.keys(fundsByTicker).length > 0;

  let signals: Signal[]     = [];
  let picks:   RankedPick[] = [];
  let eligibleCount = 0;
  let universeCount = 0;
  let equityCurve: { date: string; strategy: number; benchmark: number }[] = [];
  let stats = { cagrStrategy: 0, cagrBenchmark: 0, maxDrawdownStrategy: 0, weeks: 0 };

  const regime = computeMarketRegime(benchmarkBars);

  if (hasData) {
    signals = computeSignals(stockBars, fundsByTicker)
      .sort((a, b) => b.compositeScore - a.compositeScore);

    const ranked  = rankSignals(signals, regime, 0.15);
    picks         = ranked.picks;
    eligibleCount = ranked.eligibleCount;
    universeCount = ranked.universeCount;

    const result = backtest(stockBars, benchmarkBars, 0.15);
    equityCurve  = result.equityCurve;
    stats        = result.stats;
  }

  const fullCount    = signals.filter(s => s.dataQuality === 'full').length;
  const partialCount = signals.filter(s => s.dataQuality === 'partial').length;
  const priceOnly    = signals.filter(s => s.dataQuality === 'price-only').length;

  return (
    <main>
      <div className="tape">
        <div className="tape-track">
          {[...picks, ...picks].slice(0, 30).map((s, i) => (
            <span key={i} className="up">{s.ticker.replace('.AX', '')} {pct(s.momentum)} ({s.weightPct})</span>
          ))}
          {!picks.length && signals.slice(0, 15).map((s, i) => (
            <span key={i} className={s.momentum >= 0 ? 'up' : 'down'}>{s.ticker.replace('.AX', '')} {pct(s.momentum)}</span>
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
            Position sizing: <strong>inverse volatility</strong>. Max <strong>2 stocks per sector</strong>.
            Weekly rebalance. Click any ticker for full detail.
          </p>
        </div>

        {hasData && (
          <div className={`regime-banner ${regime.status}`}>
            <div className="regime-left">
              <span className="regime-dot" />
              <strong>
                {regime.status === 'bull' ? 'Bull market' : regime.status === 'bear' ? 'Bear market — defensive mode' : 'Regime unknown'}
              </strong>
              <span style={{ marginLeft: 12, opacity: 0.85, fontSize: 13 }}>
                ASX200 {regime.pctFromSma != null ? pct(regime.pctFromSma) : '—'} vs 200-day MA
              </span>
            </div>
            <div className="regime-right">
              {regime.status === 'bear' ? '50% cash · positions halved' : regime.status === 'bull' ? '100% invested' : ''}
            </div>
          </div>
        )}

        {dbError && (
          <div className="panel">
            <p className="empty-state">Database error: <code>{dbError}</code></p>
          </div>
        )}

        {!dbError && !hasData && (
          <div className="panel">
            <p className="empty-state">No price history yet — run <code>/api/backfill</code> first.</p>
          </div>
        )}

        {!dbError && hasData && !hasFundamentals && (
          <div className="panel">
            <p className="empty-state">
              ⚠ No fundamental data — value and quality scores showing as —.
              Run <code>/api/backfill-fundamentals</code> in batches to populate them.
            </p>
          </div>
        )}

        {hasData && signals.length > 0 && (
          <div className="panel" style={{ padding: '14px 24px' }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12 }}>
              <span style={{ color: 'var(--text-dim)' }}>Data quality:</span>
              <span style={{ color: 'var(--accent-green)' }}>★★★ Full ({fullCount})</span>
              <span style={{ color: 'var(--accent-gold)' }}>★★☆ Partial ({partialCount})</span>
              <span style={{ color: 'var(--text-dim)' }}>★☆☆ Price only ({priceOnly})</span>
              <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
                Sector cap: max 2 per sector · Sizing: 1/volatility weighted
              </span>
            </div>
          </div>
        )}

        {hasData && (
          <>
            <div className="panel">
              <p className="panel-title">
                Weekly picks — top {picks.length} of {eligibleCount} above-trend
                (universe: {universeCount}) · as of {signals[0]?.lastDate}
                {regime.status === 'bear' && <span style={{ color: 'var(--accent-rose)', marginLeft: 8 }}>· 50% cash applied</span>}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Sector</th>
                    <th className="num">Alloc</th>
                    <th className="num">Composite</th>
                    <th className="num">Mom</th>
                    <th className="num">Val</th>
                    <th className="num">Qual</th>
                    <th className="num">12-1 return</th>
                    <th className="num">30d vol</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((p) => {
                    const qb = qualityBadge(p.dataQuality);
                    return (
                      <tr key={p.ticker}>
                        <td>
                          <Link href={`/stock/${p.ticker.replace('.AX', '')}`} className="ticker-link">
                            {p.ticker.replace('.AX', '')}
                          </Link>
                          {p.fundamentals?.company_name && (
                            <span className="company-name"> {p.fundamentals.company_name}</span>
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.fundamentals?.sector ?? '—'}</td>
                        <td className="num"><strong>{p.weightPct}</strong></td>
                        <td className="num"><strong>{score(p.compositeScore)}</strong></td>
                        <td className="num">{score(p.momentumScore)}</td>
                        <td className="num">{p.valueScore   != null ? score(p.valueScore)   : '—'}</td>
                        <td className="num">{p.qualityScore != null ? score(p.qualityScore) : '—'}</td>
                        <td className="num">{pct(p.momentum)}</td>
                        <td className="num" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                          {p.realisedVol != null ? pct(p.realisedVol) : '—'}
                        </td>
                        <td><span title={qb.title} style={{ color: qb.color, fontSize: 13 }}>{qb.stars}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <p className="panel-title">
                Backtest vs ASX 200 — weekly rebalance · vol-weighted · regime filter · momentum-only
                <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-dim)' }}>
                  (historical fundamentals not available with free data)
                </span>
              </p>
              <div className="stat-grid" style={{ marginBottom: 24 }}>
                <div>
                  <div className="stat-label">Strategy CAGR</div>
                  <div className={`stat-value ${stats.cagrStrategy >= 0 ? 'positive' : 'negative'}`}>{pct(stats.cagrStrategy)}</div>
                </div>
                <div>
                  <div className="stat-label">ASX200 CAGR</div>
                  <div className={`stat-value ${stats.cagrBenchmark >= 0 ? 'positive' : 'negative'}`}>{pct(stats.cagrBenchmark)}</div>
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
                    <th>Sector</th>
                    <th className="num">Composite</th>
                    <th className="num">Mom</th>
                    <th className="num">Val</th>
                    <th className="num">Qual</th>
                    <th className="num">12-1 return</th>
                    <th className="num">30d vol</th>
                    <th>Trend</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => {
                    const qb = qualityBadge(s.dataQuality);
                    return (
                      <tr key={s.ticker}>
                        <td>
                          <Link href={`/stock/${s.ticker.replace('.AX', '')}`} className="ticker-link">
                            {s.ticker.replace('.AX', '')}
                          </Link>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.fundamentals?.sector ?? '—'}</td>
                        <td className="num"><strong>{score(s.compositeScore)}</strong></td>
                        <td className="num">{score(s.momentumScore)}</td>
                        <td className="num">{s.valueScore   != null ? score(s.valueScore)   : '—'}</td>
                        <td className="num">{s.qualityScore != null ? score(s.qualityScore) : '—'}</td>
                        <td className="num">{pct(s.momentum)}</td>
                        <td className="num" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                          {s.realisedVol != null ? pct(s.realisedVol) : '—'}
                        </td>
                        <td>
                          <span className={`pill ${s.aboveTrend ? 'buy' : 'out'}`}>
                            {s.aboveTrend ? 'above' : 'below'}
                          </span>
                        </td>
                        <td><span title={qb.title} style={{ color: qb.color, fontSize: 13 }}>{qb.stars}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <footer>
          Free-data prototype · ~80 liquid ASX names · survivorship bias present · not financial advice
        </footer>
      </div>
    </main>
  );
}
