import YahooFinanceCtor from "yahoo-finance2";

const yf = new YahooFinanceCtor();

// Overnight / offshore markets that tend to drive the ASX open.
// `weight` feeds the indicative lean (0 = shown for context only).
// `invert` = a rise in this market is a headwind for the ASX.
type MarketDef = {
  symbol: string;
  label: string;
  group: "US equities" | "Risk & rates" | "Commodities" | "FX & crypto";
  weight: number;
  invert?: boolean;
  note: string;
};

export const OVERNIGHT_MARKETS: MarketDef[] = [
  { symbol: "^GSPC",    label: "S&P 500",          group: "US equities",  weight: 0.35, note: "Single biggest influence on the ASX open" },
  { symbol: "ES=F",     label: "S&P 500 futures",  group: "US equities",  weight: 0.15, note: "Trades during Asian hours — the most current read" },
  { symbol: "^IXIC",    label: "Nasdaq",           group: "US equities",  weight: 0,    note: "Tech-heavy; weaker link to the ASX" },
  { symbol: "^DJI",     label: "Dow Jones",        group: "US equities",  weight: 0,    note: "Context only" },
  { symbol: "BHP",      label: "BHP (NYSE)",       group: "US equities",  weight: 0.20, note: "US-listed BHP — proxy for the miners" },
  { symbol: "^VIX",     label: "VIX",              group: "Risk & rates", weight: 0,    invert: true, note: "US fear gauge; rising = risk-off" },
  { symbol: "^TNX",     label: "US 10y yield",     group: "Risk & rates", weight: 0,    invert: true, note: "Rising yields weigh on growth & property names" },
  { symbol: "HG=F",     label: "Copper",           group: "Commodities",  weight: 0.10, note: "Industrial demand signal for miners" },
  { symbol: "CL=F",     label: "WTI crude",        group: "Commodities",  weight: 0.10, note: "Drives energy names (e.g. WDS, STO)" },
  { symbol: "GC=F",     label: "Gold",             group: "Commodities",  weight: 0.05, note: "Drives gold miners (NST, EVN)" },
  { symbol: "AUDUSD=X", label: "AUD/USD",          group: "FX & crypto",  weight: 0,    note: "Higher AUD trims AUD value of international ETF holdings" },
  { symbol: "BTC-USD",  label: "Bitcoin (USD)",    group: "FX & crypto",  weight: 0,    note: "Context only" },
];

export type OvernightQuote = MarketDef & {
  price: number | null;
  changePercent: number | null; // percent units, e.g. -0.85
  asOf: string | null;          // ISO
};

export type Lean = {
  score: number | null;   // weighted % move
  label: string;
  tone: "up" | "down" | "flat";
  coverage: number;       // share of lean weight with data
};

export type OvernightView = {
  quotes: OvernightQuote[];
  lean: Lean;
  tailwinds: OvernightQuote[];
  headwinds: OvernightQuote[];
};

function toIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v * (v < 1e12 ? 1000 : 1)).toISOString();
  if (typeof v === "string") return v;
  return null;
}

export async function fetchOvernight(): Promise<OvernightView> {
  const quotes = await Promise.all(
    OVERNIGHT_MARKETS.map(async (m): Promise<OvernightQuote> => {
      try {
        const q = await yf.quote(m.symbol) as Record<string, unknown>;
        return {
          ...m,
          price:         (q.regularMarketPrice         as number) ?? null,
          changePercent: (q.regularMarketChangePercent as number) ?? null,
          asOf:          toIso(q.regularMarketTime),
        };
      } catch {
        return { ...m, price: null, changePercent: null, asOf: null };
      }
    })
  );

  // Indicative lean: weighted average of the moves that historically lead the ASX open.
  let num = 0, den = 0;
  const totalWeight = OVERNIGHT_MARKETS.reduce((s, m) => s + m.weight, 0);
  for (const q of quotes) {
    if (!q.weight || q.changePercent == null) continue;
    num += q.weight * (q.invert ? -q.changePercent : q.changePercent);
    den += q.weight;
  }
  const score = den > 0 ? num / den : null;
  const coverage = totalWeight > 0 ? den / totalWeight : 0;

  let lean: Lean;
  if (score == null || coverage < 0.5) {
    lean = { score, label: "Not enough data", tone: "flat", coverage };
  } else if (score >= 0.6)  lean = { score, label: "Firmly positive open", tone: "up", coverage };
  else if (score >= 0.2)    lean = { score, label: "Mildly positive open", tone: "up", coverage };
  else if (score > -0.2)    lean = { score, label: "Flat / mixed open",    tone: "flat", coverage };
  else if (score > -0.6)    lean = { score, label: "Mildly negative open", tone: "down", coverage };
  else                      lean = { score, label: "Firmly negative open", tone: "down", coverage };

  // Balanced view: everything with a meaningful move, split by effect on the ASX.
  const effect = (q: OvernightQuote) =>
    q.changePercent == null ? 0 : q.invert ? -q.changePercent : q.changePercent;
  const notable = quotes.filter((q) => q.changePercent != null && Math.abs(q.changePercent) >= 0.25 && q.symbol !== "BTC-USD" && q.symbol !== "AUDUSD=X");
  const tailwinds = notable.filter((q) => effect(q) > 0).sort((a, b) => effect(b) - effect(a));
  const headwinds = notable.filter((q) => effect(q) < 0).sort((a, b) => effect(a) - effect(b));

  return { quotes, lean, tailwinds, headwinds };
}
