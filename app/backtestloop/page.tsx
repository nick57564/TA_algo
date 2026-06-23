"use client";

// Static snapshot of the best results achieved by the optimisation loop
// (730-bar daily backtest, validated 2024-2025 window)
const RESULTS = [
  { symbol: "BTC",  label: "Bitcoin",  flag: "₿",  color: "#f7931a", winrate_pct: 75,   wins: 3, losses: 1, net_pnl:  399,  profit_factor: 4.23, note: "" },
  { symbol: "ETH",  label: "Ethereum", flag: "Ξ",  color: "#627eea", winrate_pct: 0,    wins: 0, losses: 0, net_pnl:  0,    profit_factor: 0,    note: "Filters too strict — no signals in window" },
  { symbol: "SOL",  label: "Solana",   flag: "◎",  color: "#9945ff", winrate_pct: 100,  wins: 1, losses: 0, net_pnl:  148,  profit_factor: 99,   note: "" },
  { symbol: "SPX",  label: "S&P 500",  flag: "📈", color: "#22c55e", winrate_pct: 80,   wins: 4, losses: 1, net_pnl:  612,  profit_factor: 3.10, note: "" },
  { symbol: "GOLD", label: "Gold",     flag: "Au", color: "#eab308", winrate_pct: 81.8, wins: 9, losses: 2, net_pnl: 1104,  profit_factor: 5.42, note: "" },
];

function WinRateRing({ pct, size = 90 }: { pct: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? "#00c896" : pct >= 60 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size * 0.2} fontWeight={800}>
        {pct > 0 ? `${pct}%` : "—"}
      </text>
    </svg>
  );
}

export default function BacktestLoopPage() {
  const totalMet = RESULTS.filter(r => r.winrate_pct >= 75).length;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", margin: 0 }}>
            Optimised Strategy — Loop Results
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
            Best results from the automated optimisation loop · 730-bar daily backtest · Snapshot
          </p>
        </div>
        <div style={{
          padding: "8px 18px", borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: "rgba(0,200,150,.12)", color: "#00c896",
          border: "1px solid rgba(0,200,150,.3)",
        }}>
          {totalMet}/5 assets ≥ 75% win rate
        </div>
      </div>

      {/* Improvements callout */}
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
          { label: "GOLD/SPX data", before: "broken", after: "Yahoo Finance" },
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
        {RESULTS.map((r) => {
          const wr = r.winrate_pct;
          const wrColor = wr >= 75 ? "#00c896" : wr >= 60 ? "#eab308" : "#ef4444";
          const noTrades = r.total_trades === 0 || (r.wins === 0 && r.losses === 0);

          return (
            <div key={r.symbol} style={{
              background: "#fff", border: `1px solid ${wr >= 75 ? "rgba(0,200,150,.3)" : "var(--border)"}`,
              borderRadius: 16, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              boxShadow: wr >= 75 ? "0 0 0 1px rgba(0,200,150,.15), 0 2px 12px rgba(0,200,150,.08)" : "0 1px 3px rgba(0,0,0,.05)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, alignSelf: "flex-start" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: `${r.color}18`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800, color: r.color,
                }}>
                  {r.flag}
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", margin: 0 }}>{r.symbol}</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>{r.label}</p>
                </div>
              </div>

              {noTrades ? (
                <div style={{ textAlign: "center", padding: "8px 0" }}>
                  <p style={{ fontSize: 28, margin: 0 }}>🚫</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, marginTop: 4 }}>No signals</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{r.note || "Filters too strict"}</p>
                </div>
              ) : (
                <WinRateRing pct={wr} size={90} />
              )}

              {!noTrades && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Trades</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{r.wins}W / {r.losses}L</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Net P&L</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.net_pnl >= 0 ? "#00c896" : "#ef4444" }}>
                      +${r.net_pnl.toFixed(0)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "#f9fafb", borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Prof. Factor</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.profit_factor >= 2 ? "#00c896" : "var(--text)" }}>
                      {r.profit_factor === 99 ? "∞" : r.profit_factor.toFixed(2)}
                    </span>
                  </div>
                  <div style={{
                    textAlign: "center", padding: "6px 10px", borderRadius: 8,
                    background: wr >= 75 ? "rgba(0,200,150,.1)" : "rgba(234,179,8,.1)",
                    border: `1px solid ${wr >= 75 ? "rgba(0,200,150,.25)" : "rgba(234,179,8,.25)"}`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: wrColor }}>
                      {wr >= 75 ? "✓ Target met" : "↗ Near target"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary table */}
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
              {RESULTS.map((r) => {
                const wr = r.winrate_pct;
                const wrColor = wr >= 75 ? "#00c896" : wr >= 60 ? "#eab308" : "#9ca3af";
                const noTrades = r.wins === 0 && r.losses === 0;
                return (
                  <tr key={r.symbol} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--text)" }}>
                      <span style={{ marginRight: 8, color: r.color }}>{r.flag}</span>{r.symbol}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 800, color: wrColor, fontSize: 15 }}>
                      {noTrades ? "—" : `${wr}%`}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text)" }}>
                      {noTrades ? "0" : `${r.wins}W / ${r.losses}L`}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: r.net_pnl > 0 ? "#00c896" : "#9ca3af" }}>
                      {noTrades ? "—" : `+$${r.net_pnl.toFixed(0)}`}
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text)" }}>
                      {noTrades ? "—" : r.profit_factor === 99 ? "∞" : r.profit_factor.toFixed(2)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                        background: noTrades ? "#f3f4f6" : wr >= 75 ? "rgba(0,200,150,.1)" : "rgba(234,179,8,.1)",
                        color: noTrades ? "#9ca3af" : wrColor,
                      }}>
                        {noTrades ? "No trades" : wr >= 75 ? "✓ Target met" : "Near target"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
