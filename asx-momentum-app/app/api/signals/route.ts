import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { TICKERS } from "@/lib/universe";
import { computeSignal, rankSignals, type Bar } from "@/lib/momentum";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = (await sql`
    SELECT ticker, date::text, close FROM prices
    WHERE ticker = ANY(${TICKERS})
    ORDER BY ticker, date ASC
  `) as { ticker: string; date: string; close: number }[];

  const byTicker: Record<string, Bar[]> = {};
  for (const r of rows) {
    (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  }

  const signals = Object.entries(byTicker)
    .map(([ticker, bars]) => computeSignal(ticker, bars))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const { picks, eligibleCount, universeCount } = rankSignals(signals, 0.15);

  return NextResponse.json({
    asOf: signals.length ? signals[0].lastDate : null,
    universeCount,
    eligibleCount,
    picks,
    allSignals: signals.sort((a, b) => b.momentum - a.momentum),
  });
}
