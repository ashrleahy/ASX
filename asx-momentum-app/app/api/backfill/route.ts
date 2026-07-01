import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchHistory } from "@/lib/yahoo";
import { TICKERS, BENCHMARK } from "@/lib/universe";

export const maxDuration = 300;

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
      const bars = await fetchHistory(ticker, from);
      if (bars.length > 0) {
        const tickers = bars.map(() => ticker);
        const dates = bars.map((b) => b.date);
        const closes = bars.map((b) => b.close);
        await sql`
          INSERT INTO prices (ticker, date, close)
          SELECT * FROM unnest(
            ${tickers}::text[],
            ${dates}::date[],
            ${closes}::float8[]
          )
          ON CONFLICT (ticker, date) DO UPDATE SET close = EXCLUDED.close
        `;
      }
      ok++;
    } catch (e) {
      failed++;
      failedTickers.push(ticker);
    }
  }

  return NextResponse.json({ ok, failed, failedTickers });
}
