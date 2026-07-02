"use client";

import { useState } from "react";

export type TradePick = {
  ticker: string;
  label: string;
  lastClose: number;
  compositeScore: number;
  sector: string | null;
  company_name: string | null;
  weightPct: string;
};

type Suggestion = TradePick & {
  minShares: number;
  minAmount: number;
  affordable: boolean;
  shortfall: number;
  maxAffordableShares: number;
  maxAffordableAmount: number;
};

function computeSuggestions(picks: TradePick[], cash: number, minTrade: number): Suggestion[] {
  return picks.map((p) => {
    const price      = p.lastClose;
    const minShares  = Math.ceil(minTrade / price);
    const minAmount  = minShares * price;
    const affordable = cash >= minAmount;
    const lots                = affordable ? Math.floor(cash / minAmount) : 0;
    const maxAffordableShares = lots * minShares;
    const maxAffordableAmount = maxAffordableShares * price;
    return {
      ...p,
      minShares,
      minAmount,
      affordable,
      shortfall:            affordable ? 0 : minAmount - cash,
      maxAffordableShares,
      maxAffordableAmount,
    };
  });
}

function fmt(v: number) {
  return `$${v.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TradeSuggestions({
  picks,
  initialCash,
  initialMinTrade,
}: {
  picks: TradePick[];
  initialCash: number;
  initialMinTrade: number;
}) {
  const [cash, setCash]         = useState(initialCash);
  const [minTrade, setMinTrade] = useState(initialMinTrade);
  const [editCash, setEditCash] = useState(String(initialCash));
  const [editMin, setEditMin]   = useState(String(initialMinTrade));
  const [saving, setSaving]     = useState(false);
  const [bought, setBought]     = useState<Record<string, number>>({});

  const suggestions = computeSuggestions(picks, cash, minTrade);
  const affordable  = suggestions.filter((s) => s.affordable);
  const cheapest    = [...suggestions].sort((a, b) => a.shortfall - b.shortfall)[0];

  async function saveSettings() {
    setSaving(true);
    try {
      await fetch("/api/portfolio-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cash_balance:    parseFloat(editCash) || 0,
          min_trade_value: parseFloat(editMin)  || 500,
        }),
      });
      setCash(parseFloat(editCash) || 0);
      setMinTrade(parseFloat(editMin) || 500);
    } finally {
      setSaving(false);
    }
  }

  async function markBought(s: Suggestion) {
    const newCash = Math.max(0, cash - s.minAmount);
    setSaving(true);
    try {
      await fetch("/api/portfolio-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cash_balance: newCash }),
      });
      setCash(newCash);
      setEditCash(newCash.toFixed(2));
      setBought((prev) => ({ ...prev, [s.ticker]: (prev[s.ticker] ?? 0) + s.minAmount }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-title">Cash · trade suggestions</p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div className="stat-label">Cash available</div>
          <div className="stat-value positive" style={{ fontSize: 28 }}>{fmt(cash)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div className="stat-label" style={{ marginBottom: 4 }}>Update cash</div>
            <input
              className="editor-input"
              type="number"
              value={editCash}
              onChange={(e) => setEditCash(e.target.value)}
              style={{ width: 120 }}
            />
          </div>
          <div>
            <div className="stat-label" style={{ marginBottom: 4 }}>Min trade ($)</div>
            <input
              className="editor-input"
              type="number"
              value={editMin}
              onChange={(e) => setEditMin(e.target.value)}
              style={{ width: 90 }}
            />
          </div>
          <button className="btn-primary" onClick={saveSettings} disabled={saving}>
            Save
          </button>
        </div>
      </div>

      {affordable.length === 0 ? (
        <div style={{ background: "var(--bg-panel-raised)", border: "1px solid var(--border)", borderRadius: 6, padding: "14px 18px", marginBottom: 20 }}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--text-dim)" }}>
            ⚠ You can&apos;t currently make any suggested trade at the <strong>{fmt(minTrade)}</strong> minimum.
          </p>
          {cheapest && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text)" }}>
              Closest: <strong>{cheapest.label}</strong> — {cheapest.minShares} shares @ {fmt(cheapest.lastClose)} = <strong>{fmt(cheapest.minAmount)}</strong>.
              Top up by <span style={{ color: "var(--accent-gold)" }}><strong>{fmt(cheapest.shortfall)}</strong></span> to make this trade.
            </p>
          )}
        </div>
      ) : (
        <div style={{ background: "rgba(111,174,140,0.08)", border: "1px solid var(--accent-green)", borderRadius: 6, padding: "14px 18px", marginBottom: 20 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--accent-green)" }}>
            ✓ You can make <strong>{affordable.length}</strong> trade{affordable.length > 1 ? "s" : ""} with current cash.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
            Minimum cost of all affordable picks: <strong>{fmt(affordable.reduce((sum, s) => sum + s.minAmount, 0))}</strong> · remaining after: <strong>{fmt(Math.max(0, cash - affordable.reduce((sum, s) => sum + s.minAmount, 0)))}</strong>
          </p>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Sector</th>
            <th className="num">Price</th>
            <th className="num">Signal alloc</th>
            <th className="num">Min shares</th>
            <th className="num">Min cost</th>
            <th className="num">With cash</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => (
            <tr key={s.ticker} style={{ opacity: s.affordable ? 1 : 0.6 }}>
              <td>
                <span style={{ fontWeight: 600, color: s.affordable ? "var(--accent-gold)" : "var(--text)" }}>
                  {s.label}
                </span>
                {s.company_name && <span className="company-name"> {s.company_name}</span>}
                {bought[s.ticker] && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent-green)" }}>
                    ✓ bought {fmt(bought[s.ticker])}
                  </span>
                )}
              </td>
              <td style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.sector ?? "—"}</td>
              <td className="num">{fmt(s.lastClose)}</td>
              <td className="num" style={{ fontSize: 12, color: "var(--text-dim)" }}>{s.weightPct}</td>
              <td className="num">{s.minShares} shares</td>
              <td className="num">
                <strong>{fmt(s.minAmount)}</strong>
                <span style={{ fontSize: 11, color: "var(--text-dim)", display: "block" }}>
                  ({s.minShares} × {fmt(s.lastClose)})
                </span>
              </td>
              <td className="num">
                {s.affordable ? (
                  <span style={{ color: "var(--accent-green)" }}>
                    {s.maxAffordableShares} shares = {fmt(s.maxAffordableAmount)}
                  </span>
                ) : (
                  <span style={{ color: "var(--accent-rose)", fontSize: 12 }}>
                    short {fmt(s.shortfall)}
                  </span>
                )}
              </td>
              <td>
                {s.affordable ? (
                  <button
                    className="btn-primary"
                    style={{ fontSize: 11, padding: "4px 10px" }}
                    onClick={() => markBought(s)}
                    disabled={saving}
                  >
                    Mark bought
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>top up {fmt(s.shortfall)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
        Min cost = fewest whole shares that clears the {fmt(minTrade)} minimum (e.g. a $250 stock needs 2 shares = $500, not $499).
        &quot;With cash&quot; shows the maximum number of those minimum lots you can buy right now.
        &quot;Mark bought&quot; deducts the minimum cost from your cash balance. Not financial advice.
      </p>
    </div>
  );
}
