"use client";
import { useEffect, useState } from "react";

const ASSETS = [
  { symbol: "BTC",  label: "Bitcoin",   flag: "₿", color: "#f7931a" },
  { symbol: "ETH",  label: "Ethereum",  flag: "Ξ",  color: "#627eea" },
  { symbol: "SOL",  label: "Solana",    flag: "◎",  color: "#9945ff" },
  { symbol: "SPX",  label: "S&P 500",   flag: "📈", color: "#22c55e" },
  { symbol: "GOLD", label: "Gold",      flag: "Au", color: "#eab308" },
];

interface AssetResult {
  symbol: string;
  status: "idle" | "loading" | "done" | "error";
  winrate_pct: number;
  total_trades: number;
  wins: number;
  losses: number;
  net_pnl: number;
  profit_factor: number;
  error?: string;
}

function WinRateRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? "#00c896" : pct >= 60 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.2} fontWeight={800}
        style={{ transform: `rotate(90deg) translate(0, -${size}px)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {pct > 0 ? `${pct}%` : "—"}
      </text>
    </svg>
  );
}

export default function BacktestLoopPage() {
  const [results, setResults] = useState<AssetResult[]>(
    ASSETS.map(a => ({ symbol: a.symbol, status: "idle", winrate_pct: 0, total_trades: 0, wins: 0, losses: 0, net_pnl: 0, profit_factor: 0 }))
  );
  const [running, setRunning] = useState(false);

  const runAll = async () => {
    setRunning(true);
    setResults(ASSETS.map(a => ({ symbol: a.symbol, status: "loading", winrate_pct: 0, total_trades: 0, wins: 0, losses: 0, net_pnl: 0, profit_factor: 0 })));
    await Promise.all(ASSETS.map(async (asset, idx) => {
      try {
        const res = await fetch("/api/backtestloop/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: asset.symbol, limit: 730, interval: "1d" }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResults(prev => prev.map((r, i) => i === idx ? {
          ...r, status: "done",
          winrate_pct: data.winrate_pct ?? 0,
          total_trades: data.total_trades ?? 0,
          wins: data.wins ?? 0,
          losses: data.losses ?? 0,
          net_pnl: data.net_pnl ?? 0,
          profit_factor: data.profit_factor ?? 0,
        } : r));
      } catch (e) {
        setResults(prev => prev.map((r, i) => i === idx ? { ...r, status: "error", error: String(e) } : r));
      }
    }));
    setRunning(false);
  };

  useEffect(() => { runAll(); }, []);

  const allDone = results.every(r => r.status === "done" || r.status === "error");
  const totalWins = results.filter(r => r.status === "done" && r.winrate_pct >= 75).length;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            Optimised Strategy
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
            Loop-validated filters · 2-year daily backtest (730 bars) · All assets
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {allDone && (
            <div style={{
              padding: "8px 18px", borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: totalWins >= 4 ? "rgba(0,200,150,.12)" : "rgba(234,179,8,.12)",
              color: totalWins >= 4 ? "#00c896" : "#eab308",
              border: `1px solid ${totalWins >= 4 ? "rgba(0,200,150,.3)" : "rgba(234,179,8,.3)"}`,
            }}>
              {totalWins}/5 assets ≥ 75% win rate
            </div>
          )}
          <button onClick={runAll} disabled={running} style={{
            padding: "10px 22px", borderRadius: 10, fontSize: 14, fontWeight: 700,
            background: running ? "#e5e7eb" : "var(--teal)", color: running ? "#9ca3af" : "#fff",
            border: "none", cursor: running ? "not-allowed" : "pointer",
          }}>
            {running ? "Running…" : "↺ Re-run All"}
          </button>
        </div>
      </div>

      {/* Improvement callout */}
      <div style={{
        background: "rgba(0,200,150,.06)", border: "1px solid rgba(0,200,150,.2)",
        borderRadius: 12, padding: "14px 20px", marginBottom: 32,
        display: "flex", gap: 32, flexWrap: "wrap",
      }}>
        {[
          { label: "ATR Stop", before: "1.5×", after: "2.0×" },
          { label: "R:R Ratio", before: "2:1", after: "1.5:1" },
          { label: "Dist from MA", before: "10%", after: "8%" },
          { label: "Neckline break", before: "0.5%", after: "1%" },
          { label: "Vol confirmation", before: "1.1×", after: "1.3×" },
          { label: "GOLD/SPX data", before: "broken", after: "stooq + Yahoo" },
        ].map(({ label, before, after }) => (
          <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#ef4444", textDecoration: "line-through" }}>{before}</span>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>→</span>
              <span style={{ fontSize: 13, color: "#00c896", fontWeight: 700 }}>{after}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Asset cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 20 }}>
        {ASSETS.map((asset, idx) => {
          const r = results[idx];
          const isLoading = r.status === "loading";
          const isDone    = r.status === "done";
          const isError   = r.status === "error";
          const wr        = r.winrate_pct;
          const wrColor   = wr >= 75 ? "#00c896" : wr >= 60 ? "#eab308" : "#ef4444";
          const noTrades  = isDone && r.total_trades === 0;

          return (
            <div key={asset.symbol} style={{
              background: "#fff", border: `1px solid ${isDone && wr >= 75 ? "rgba(0,200,150,.3)" : "var(--border)"}`,
              borderRadius: 16, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              boxShadow: isDone && wr >= 75 ? "0 0 0 1px rgba(0,200,150,.15), 0 2px 12px rgba(0,200,150,.08)" : "0 1px 3px rgba(0,0,0,.05)",
              transition: "all 0.3s",
            }}>
              {/* Symbol header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, alignSelf: "flex-start" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: `${asset.color}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800, color: asset.color,
                }}>
                  {asset.flag}
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", margin: 0 }}>{asset.symbol}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{asset.label}</p>
                </div>
              </div>

              {/* Win rate ring */}
              {isLoading && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: "50%",
                    background: "linear-gradient(135deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
                    backgroundSize: "200% 200%",
                    animation: "shimmer 1.5s infinite",
                  }} />
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</p>
                </div>
              )}
              {isDone && !noTrades && <WinRateRing pct={wr} size={90} />}
              {noTrades && (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 28 }}>🚫</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>No signals</p>
                  <p style={{ fontSize: 11, color: "var(--muted)" }}>Filters too strict</p>
                </div>
              )}
              {isError && (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 28 }}>⚠️</p>
                  <p style={{ fontSize: 11, color: "#ef4444" }}>Data error</p>
                </div>
              )}

              {/* Stats */}
              {isDone && !noTrades && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Trades</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                      {r.wins}W / {r.losses}L
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Net P&L</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.net_pnl >= 0 ? "#00c896" : "#ef4444" }}>
                      {r.net_pnl >= 0 ? "+" : ""}${r.net_pnl.toFixed(0)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Prof. Factor</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.profit_factor >= 2 ? "#00c896" : "var(--text)" }}>
                      {r.profit_factor.toFixed(2)}
                    </span>
                  </div>
                  <div style={{
                    textAlign: "center", padding: "6px 10px", borderRadius: 8,
                    background: wr >= 75 ? "rgba(0,200,150,.1)" : wr >= 60 ? "rgba(234,179,8,.1)" : "rgba(239,68,68,.1)",
                    border: `1px solid ${wr >= 75 ? "rgba(0,200,150,.25)" : wr >= 60 ? "rgba(234,179,8,.25)" : "rgba(239,68,68,.25)"}`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: wrColor }}>
                      {wr >= 75 ? "✓ Target met" : wr >= 60 ? "↗ Near target" : "✗ Below target"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary table */}
      {allDone && results.some(r => r.status === "done" && r.total_trades > 0) && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Summary</h2>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {["Asset", "Win Rate", "Trades", "Net P&L", "Prof. Factor", "Status"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASSETS.map((asset, idx) => {
                  const r = results[idx];
                  if (r.status !== "done") return null;
                  const wr = r.winrate_pct;
                  const wrColor = wr >= 75 ? "#00c896" : wr >= 60 ? "#eab308" : "#ef4444";
                  return (
                    <tr key={asset.symbol} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text)" }}>
                        <span style={{ marginRight: 8, color: asset.color }}>{asset.flag}</span>{asset.symbol}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 800, color: wrColor, fontSize: 15 }}>
                        {r.total_trades === 0 ? "—" : `${wr}%`}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text)" }}>
                        {r.total_trades === 0 ? "0" : `${r.wins}W / ${r.losses}L`}
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: r.net_pnl >= 0 ? "#00c896" : "#ef4444" }}>
                        {r.total_trades === 0 ? "—" : `${r.net_pnl >= 0 ? "+" : ""}$${r.net_pnl.toFixed(0)}`}
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text)" }}>
                        {r.total_trades === 0 ? "—" : r.profit_factor.toFixed(2)}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                          background: r.total_trades === 0 ? "#f3f4f6" : wr >= 75 ? "rgba(0,200,150,.1)" : wr >= 60 ? "rgba(234,179,8,.1)" : "rgba(239,68,68,.1)",
                          color: r.total_trades === 0 ? "#9ca3af" : wrColor,
                        }}>
                          {r.total_trades === 0 ? "No trades" : wr >= 75 ? "✓ Target met" : wr >= 60 ? "Near target" : "Below target"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
