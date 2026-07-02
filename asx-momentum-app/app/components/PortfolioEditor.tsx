"use client";

import { useState } from "react";

type Row = {
  id: number;
  ticker: string;
  label: string;
  quantity: number;
  type: "asx-stock" | "asx-etf" | "crypto";
  in_universe: boolean;
};

export default function PortfolioEditor({
  initial,
}: {
  initial: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [editing, setEditing] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newType, setNewType] = useState<Row["type"]>("asx-stock");
  const [newInUniverse, setNewInUniverse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEdit(row: Row) {
    setEditing(row.id);
    setEditQty(String(row.quantity));
    setEditLabel(row.label);
  }

  async function saveEdit(id: number) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, quantity: parseFloat(editQty), label: editLabel }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: Row = await res.json();
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: number) {
    if (!confirm("Remove this holding?")) return;
    setSaving(true);
    setError(null);
    try {
      await fetch("/api/portfolio", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function addRow() {
    if (!newTicker || !newQty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: newTicker.toUpperCase(),
          label: newLabel || newTicker.toUpperCase().replace(".AX", "").replace("-AUD", ""),
          quantity: parseFloat(newQty),
          type: newType,
          in_universe: newInUniverse,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const row: Row = await res.json();
      setRows((prev) => [...prev, row]);
      setNewTicker("");
      setNewLabel("");
      setNewQty("");
      setNewType("asx-stock");
      setNewInUniverse(false);
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-title">Edit holdings</p>

      {error && (
        <p style={{ color: "var(--accent-rose)", fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Label</th>
            <th className="num">Quantity</th>
            <th>Type</th>
            <th>In universe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            editing === r.id ? (
              <tr key={r.id}>
                <td style={{ color: "var(--text-dim)" }}>{r.ticker}</td>
                <td>
                  <input
                    className="editor-input"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="editor-input"
                    type="number"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    style={{ textAlign: "right" }}
                  />
                </td>
                <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{r.type}</td>
                <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{r.in_universe ? "Yes" : "No"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={() => saveEdit(r.id)} disabled={saving}>
                    Save
                  </button>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.ticker}</td>
                <td>{r.label}</td>
                <td className="num">{r.quantity}</td>
                <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{r.type}</td>
                <td style={{ color: "var(--text-dim)", fontSize: 12 }}>{r.in_universe ? "Yes" : "No"}</td>
                <td style={{ display: "flex", gap: 8 }}>
                  <button className="btn-ghost" onClick={() => startEdit(r)}>Edit</button>
                  <button className="btn-danger" onClick={() => deleteRow(r.id)}>✕</button>
                </td>
              </tr>
            )
          )}

          {adding && (
            <tr>
              <td>
                <input
                  className="editor-input"
                  placeholder="e.g. BHP.AX"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value)}
                />
              </td>
              <td>
                <input
                  className="editor-input"
                  placeholder="Display name"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </td>
              <td>
                <input
                  className="editor-input"
                  type="number"
                  placeholder="Qty"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  style={{ textAlign: "right" }}
                />
              </td>
              <td>
                <select
                  className="editor-input"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as Row["type"])}
                >
                  <option value="asx-stock">asx-stock</option>
                  <option value="asx-etf">asx-etf</option>
                  <option value="crypto">crypto</option>
                </select>
              </td>
              <td>
                <select
                  className="editor-input"
                  value={newInUniverse ? "yes" : "no"}
                  onChange={(e) => setNewInUniverse(e.target.value === "yes")}
                >
                  <option value="no">No — fetch live</option>
                  <option value="yes">Yes — in signal DB</option>
                </select>
              </td>
              <td style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={addRow}
                  disabled={saving || !newTicker || !newQty}
                >
                  Add
                </button>
                <button className="btn-ghost" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {!adding && (
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
          + Add holding
        </button>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-dim)" }}>
        <strong>In universe</strong>: Yes = ticker is in the signal DB (ASX stocks we sync daily) — faster loads + full composite scoring.
        No = price fetched live from Yahoo Finance on each page load (ETFs, crypto, any other ticker).
      </p>
    </div>
  );
}
