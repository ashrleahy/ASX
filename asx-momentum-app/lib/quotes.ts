import YahooFinanceCtor from "yahoo-finance2";

const yf = new YahooFinanceCtor();

export type LiveQuote = {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string | null;
};

export async function fetchLiveQuotes(tickers: string[]): Promise<Map<string, LiveQuote>> {
  const results = new Map<string, LiveQuote>();
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const q = await yf.quote(ticker) as Record<string, unknown>;
        results.set(ticker, {
          ticker,
          price:         (q.regularMarketPrice         as number) ?? null,
          change:        (q.regularMarketChange        as number) ?? null,
          changePercent: (q.regularMarketChangePercent as number) ?? null,
          marketState:   (q.marketState               as string) ?? null,
        });
      } catch {
        results.set(ticker, { ticker, price: null, change: null, changePercent: null, marketState: null });
      }
    })
  );
  return results;
}
