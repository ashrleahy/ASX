import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export type PortfolioSettings = {
  cash_balance: number;
  min_trade_value: number;
  updated_at: string;
};

export async function GET() {
  const rows = await sql`
    SELECT cash_balance, min_trade_value, updated_at
    FROM portfolio_settings WHERE id = 1
  ` as unknown as PortfolioSettings[];
  if (!rows.length) {
    return NextResponse.json({ cash_balance: 0, min_trade_value: 500, updated_at: new Date().toISOString() });
  }
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { cash_balance, min_trade_value } = body;
  const rows = await sql`
    UPDATE portfolio_settings
    SET
      cash_balance    = COALESCE(${cash_balance    ?? null}, cash_balance),
      min_trade_value = COALESCE(${min_trade_value ?? null}, min_trade_value),
      updated_at      = now()
    WHERE id = 1
    RETURNING cash_balance, min_trade_value, updated_at
  ` as unknown as PortfolioSettings[];
  return NextResponse.json(rows[0]);
}
