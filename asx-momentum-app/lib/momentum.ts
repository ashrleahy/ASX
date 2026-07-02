export type Bar = { date: string; close: number };

export type Fundamentals = {
  ticker: string;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  ev_to_ebitda: number | null;
  free_cashflow: number | null;
  peg_ratio: number | null;
  earnings_growth: number | null;
  return_on_equity: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  gross_margins: number | null;
  operating_margins: number | null;
  market_cap: number | null;
  beta: number | null;
  dividend_yield: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  sector: string | null;
  industry: string | null;
  company_name: string | null;
  description: string | null;
};

export type Signal = {
  ticker: string;
  momentum: number;
  aboveTrend: boolean;
  trendSma: number | null;
  lastClose: number;
  lastDate: string;
  pctFromSma: number | null;
  realisedVol: number | null;
  momentumScore: number;
  valueScore: number | null;
  qualityScore: number | null;
  pegScore: number | null;
  compositeScore: number;
  dataQuality: 'full' | 'partial' | 'price-only';
  fundamentals?: Fundamentals;
};

export type RankedPick = Signal & {
  weight: number;
  weightPct: string;
  effectiveWeight: number;
};

export type MarketRegime = {
  status: 'bull' | 'bear' | 'unknown';
  benchmarkClose: number | null;
  benchmarkSma200: number | null;
  pctFromSma: number | null;
  cashAllocation: number;
};

export type DeepValuePick = {
  ticker: string;
  sector: string | null;
  company_name: string | null;
  lastClose: number;
  pctFromSma: number;
  valueScore: number;
  qualityScore: number;
  pegScore: number | null;
  combinedScore: number;
  ev_to_ebitda: number | null;
  fcfYield: number | null;
  peg_ratio: number | null;
  return_on_equity: number | null;
};

const W_MOMENTUM = 0.35;
const W_VALUE    = 0.25;
const W_QUALITY  = 0.25;
const W_PEG      = 0.15;

const TRADING_DAYS_YEAR = 252;
const SKIP_DAYS    = 21;
const TREND_WINDOW = 200;
const VOL_DAYS     = 21;
const MAX_PER_SECTOR = 2;

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(values.length - window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

function percentileRank(value: number, allValues: number[]): number {
  const below = allValues.filter((v) => v < value).length;
  return below / (allValues.length - 1 || 1);
}

function realisedVolatility(closes: number[]): number | null {
  if (closes.length < VOL_DAYS + 1) return null;
  const recent   = closes.slice(-(VOL_DAYS + 1));
  const returns  = recent.slice(1).map((p, i) => Math.log(p / recent[i]));
  const mean     = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * TRADING_DAYS_YEAR);
}

