"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

type LiveQuote = {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  marketState: string | null;
};

function fmt(v: number | null, dp = 2): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtChg(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
}

export default function LivePortfolioTable({ rows }: { rows: HoldingRow[] }) {
  const [quotes, setQuotes]           = useState<Record<string, LiveQuote>>({});
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const tickers = rows.map((r) => r.ticker).join(",");

  const fetchQuotes = useCallback(async () => {
    try {
      const res  = await fetch(`/api/live-quotes?tickers=${encodeURIComponent(tickers)}`);
      const data: LiveQuote[] = await res.json();
      setQuotes(Object.fromEntries(data.map((q) => [q.ticker, q])));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch live prices");
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60_000);
    return () => clearInterval(interval);
  }, [fetchQuotes]);

  const liveTotal = rows.reduce((sum, r) => {
    const price = quotes[r.ticker]?.price ?? null;
    return sum + (price != null ? price * r.quantity : 0);
  }, 0);

  const marketState = Object.values(quotes).find((q) => q.marketState)?.marketState ?? null;

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <p className="panel-title" style={{ margin: 0 }}>
          Holdings · live prices
          {marketState && (
            <span style={{
              marginLeft: 10,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: marketState === "REGULAR" ? "rgba(111,174,140,0.2)" : "rgba(139,147,163,0.15)",
              color: marketState === "REGULAR" ? "var(--accent-green)" : "var(--text-dim)",
            }}>
              {marketState === "REGULAR" ? "● LIVE" : marketState === "CLOSED" ? "CLOSED" : marketState}
            </span>
          )}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {liveTotal > 0 && (
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Live value: <strong style={{ color: "var(--text)" }}>{fmt(liveTotal)}</strong>
            </span>
          )}
          {lastUpdated && (
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
              {lastUpdated.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={fetchQuotes} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: "var(--accent-rose)", marginBottom: 12 }}>{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Holding</th>
            <th className="num">Qty</th>
            <th className="num">Live price</th>
            <th className="num">Day change</th>
            <th className="num">Live value</th>
            <th className="num">12-1 return</th>
            <th>Trend</th>
            <th className="num">Composite</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const q      = quotes[r.ticker];
            const price  = q?.price ?? null;
            const chg    = q?.change ?? null;
            const chgPct = q?.changePercent ?? null;
            const value  = price != null ? price * r.quantity : null;
            const isUp   = chg != null && chg > 0;
            const isDown = chg != null && chg < 0;

            return (
              <tr key={r.id}>
                <td>
                  {r.in_universe ? (
                    <Link href={`/stock/${r.ticker.replace(".AX", "")}`} className="ticker-link">{r.label}</Link>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{r.label}</span>
                  )}
                  <span className="company-name"> {r.ticker}</span>
                </td>
                <td className="num" style={{ fontSize: 12 }}>
                  {r.type === "crypto" ? Number(r.quantity).toFixed(8) : r.quantity}
                </td>
                <td className="num">
                  {loading && !price
                    ? <span style={{ color: "var(--text-dim)", fontSize: 12 }}>…</span>
                    : <strong>{fmt(price)}</strong>}
                </td>
                <td className="num">
                  {chg != null && chgPct != null ? (
                    <span style={{ color: isUp ? "var(--accent-green)" : isDown ? "var(--accent-rose)" : "var(--text-dim)" }}>
                      <span style={{ display: "block" }}>{fmtChg(chg)}</span>
                      <span style={{ fontSize: 11 }}>{fmtPct(chgPct)}</span>
                    </span>
                  ) : loading ? <span style={{ color: "var(--text-dim)", fontSize: 12 }}>…</span> : "—"}
                </td>
                <td className="num"><strong>{value != null ? fmt(value) : "—"}</strong></td>
                <td className="num">
                  {r.momentum != null ? (
                    <span style={{ color: r.momentum >= 0 ? "var(--accent-green)" : "var(--accent-rose)" }}>
                      {r.momentum >= 0 ? "+" : ""}{(r.momentum * 100).toFixed(1)}%
                    </span>
                  ) : "—"}
                </td>
                <td>
                  {r.aboveTrend !== null ? (
                    <>
                      <span className={`pill ${r.aboveTrend ? "buy" : "out"}`}>
                        {r.aboveTrend ? "▲ above" : "▼ below"}
                      </span>
                      {r.pctFromSma != null && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-dim)" }}>
                          {r.pctFromSma >= 0 ? "+" : ""}{(r.pctFromSma * 100).toFixed(1)}%
                        </span>
                      )}
                    </>
                  ) : "—"}
                </td>
                <td className="num">
                  {r.compositeScore != null
                    ? <strong>{Math.round(r.compositeScore * 100)}</strong>
                    : <span style={{ color: "var(--text-dim)" }}>—</span>}
                </td>
                <td>
                  <span className={`pill ${r.rec.badge}`} style={{ fontSize: 12, padding: "3px 10px" }}>
                    {r.rec.action}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 10, fontSize: 11, color: "var(--text-dim)" }}>
        Yahoo Finance · 15-min delayed during market hours · auto-refreshes every 60s
      </p>
    </div>
  );
}
