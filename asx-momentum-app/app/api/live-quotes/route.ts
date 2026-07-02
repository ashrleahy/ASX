import { NextRequest, NextResponse } from "next/server";
import YahooFinanceCtor from "yahoo-finance2";

const yf = new YahooFinanceCtor();
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const tickers = new URL(request.url).searchParams
    .get("tickers")?.split(",").filter(Boolean) ?? [];
  if (!tickers.length) return NextResponse.json([]);

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const q = await yf.quote(ticker) as Record<string, unknown>;
        return {
          ticker,
          price:         (q.regularMarketPrice         as number) ?? null,
          change:        (q.regularMarketChange        as number) ?? null,
          changePercent: (q.regularMarketChangePercent as number) ?? null,
          prevClose:     (q.regularMarketPreviousClose as number) ?? null,
          marketState:   (q.marketState               as string) ?? null,
        };
      } catch {
        return { ticker, price: null, change: null, changePercent: null, prevClose: null, marketState: null };
      }
    })
  );

  return NextResponse.json(results);
}
