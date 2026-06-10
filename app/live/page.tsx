"use client";
import { useState } from "react";
import StatCard from "@/components/StatCard";

const GATES = [
  { id: "backtest",  label: "Backtest validated",          desc: "Positive results on 500+ candles" },
  { id: "paper",     label: "3 months paper trading",      desc: "Consistent positive returns across different conditions" },
  { id: "sharpe",    label: "Sharpe ratio > 1.0",          desc: "Risk-adjusted returns are acceptable" },
  { id: "drawdown",  label: "Max drawdown < 15%",          desc: "Portfolio risk is controlled" },
  { id: "strategy",  label: "Strategy fully understood",   desc: "You can explain every entry and exit rule" },
];

export default function LivePage() {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const allChecked = GATES.every(g => checklist[g.id]);

  function toggle(id: string) {
    setChecklist(p => ({ ...p, [id]: !p[id] }));
  }

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "rgba(239,68,68,.12)", color: "var(--red)", border: "1px solid rgba(239,68,68,.2)" }}>LIVE</span>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Live Trading</h1>
      </div>

      {/* Warning banner */}
      <div style={{ background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <p style={{ fontWeight: 700, fontSize: 14, color: "var(--red)", marginBottom: 8 }}>⚠ Real money. Real losses.</p>
        <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
          Live trading uses real USDC on Hyperliquid mainnet. A bug in the strategy, a bad signal, or a black swan event can cause real financial losses.
          Do NOT enable live trading until you have completed at least 3 months of paper trading with consistent positive results.
        </p>
      </div>

      {/* Pre-live checklist */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, marginBottom: 24 }}>
        <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Pre-live checklist</p>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>All gates must be cleared before going live. This is not optional.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {GATES.map(g => {
            const checked = !!checklist[g.id];
            return (
              <button key={g.id} onClick={() => toggle(g.id)} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "12px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                background: checked ? "rgba(16,185,129,.06)" : "var(--dim)",
                border: `1px solid ${checked ? "rgba(16,185,129,.2)" : "var(--border)"}`,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5, border: `2px solid ${checked ? "var(--green)" : "var(--border2)"}`,
                  background: checked ? "var(--green)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {checked && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13, color: checked ? "var(--text)" : "var(--muted)" }}>{g.label}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{g.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live setup — only visible when all checked */}
      {allChecked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 14, padding: 20 }}>
            <p style={{ fontWeight: 600, color: "var(--green)", marginBottom: 8 }}>✓ All gates cleared — you can go live</p>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>Start with small position sizes ($100–500 max per trade) and scale up only after 1+ month of profitable live trading.</p>

            <div style={{ background: "#060a12", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", marginBottom: 12 }}>
              <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Start live bot</p>
              <code style={{ fontSize: 13, color: "var(--green)", fontFamily: "monospace" }}>
                <span style={{ color: "var(--muted)" }}>$ </span>cd bot && python main.py --mode live
              </code>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)" }}>
              Make sure <code style={{ color: "var(--text)" }}>HYPERLIQUID_TESTNET=False</code> is set in config.py and your mainnet wallet keys are configured.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontWeight: 600, marginBottom: 12 }}>Mainnet setup</p>
              {[
                ["Exchange",   "Hyperliquid mainnet"],
                ["API URL",    "api.hyperliquid.xyz"],
                ["Auth",       "Wallet private key"],
                ["Leverage",   "5x cross-margin"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{k}</span>
                  <span className="num" style={{ fontSize: 12, color: "var(--text)" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 18 }}>
              <p style={{ fontWeight: 600, marginBottom: 12 }}>Risk controls</p>
              {[
                ["Risk per trade",  "1% of balance"],
                ["Stop loss",       "Structural level"],
                ["Take profit",     "3% from entry"],
                ["Max positions",   "1 at a time"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{k}</span>
                  <span className="num" style={{ fontSize: 12, color: "var(--text)" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 32, textAlign: "center" }}>
          <p style={{ fontSize: 24, marginBottom: 10 }}>🔒</p>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>Live trading is locked</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            {GATES.filter(g => !checklist[g.id]).length} of {GATES.length} gates remaining. Complete them above to unlock.
          </p>
        </div>
      )}
    </div>
  );
}
