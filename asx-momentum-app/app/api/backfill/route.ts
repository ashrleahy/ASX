import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchHistory } from "@/lib/yahoo";
import { TICKERS, BENCHMARK } from "@/lib/universe";

// Run this once manually (visit the URL in your browser, or curl it) right
// after your first deploy, to pull ~10 years of history for every ticker.
// After that, the daily cron job keeps things up to date incrementally.
//
// NOTE: pulling 80+ tickers x 10 years can be slow - this route processes
// tickers in small batches to stay under the function timeout. If it times
// out partway through, just hit the URL again; ON CONFLICT upserts make it
// safe to re-run.

export const maxDuration = 300; // needs Pro plan for >60s; on Hobby, re-run a few times instead

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secretParam = new URL(request.url).searchParams.get("secret");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
    secretParam !== process.env.CRON_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const all = [...TICKERS, BENCHMARK];

  // Optional batching: e.g. /api/backfill?offset=0&limit=15
  // Useful on the Hobby plan where function duration is capped lower than
  // Pro - call this a handful of times to cover the full ticker list.
  const { searchParams } = new URL(request.url);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = parseInt(searchParams.get("limit") ?? `${all.length}`, 10);
  const allTickers = all.slice(offset, offset + limit);

  const from = new Date();
  from.setFullYear(from.getFullYear() - 10);

  let ok = 0;
  let failed = 0;
  const failedTickers: string[] = [];

  for (const ticker of allTickers) {
    try {
      if (bars.length > 0) {
        const values = bars.map(b => `('${ticker}', '${b.date}', ${b.close})`).join(',');
        await sql.query(
          `INSERT INTO prices (ticker, date, close) VALUES ${values}
           ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close`
        );
      }
      ok++;
    } catch (e) {
      failed++;
      failedTickers.push(ticker);
    }
  }

  return NextResponse.json({ ok, failed, failedTickers });
}
