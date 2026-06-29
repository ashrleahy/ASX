export type Bar = { date: string; close: number };

export type Signal = {
  ticker: string;
  momentum: number; // 12-1 month return
  aboveTrend: boolean; // price > 200-day SMA
  lastClose: number;
  lastDate: string;
};

const TRADING_DAYS_YEAR = 252;
const SKIP_DAYS = 21; // skip most recent month (standard 12-1 momentum)
const TREND_WINDOW = 200;

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(values.length - window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

/**
 * Compute 12-1 momentum + 200-day trend filter for one ticker's series.
 * `bars` must be sorted ascending by date.
 */
export function computeSignal(ticker: string, bars: Bar[]): Signal | null {
  if (bars.length < TRADING_DAYS_YEAR + SKIP_DAYS) return null;

  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];

  const pSkip = closes[closes.length - 1 - SKIP_DAYS];
  const p12 = closes[closes.length - 1 - SKIP_DAYS - (TRADING_DAYS_YEAR - SKIP_DAYS)];
  const momentum = pSkip / p12 - 1;

  const trendSma = sma(closes, TREND_WINDOW);
  const aboveTrend = trendSma !== null && last.close > trendSma;

  return {
    ticker,
    momentum,
    aboveTrend,
    lastClose: last.close,
    lastDate: last.date,
  };
}

/**
 * Rank signals by momentum, keep only those above their trend filter,
 * and return the top `topFraction` of that filtered set (equal-weighted).
 */
export function rankSignals(signals: Signal[], topFraction = 0.15) {
  const eligible = signals.filter((s) => s.aboveTrend);
  const ranked = [...eligible].sort((a, b) => b.momentum - a.momentum);
  const n = Math.max(1, Math.round(ranked.length * topFraction));
  return {
    picks: ranked.slice(0, n),
    eligibleCount: eligible.length,
    universeCount: signals.length,
  };
}

// ---------------------------------------------------------------------
// Backtest: monthly rebalance, equal-weight top decile/percentile, no costs.
// ---------------------------------------------------------------------

export type EquityPoint = { date: string; strategy: number; benchmark: number };

export function backtest(
  pricesByTicker: Record<string, Bar[]>,
  benchmarkBars: Bar[],
  topFraction = 0.15
): { equityCurve: EquityPoint[]; stats: ReturnType<typeof computeStats> } {
  // Build a unified monthly rebalance calendar from the benchmark's dates.
  const benchByDate = new Map(benchmarkBars.map((b) => [b.date, b.close]));
  const monthEnds: string[] = [];
  let lastMonth = "";
  let prevDate = "";
  for (const b of benchmarkBars) {
    const month = b.date.slice(0, 7);
    if (month !== lastMonth) {
      if (lastMonth !== "") monthEnds.push(prevDate);
      lastMonth = month;
    }
    prevDate = b.date;
  }
  if (prevDate) monthEnds.push(prevDate);

  // Need at least 12mo + 1mo of history before the first rebalance.
  const minHistoryDays = TRADING_DAYS_YEAR + SKIP_DAYS;
  const tickers = Object.keys(pricesByTicker);
  const seriesIndex: Record<string, Map<string, number>> = {};
  for (const t of tickers) {
    seriesIndex[t] = new Map(pricesByTicker[t].map((b) => [b.date, b.close]));
  }

  let strategyEquity = 1;
  let benchEquity = 1;
  const equityCurve: EquityPoint[] = [];
  let holdings: string[] = [];
  let entryPrices: Record<string, number> = {};
  let benchEntry: number | null = null;

  for (let i = 0; i < monthEnds.length; i++) {
    const asOf = monthEnds[i];

    // Mark-to-market existing holdings up to this date, then rebalance.
    if (holdings.length && benchEntry !== null) {
      const avgReturn =
        holdings.reduce((sum, t) => {
          const px = seriesIndex[t].get(asOf);
          return sum + (px ? px / entryPrices[t] - 1 : 0);
        }, 0) / holdings.length;
      const benchPx = benchByDate.get(asOf);
      const benchReturn = benchPx ? benchPx / benchEntry - 1 : 0;
      strategyEquity *= 1 + avgReturn;
      benchEquity *= 1 + benchReturn;
    }

    equityCurve.push({ date: asOf, strategy: strategyEquity, benchmark: benchEquity });

    // Build signals as of this date for next period's holdings.
    const signals: Signal[] = [];
    for (const t of tickers) {
      const bars = pricesByTicker[t].filter((b) => b.date <= asOf);
      if (bars.length < minHistoryDays) continue;
      const sig = computeSignal(t, bars);
      if (sig) signals.push(sig);
    }
    const { picks } = rankSignals(signals, topFraction);
    holdings = picks.map((p) => p.ticker);
    entryPrices = Object.fromEntries(picks.map((p) => [p.ticker, p.lastClose]));
    benchEntry = benchByDate.get(asOf) ?? null;
  }

  return { equityCurve, stats: computeStats(equityCurve) };
}

function computeStats(curve: EquityPoint[]) {
  if (curve.length < 2) {
    return { cagrStrategy: 0, cagrBenchmark: 0, maxDrawdownStrategy: 0, months: 0 };
  }
  const months = curve.length - 1;
  const years = months / 12;
  const cagr = (final: number) => Math.pow(final, 1 / Math.max(years, 0.01)) - 1;

  let peak = curve[0].strategy;
  let maxDD = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.strategy);
    maxDD = Math.min(maxDD, p.strategy / peak - 1);
  }

  return {
    cagrStrategy: cagr(curve[curve.length - 1].strategy),
    cagrBenchmark: cagr(curve[curve.length - 1].benchmark),
    maxDrawdownStrategy: maxDD,
    months,
  };
}
