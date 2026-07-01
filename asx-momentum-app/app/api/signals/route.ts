import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { TICKERS } from "@/lib/universe";
import { computeSignals, rankSignals, type Bar, type Fundamentals } from "@/lib/momentum";

export const dynamic = "force-dynamic";

export async function GET() {
  const [priceRows, fundRows] = await Promise.all([
    sql`SELECT ticker, date::text, close FROM prices
        WHERE ticker = ANY(${TICKERS})
        ORDER BY ticker, date ASC` as unknown as Promise<{ ticker: string; date: string; close: number }[]>,
    sql`SELECT * FROM fundamentals WHERE ticker = ANY(${TICKERS})` as unknown as Promise<Fundamentals[]>,
  ]);

  const byTicker: Record<string, Bar[]> = {};
  for (const r of priceRows) {
    (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  }

  const fundsByTicker: Record<string, Fundamentals> = {};
  for (const f of fundRows) fundsByTicker[f.ticker] = f;

  const signals = computeSignals(byTicker, fundsByTicker);
  const { picks, eligibleCount, universeCount } = rankSignals(signals, 0.15);

  return NextResponse.json({
    asOf: signals.length ? signals[0].lastDate : null,
    universeCount,
    eligibleCount,
    picks,
    allSignals: signals.sort((a, b) => b.compositeScore - a.compositeScore),
  });
}
