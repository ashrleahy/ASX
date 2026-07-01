import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export type PortfolioRow = {
  id: number;
  ticker: string;
  label: string;
  quantity: number;
  type: "asx-stock" | "asx-etf" | "crypto";
  in_universe: boolean;
};

export async function GET() {
  const rows = await sql`
    SELECT id, ticker, label, quantity, type, in_universe
    FROM portfolio ORDER BY id ASC
  ` as unknown as PortfolioRow[];
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ticker, label, quantity, type, in_universe } = body;
  if (!ticker || !quantity || !type) {
    return NextResponse.json({ error: "ticker, quantity and type are required" }, { status: 400 });
  }
  const rows = await sql`
    INSERT INTO portfolio (ticker, label, quantity, type, in_universe)
    VALUES (${ticker.toUpperCase()}, ${label ?? ticker.toUpperCase()}, ${quantity}, ${type}, ${in_universe ?? false})
    RETURNING id, ticker, label, quantity, type, in_universe
  ` as unknown as PortfolioRow[];
  return NextResponse.json(rows[0]);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, quantity, label } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const rows = await sql`
    UPDATE portfolio
    SET quantity = COALESCE(${quantity ?? null}, quantity),
        label    = COALESCE(${label ?? null}, label)
    WHERE id = ${id}
    RETURNING id, ticker, label, quantity, type, in_universe
  ` as unknown as PortfolioRow[];
  return NextResponse.json(rows[0]);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await sql`DELETE FROM portfolio WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