function medianOf(values: number[]): number {
  if (!values.length) return 0.2;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function computeMarketRegime(benchmarkBars: Bar[]): MarketRegime {
  if (benchmarkBars.length < TREND_WINDOW) {
    return { status: 'unknown', benchmarkClose: null, benchmarkSma200: null, pctFromSma: null, cashAllocation: 0 };
  }
  const closes  = benchmarkBars.map((b) => b.close);
  const last    = closes[closes.length - 1];
  const sma200  = closes.slice(-TREND_WINDOW).reduce((a, b) => a + b, 0) / TREND_WINDOW;
  const pctFromSma = last / sma200 - 1;
  return {
    status: last > sma200 ? 'bull' : 'bear',
    benchmarkClose: last, benchmarkSma200: sma200, pctFromSma,
    cashAllocation: last > sma200 ? 0 : 0.5,
  };
}

function computeRawSignal(
  ticker: string,
  bars: Bar[]
): Omit<Signal, 'momentumScore' | 'valueScore' | 'qualityScore' | 'pegScore' | 'compositeScore' | 'dataQuality'> | null {
  if (bars.length < TRADING_DAYS_YEAR + SKIP_DAYS) return null;
  const closes = bars.map((b) => b.close);
  const last   = bars[bars.length - 1];
  const pSkip  = closes[closes.length - 1 - SKIP_DAYS];
  const p12    = closes[closes.length - 1 - SKIP_DAYS - (TRADING_DAYS_YEAR - SKIP_DAYS)];
  const momentum    = pSkip / p12 - 1;
  const trendSmaVal = sma(closes, TREND_WINDOW);
  const aboveTrend  = trendSmaVal !== null && last.close > trendSmaVal;
  const pctFromSma  = trendSmaVal !== null ? last.close / trendSmaVal - 1 : null;
  const vol         = realisedVolatility(closes);
  return { ticker, momentum, aboveTrend, trendSma: trendSmaVal, pctFromSma, realisedVol: vol, lastClose: last.close, lastDate: last.date };
}

function rawValueMetric(f: Fundamentals): number | null {
  const evEbitdaYield = f.ev_to_ebitda && f.ev_to_ebitda > 0 ? 1 / f.ev_to_ebitda : null;
  const fcfYield      = f.free_cashflow && f.market_cap && f.market_cap > 0
    ? f.free_cashflow / f.market_cap : null;
  const earningsYield = f.trailing_pe && f.trailing_pe > 0 ? 1 / f.trailing_pe : null;
  const primary   = [evEbitdaYield, fcfYield].filter((v): v is number => v !== null);
  const available = primary.length > 0 ? primary : [earningsYield].filter((v): v is number => v !== null);
  if (!available.length) return null;
  return available.reduce((a, b) => a + b, 0) / available.length;
}

function rawQualityMetric(f: Fundamentals): number | null {
  const roe = f.return_on_equity ?? null;
  const ide = f.debt_to_equity !== null ? -f.debt_to_equity : null;
  const available = [roe, ide].filter((v): v is number => v !== null);
  if (!available.length) return null;
  return available.reduce((a, b) => a + b, 0) / available.length;
}

function rawPegMetric(f: Fundamentals): number | null {
  if (!f.peg_ratio || f.peg_ratio <= 0) return null;
  return 1 / f.peg_ratio;
}

export function computeSignals(
  pricesByTicker: Record<string, Bar[]>,
  fundsByTicker: Record<string, Fundamentals> = {}
): Signal[] {
  const rawSignals = Object.entries(pricesByTicker)
    .map(([ticker, bars]) => computeRawSignal(ticker, bars))
    .filter((s): s is NonNullable<ReturnType<typeof computeRawSignal>> => s !== null);
  if (!rawSignals.length) return [];

  const momentums = rawSignals.map((s) => s.momentum);
  const momentumScoreMap = new Map(rawSignals.map((s) => [s.ticker, percentileRank(s.momentum, momentums)]));

  const rawValues: { ticker: string; raw: number }[] = [];
  for (const s of rawSignals) {
    const f = fundsByTicker[s.ticker]; if (!f) continue;
    const raw = rawValueMetric(f); if (raw !== null) rawValues.push({ ticker: s.ticker, raw });
  }
  const valueScoreMap = new Map(rawValues.map((v) => [v.ticker, percentileRank(v.raw, rawValues.map((x) => x.raw))]));

  const rawQualities: { ticker: string; raw: number }[] = [];
  for (const s of rawSignals) {
    const f = fundsByTicker[s.ticker]; if (!f) continue;
    const raw = rawQualityMetric(f); if (raw !== null) rawQualities.push({ ticker: s.ticker, raw });
  }
  const qualityScoreMap = new Map(rawQualities.map((q) => [q.ticker, percentileRank(q.raw, rawQualities.map((x) => x.raw))]));

  const rawPegs: { ticker: string; raw: number }[] = [];
  for (const s of rawSignals) {
    const f = fundsByTicker[s.ticker]; if (!f) continue;
    const raw = rawPegMetric(f); if (raw !== null) rawPegs.push({ ticker: s.ticker, raw });
  }
  const pegScoreMap = new Map(rawPegs.map((p) => [p.ticker, percentileRank(p.raw, rawPegs.map((x) => x.raw))]));

  return rawSignals.map((s) => {
    const momentumScore = momentumScoreMap.get(s.ticker) ?? 0;
    const valueScore    = valueScoreMap.get(s.ticker)    ?? null;
    const qualityScore  = qualityScoreMap.get(s.ticker)  ?? null;
    const pegScore      = pegScoreMap.get(s.ticker)      ?? null;
    const hasV = valueScore !== null, hasQ = qualityScore !== null, hasP = pegScore !== null;

    let compositeScore: number;
    if (hasV && hasQ && hasP) {
      compositeScore = W_MOMENTUM * momentumScore + W_VALUE * valueScore + W_QUALITY * qualityScore + W_PEG * pegScore;
    } else if (hasV && hasQ) {
      const t = W_MOMENTUM + W_VALUE + W_QUALITY;
      compositeScore = (W_MOMENTUM/t)*momentumScore + (W_VALUE/t)*valueScore + (W_QUALITY/t)*qualityScore;
    } else if (hasV) {
      const t = W_MOMENTUM + W_VALUE;
      compositeScore = (W_MOMENTUM/t)*momentumScore + (W_VALUE/t)*valueScore;
    } else {
      compositeScore = momentumScore;
    }

    const dataQuality: Signal['dataQuality'] =
      hasV && hasQ && hasP ? 'full' : hasV || hasQ ? 'partial' : 'price-only';

    return { ...s, momentumScore, valueScore, qualityScore, pegScore, compositeScore, dataQuality, fundamentals: fundsByTicker[s.ticker] };
  });
}

export function computeSignal(ticker: string, bars: Bar[]): Signal | null {
  const raw = computeRawSignal(ticker, bars);
  if (!raw) return null;
  return { ...raw, momentumScore: 0, valueScore: null, qualityScore: null, pegScore: null, compositeScore: 0, dataQuality: 'price-only' };
}

export function computeDeepValueWatchlist(
  signals: Signal[],
  minValueScore = 0.55,
  minQualityScore = 0.45,
): DeepValuePick[] {
  return signals
    .filter((s) => !s.aboveTrend && s.valueScore !== null && s.qualityScore !== null)
    .filter((s) => (s.valueScore ?? 0) >= minValueScore && (s.qualityScore ?? 0) >= minQualityScore)
    .map((s) => {
      const f = s.fundamentals;
      const fcfYield = f?.free_cashflow && f?.market_cap && f.market_cap > 0
        ? f.free_cashflow / f.market_cap : null;
      return {
        ticker: s.ticker, sector: f?.sector ?? null, company_name: f?.company_name ?? null,
        lastClose: s.lastClose, pctFromSma: s.pctFromSma ?? 0,
        valueScore: s.valueScore ?? 0, qualityScore: s.qualityScore ?? 0,
        pegScore: s.pegScore ?? null,
        combinedScore: ((s.valueScore ?? 0) * 0.5 + (s.qualityScore ?? 0) * 0.5),
        ev_to_ebitda: f?.ev_to_ebitda ?? null, fcfYield,
        peg_ratio: f?.peg_ratio ?? null, return_on_equity: f?.return_on_equity ?? null,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

export function rankSignals(
  signals: Signal[], regime: MarketRegime, topFraction = 0.15, maxPerSector = MAX_PER_SECTOR,
): { picks: RankedPick[]; eligibleCount: number; universeCount: number } {
  const eligible = signals.filter((s) => s.aboveTrend);
  const ranked   = [...eligible].sort((a, b) => b.compositeScore - a.compositeScore);

  const sectorCounts: Record<string, number> = {};
  const sectorCapped: Signal[] = [];
  for (const s of ranked) {
    const sector = s.fundamentals?.sector ?? 'Unknown';
    const cap    = sector === 'Unknown' ? maxPerSector * 2 : maxPerSector;
    const count  = sectorCounts[sector] ?? 0;
    if (count < cap) { sectorCapped.push(s); sectorCounts[sector] = count + 1; }
  }

  const n = Math.max(1, Math.round(eligible.length * topFraction));
  const topPicks = sectorCapped.slice(0, n);
  const universeVols = signals.map((s) => s.realisedVol).filter((v): v is number => v !== null);
  const fallbackVol  = medianOf(universeVols);
  const invVols      = topPicks.map((p) => 1 / (p.realisedVol ?? fallbackVol));
  const sumInvVols   = invVols.reduce((a, b) => a + b, 0);
  const equityFraction = 1 - regime.cashAllocation;

  const picks: RankedPick[] = topPicks.map((p, i) => {
    const weight = sumInvVols > 0 ? invVols[i] / sumInvVols : 1 / topPicks.length;
    const effectiveWeight = weight * equityFraction;
    return { ...p, weight, effectiveWeight, weightPct: `${(effectiveWeight * 100).toFixed(1)}%` };
  });

  return { picks, eligibleCount: eligible.length, universeCount: signals.length };
}

export type EquityPoint = { date: string; strategy: number; benchmark: number };

export function backtest(
  pricesByTicker: Record<string, Bar[]>, benchmarkBars: Bar[], topFraction = 0.15
): { equityCurve: EquityPoint[]; stats: ReturnType<typeof computeStats> } {
  const benchByDate = new Map(benchmarkBars.map((b) => [b.date, b.close]));
  const weekEnds: string[] = [];
  let lastWeek = '', prevDate = '';
  for (const b of benchmarkBars) {
    const d = new Date(b.date);
    const week = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`;
    if (week !== lastWeek) { if (lastWeek !== '') weekEnds.push(prevDate); lastWeek = week; }
    prevDate = b.date;
  }
  if (prevDate) weekEnds.push(prevDate);

  const minHistory = TRADING_DAYS_YEAR + SKIP_DAYS;
  const tickers = Object.keys(pricesByTicker);
  const idx: Record<string, Map<string, number>> = {};
  for (const t of tickers) idx[t] = new Map(pricesByTicker[t].map((b) => [b.date, b.close]));

  let strategyEquity = 1, benchEquity = 1;
  const equityCurve: EquityPoint[] = [];
  let holdings: { ticker: string; weight: number }[] = [];
  let entryPrices: Record<string, number> = {};
  let benchEntry: number | null = null;

  for (const asOf of weekEnds) {
    if (holdings.length && benchEntry !== null) {
      const weightedReturn = holdings.reduce((sum, { ticker, weight }) => {
        const px = idx[ticker].get(asOf);
        return sum + weight * (px ? px / entryPrices[ticker] - 1 : 0);
      }, 0);
      const benchPx = benchByDate.get(asOf);
      strategyEquity *= 1 + weightedReturn;
      benchEquity    *= 1 + (benchPx ? benchPx / benchEntry - 1 : 0);
    }

    equityCurve.push({ date: asOf, strategy: strategyEquity, benchmark: benchEquity });

    const benchUpTo = benchmarkBars.filter((b) => b.date <= asOf);
    const regime    = computeMarketRegime(benchUpTo);
    const signals: Signal[] = [];
    for (const t of tickers) {
      const bars = pricesByTicker[t].filter((b) => b.date <= asOf);
      if (bars.length < minHistory) continue;
      const raw = computeRawSignal(t, bars);
      if (!raw) continue;
      signals.push({ ...raw, momentumScore: raw.momentum, valueScore: null, qualityScore: null, pegScore: null, compositeScore: raw.momentum, dataQuality: 'price-only' });
    }

    const { picks } = rankSignals(signals, regime, topFraction);
    const universeVols = signals.map((s) => s.realisedVol).filter((v): v is number => v !== null);
    const fallbackVol  = medianOf(universeVols);
    const invVols      = picks.map((p) => 1 / (p.realisedVol ?? fallbackVol));
    const sumInvVols   = invVols.reduce((a, b) => a + b, 0);
    const equityFraction = 1 - regime.cashAllocation;

    holdings    = picks.map((p, i) => ({ ticker: p.ticker, weight: (sumInvVols > 0 ? invVols[i] / sumInvVols : 1 / picks.length) * equityFraction }));
    entryPrices = Object.fromEntries(picks.map((p) => [p.ticker, p.lastClose]));
    benchEntry  = benchByDate.get(asOf) ?? null;
  }
  return { equityCurve, stats: computeStats(equityCurve) };
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function computeStats(curve: EquityPoint[]) {
  if (curve.length < 2) return { cagrStrategy: 0, cagrBenchmark: 0, maxDrawdownStrategy: 0, weeks: 0 };
  const weeks = curve.length - 1, years = weeks / 52;
  const cagr = (final: number) => Math.pow(final, 1 / Math.max(years, 0.01)) - 1;
  let peak = curve[0].strategy, maxDD = 0;
  for (const p of curve) { peak = Math.max(peak, p.strategy); maxDD = Math.min(maxDD, p.strategy / peak - 1); }
  return { cagrStrategy: cagr(curve[curve.length-1].strategy), cagrBenchmark: cagr(curve[curve.length-1].benchmark), maxDrawdownStrategy: maxDD, weeks };
}
