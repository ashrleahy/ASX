import YahooFinanceCtor from "yahoo-finance2";

const yf = new YahooFinanceCtor();

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

function n(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function fetchFundamentals(ticker: string): Promise<Fundamentals> {
  const summary = await yf.quoteSummary(ticker, {
    modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "assetProfile", "price"],
  }) as Record<string, Record<string, unknown>>;

  const sd = (summary.summaryDetail       ?? {}) as Record<string, unknown>;
  const fd = (summary.financialData       ?? {}) as Record<string, unknown>;
  const ks = (summary.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const ap = (summary.assetProfile        ?? {}) as Record<string, unknown>;
  const pr = (summary.price               ?? {}) as Record<string, unknown>;

  const marketCap    = n(pr.marketCap);
  const freeCashflow = n(fd.freeCashflow);

  return {
    ticker,
    trailing_pe:         n(sd.trailingPE),
    forward_pe:          n(sd.forwardPE),
    price_to_book:       n(ks.priceToBook),
    ev_to_ebitda:        n(ks.enterpriseToEbitda),
    free_cashflow:       freeCashflow,
    peg_ratio:           n(ks.pegRatio),
    earnings_growth:     n(fd.earningsGrowth),
    return_on_equity:    n(fd.returnOnEquity),
    debt_to_equity:      n(fd.debtToEquity),
    current_ratio:       n(fd.currentRatio),
    gross_margins:       n(fd.grossMargins),
    operating_margins:   n(fd.operatingMargins),
    market_cap:          marketCap,
    beta:                n(ks.beta),
    dividend_yield:      n(sd.dividendYield),
    fifty_two_week_high: n(sd.fiftyTwoWeekHigh),
    fifty_two_week_low:  n(sd.fiftyTwoWeekLow),
    sector:              s(ap.sector),
    industry:            s(ap.industry),
    company_name:        s(pr.longName) ?? s(pr.shortName),
    description:         s(ap.longBusinessSummary),
  };
}
