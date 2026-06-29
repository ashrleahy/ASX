import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchHistory } from "@/lib/yahoo";
import { TICKERS, BENCHMARK } from "@/lib/universe";

export const maxDuration = 60; // seconds - Pro plan allows up to 300s if you need more

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allTickers = [...TICKERS, BENCHMARK];
  let ok = 0;
  let failed = 0;
  const failedTickers: string[] = [];

  // 30 days back per run is plenty for a daily incremental sync; the first
  // ever run needs a one-off backfill (see /api/backfill).
  const from = new Date();
  from.setDate(from.getDate() - 30);

  for (const ticker of allTickers) {
    try {
      const bars = await fetchHistory(ticker, from);
      if (!bars.length) {
        failed++;
        failedTickers.push(ticker);
        continue;
      }
      for (const bar of bars) {
        await sql`
          INSERT INTO prices (ticker, date, close)
          VALUES (${ticker}, ${bar.date}, ${bar.close})
          ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close
        `;
      }
      ok++;
    } catch (e) {
      failed++;
      failedTickers.push(ticker);
    }
  }

  await sql`
    INSERT INTO sync_log (tickers_ok, tickers_failed, notes)
    VALUES (${ok}, ${failed}, ${failedTickers.join(", ")})
  `;

  return NextResponse.json({ ok, failed, failedTickers });
}
