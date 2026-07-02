export type HoldingRow = {
  id: number;
  ticker: string;
  label: string;
  quantity: number;
  type: string;
  in_universe: boolean;
  momentum: number | null;
  aboveTrend: boolean | null;
  pctFromSma: number | null;
  compositeScore: number | null;
  rec: { action: string; badge: "buy" | "hold" | "out"; reason: string };
};

export default function LivePortfolioTable({ rows: _ }: { rows: HoldingRow[] }) {
  return null;
}
