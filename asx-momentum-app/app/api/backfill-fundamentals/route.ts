import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchFundamentals } from "@/lib/fundamentals";
import { TICKERS } from "@/lib/universe";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

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

  const { searchParams } = new URL(request.url);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit  = parseInt(searchParams.get("limit")  ?? `${TICKERS.length}`, 10);
  const batch  = TICKERS.slice(offset, offset + limit);

  let ok = 0;
  let failed = 0;
  const failedTickers: string[] = [];

  for (const ticker of batch) {
    try {
      const f = await fetchFundamentals(ticker);
      await sql`
        INSERT INTO fundamentals (
          ticker, updated_at,
          trailing_pe, forward_pe, price_to_book,
          ev_to_ebitda, free_cashflow, peg_ratio, earnings_growth,
          return_on_equity, debt_to_equity, current_ratio,
          gross_margins, operating_margins,
          market_cap, beta, dividend_yield,
          fifty_two_week_high, fifty_two_week_low,
          sector, industry, company_name, description
        ) VALUES (
          ${f.ticker}, now(),
          ${f.trailing_pe}, ${f.forward_pe}, ${f.price_to_book},
          ${f.ev_to_ebitda}, ${f.free_cashflow}, ${f.peg_ratio}, ${f.earnings_growth},
          ${f.return_on_equity}, ${f.debt_to_equity}, ${f.current_ratio},
          ${f.gross_margins}, ${f.operating_margins},
          ${f.market_cap}, ${f.beta}, ${f.dividend_yield},
          ${f.fifty_two_week_high}, ${f.fifty_two_week_low},
          ${f.sector}, ${f.industry}, ${f.company_name}, ${f.description}
        )
        ON CONFLICT (ticker) DO UPDATE SET
          updated_at        = now(),
          trailing_pe       = EXCLUDED.trailing_pe,
          forward_pe        = EXCLUDED.forward_pe,
          price_to_book     = EXCLUDED.price_to_book,
          ev_to_ebitda      = EXCLUDED.ev_to_ebitda,
          free_cashflow     = EXCLUDED.free_cashflow,
          peg_ratio         = EXCLUDED.peg_ratio,
          earnings_growth   = EXCLUDED.earnings_growth,
          return_on_equity  = EXCLUDED.return_on_equity,
          debt_to_equity    = EXCLUDED.debt_to_equity,
          current_ratio     = EXCLUDED.current_ratio,
          gross_margins     = EXCLUDED.gross_margins,
          operating_margins = EXCLUDED.operating_margins,
          market_cap        = EXCLUDED.market_cap,
          beta              = EXCLUDED.beta,
          dividend_yield    = EXCLUDED.dividend_yield,
          fifty_two_week_high = EXCLUDED.fifty_two_week_high,
          fifty_two_week_low  = EXCLUDED.fifty_two_week_low,
          sector            = EXCLUDED.sector,
          industry          = EXCLUDED.industry,
          company_name      = EXCLUDED.company_name,
          description       = EXCLUDED.description
      `;
      ok++;
    } catch (e) {
      failed++;
      failedTickers.push(ticker);
    }
  }

  return NextResponse.json({ ok, failed, failedTickers });
}
