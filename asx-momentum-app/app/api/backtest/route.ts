import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { TICKERS, BENCHMARK } from "@/lib/universe";
import { backtest, type Bar } from "@/lib/momentum";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = (await sql`
    SELECT ticker, date::text, close FROM prices
    WHERE ticker = ANY(${[...TICKERS, BENCHMARK]})
    ORDER BY ticker, date ASC
  `) as { ticker: string; date: string; close: number }[];

  const byTicker: Record<string, Bar[]> = {};
  for (const r of rows) {
    (byTicker[r.ticker] ??= []).push({ date: r.date, close: Number(r.close) });
  }

  const benchmarkBars = byTicker[BENCHMARK] ?? [];
  delete byTicker[BENCHMARK];

  if (!benchmarkBars.length) {
    return NextResponse.json(
      { error: "No benchmark data found - run /api/backfill first." },
      { status: 400 }
    );
  }

  const { equityCurve, stats } = backtest(byTicker, benchmarkBars, 0.15);

  return NextResponse.json({ equityCurve, stats });
}
