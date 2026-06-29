import YahooFinanceCtor from "yahoo-finance2";

const yahooFinance = new YahooFinanceCtor();

export type DailyBar = {
  date: string; // YYYY-MM-DD
  close: number;
};

/**
 * Fetch daily close prices for a single ticker between two dates.
 * Uses yahoo-finance2 (unofficial Yahoo Finance client) - free, no API key.
 */
export async function fetchHistory(
  ticker: string,
  from: Date,
  to: Date = new Date()
): Promise<DailyBar[]> {
  const result = await yahooFinance.chart(ticker, {
    period1: from,
    period2: to,
    interval: "1d",
    return: "array",
  });

  const quotes = result.quotes ?? [];
  return quotes
    .filter((q) => q.close !== null && q.close !== undefined)
    .map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      close: q.close as number,
    }));
}

/** Fetch just the most recent daily bar (used for incremental daily syncs). */
export async function fetchLatest(ticker: string): Promise<DailyBar | null> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7); // small buffer to cover weekends/holidays
  const bars = await fetchHistory(ticker, from, to);
  return bars.length ? bars[bars.length - 1] : null;
}
