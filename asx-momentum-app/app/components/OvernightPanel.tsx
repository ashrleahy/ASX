import type { OvernightView, OvernightQuote } from "@/lib/overnight";

const GROUPS = ["US equities", "Risk & rates", "Commodities", "FX & crypto"] as const;

function fmtPrice(q: OvernightQuote): string {
  if (q.price == null) return "—";
  if (q.symbol === "AUDUSD=X") return q.price.toFixed(4);
  if (q.symbol === "^TNX") return `${q.price.toFixed(2)}%`;
  return q.price.toLocaleString("en-AU", { maximumFractionDigits: q.price < 100 ? 2 : 0 });
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}

// Colour by effect on the ASX, not raw direction (a rising VIX shows red).
function color(q: OvernightQuote): string {
  if (q.changePercent == null || Math.abs(q.changePercent) < 0.05) return "var(--text-dim)";
  const good = q.invert ? q.changePercent < 0 : q.changePercent > 0;
  if (q.weight === 0 && !q.invert) return "var(--text)";
  return good ? "var(--accent-green)" : "var(--accent-rose)";
}

function asOfText(quotes: OvernightQuote[]): string | null {
  const t = quotes.find((q) => q.symbol === "^GSPC")?.asOf;
  if (!t) return null;
  return new Date(t).toLocaleString("en-AU", {
    timeZone: "Australia/Adelaide", weekday: "short", hour: "numeric", minute: "2-digit",
  });
}

export default function OvernightPanel({ view }: { view: OvernightView }) {
  const { quotes, lean, tailwinds, headwinds } = view;
  const toneColor = lean.tone === "up" ? "var(--accent-green)" : lean.tone === "down" ? "var(--accent-rose)" : "var(--text-dim)";
  const asOf = asOfText(quotes);

  return (
    <div className="panel">
      <p className="panel-title">Overnight · what's likely to drive the ASX today</p>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: toneColor }}>{lean.label}</span>
        {lean.score != null && (
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
            weighted offshore move {fmtPct(lean.score)}
          </span>
        )}
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
        Indicative read on the open only — offshore moves explain much of the first hour but say little about where the ASX closes.
        Weighted from S&P 500, S&P futures, US-listed BHP, copper, oil and gold.
        {asOf && <> US close as of {asOf} (Adelaide).</>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 18 }}>
        <div>
          <div className="stat-label" style={{ color: "var(--accent-green)" }}>Tailwinds</div>
          {tailwinds.length ? tailwinds.map((q) => (
            <div key={q.symbol} style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              <strong>{q.label} {fmtPct(q.changePercent)}</strong>
              <span style={{ color: "var(--text-dim)" }}> — {q.note}</span>
            </div>
          )) : <div style={{ fontSize: 13, marginTop: 6, color: "var(--text-dim)" }}>Nothing notable</div>}
        </div>
        <div>
          <div className="stat-label" style={{ color: "var(--accent-rose)" }}>Headwinds</div>
          {headwinds.length ? headwinds.map((q) => (
            <div key={q.symbol} style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              <strong>{q.label} {fmtPct(q.changePercent)}</strong>
              <span style={{ color: "var(--text-dim)" }}> — {q.note}</span>
            </div>
          )) : <div style={{ fontSize: 13, marginTop: 6, color: "var(--text-dim)" }}>Nothing notable</div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="stat-label">{g}</div>
            {quotes.filter((q) => q.group === g).map((q) => (
              <div key={q.symbol} title={q.note} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 6 }}>
                <span>{q.label}</span>
                <span>
                  <span style={{ color: "var(--text-dim)", marginRight: 8 }}>{fmtPrice(q)}</span>
                  <span style={{ color: color(q), display: "inline-block", minWidth: 60, textAlign: "right" }}>{fmtPct(q.changePercent)}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
