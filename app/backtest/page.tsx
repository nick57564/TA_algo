"use client";
import { useEffect, useState } from "react";
import EquityChart from "@/components/EquityChart";
import StatCard from "@/components/StatCard";
import type { BacktestResult, Trade, Signal } from "@/lib/types";

const SYMBOLS = ["BTC","ETH","SOL","ARB","AVAX","MATIC","DOGE","APT"];
const LIMITS  = [200, 500, 1000, 2000];
const fmt = (n: number, d = 2) => n?.toFixed(d) ?? "—";

const INDICATORS = [
  { id: "ema50",       label: "50 EMA",          desc: "Trend filter — daily",     color: "blue"   },
  { id: "structure",   label: "Market Structure", desc: "HH/HL · LL/LH state",     color: "purple" },
  { id: "swing",       label: "Swing Detection",  desc: "Color-change method",      color: "yellow" },
  { id: "mtf",         label: "MTF Sync",         desc: "W+D or D+4H alignment",   color: "cyan"   },
  { id: "engulfing",   label: "Engulfing Candle", desc: "1H entry confirmation",    color: "green"  },
  { id: "retest",      label: "Retest Zone",      desc: "Structural level retest",  color: "blue"   },
];

const COLOR_MAP: Record<string, string> = {
  blue: "var(--blue2)", purple: "var(--purple)", yellow: "var(--yellow)",
  cyan: "var(--cyan)", green: "var(--green)", red: "var(--red)",
};

export default function BacktestPage() {
  const [result,  setResult]  = useState<BacktestResult | null>(null);
  const [symbol,  setSymbol]  = useState("BTC");
  const [limit,   setLimit]   = useState(500);
  const [polling, setPolling] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const [activeIndicators, setActiveIndicators] = useState(
    new Set(["ema50","structure","swing","mtf","engulfing","retest"])
  );
  const [tab, setTab] = useState<"stats"|"trades"|"signals">("stats");

  useEffect(() => {
    fetch("/api/backtest").then(r => r.json()).then(d => { if (d) setResult(d); }).catch(() => {});
  }, []);

  function toggleIndicator(id: string) {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function buildCmd() {
    const indicators = [...activeIndicators].join(",");
    return `cd bot && python main.py --mode backtest --symbol ${symbol} --limit ${limit} --indicators ${indicators}`;
  }

  function copy() {
    navigator.clipboard.writeText(buildCmd());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startPolling() {
    setPolling(true);
    let n = 0;
    const id = setInterval(async () => {
      n++;
      const r = await fetch("/api/backtest", { cache: "no-store" }).then(x => x.json()).catch(() => null);
      if (r) { setResult(r); setPolling(false); clearInterval(id); }
      if (n > 90) { setPolling(false); clearInterval(id); }
    }, 2000);
  }

  const months = result ? Object.entries(result.monthly_returns ?? {}).sort() : [];

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Backtest</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Run the structure strategy on historical Hyperliquid data</p>
      </div>

      {/* Config card */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 22, marginBottom: 20 }}>
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Configuration</p>

        {/* Symbol */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 8 }}>Symbol</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SYMBOLS.map(s => (
              <button key={s} onClick={() => setSymbol(s)} style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: symbol === s ? "var(--blue)" : "var(--dim)",
                color: symbol === s ? "#fff" : "var(--muted)",
                border: `1px solid ${symbol === s ? "var(--blue)" : "transparent"}`,
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Candle limit */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 8 }}>
            Candles per timeframe: <span className="num" style={{ color: "var(--blue2)" }}>{limit}</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {LIMITS.map(l => (
              <button key={l} onClick={() => setLimit(l)} style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: limit === l ? "var(--blue)" : "var(--dim)",
                color: limit === l ? "#fff" : "var(--muted)",
                border: `1px solid ${limit === l ? "var(--blue)" : "transparent"}`,
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Indicators toggle */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 8 }}>
            Active Indicators & Signals
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {INDICATORS.map(ind => {
              const on = activeIndicators.has(ind.id);
              const col = COLOR_MAP[ind.color];
              return (
                <button key={ind.id} onClick={() => toggleIndicator(ind.id)} style={{
                  padding: "10px 14px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: on ? `rgba(${ind.color === "blue" ? "59,130,246" : ind.color === "green" ? "16,185,129" : ind.color === "purple" ? "139,92,246" : ind.color === "yellow" ? "245,158,11" : ind.color === "cyan" ? "6,182,212" : "59,130,246"},.1)` : "var(--dim)",
                  border: `1px solid ${on ? col : "var(--border)"}`,
                  opacity: on ? 1 : 0.5,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: on ? col : "var(--border)" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: on ? col : "var(--muted)" }}>{ind.label}</span>
                  </div>
                  <p style={{ fontSize: 10, color: "var(--muted)", paddingLeft: 12 }}>{ind.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Command */}
        <div style={{ background: "#060a12", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <code style={{ flex: 1, fontSize: 12, color: "var(--green)", fontFamily: "monospace" }}>
            <span style={{ color: "var(--muted)" }}>$ </span>{buildCmd()}
          </code>
          <button onClick={copy} style={{
            padding: "5px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: copied ? "var(--green)" : "var(--dim)", color: "#fff", border: "none", flexShrink: 0,
          }}>{copied ? "✓ Copied" : "Copy"}</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={startPolling} disabled={polling} style={{
            padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: polling ? "not-allowed" : "pointer",
            background: polling ? "var(--dim)" : "var(--blue)",
            color: polling ? "var(--muted)" : "#fff", border: "none",
          }}>
            {polling ? "⏳ Watching for results…" : "▶ Watch for results"}
          </button>
          {result && (
            <button onClick={() => { fetch("/api/backtest", { method: "DELETE" }); setResult(null); }} style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 12, cursor: "pointer",
              background: "var(--dim)", color: "var(--muted)", border: "1px solid var(--border)",
            }}>Clear results</button>
          )}
          {polling && <p style={{ fontSize: 12, color: "var(--muted)" }}>Checking every 2s — run the command above to start</p>}
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 24 }}>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          <span style={{ color: "var(--blue2)", fontWeight: 600 }}>How it works: </span>
          The backtest runs on your machine (Python + pandas). Copy the command above, run it in your terminal. Results push automatically to this dashboard via the API. Vercel hosts the UI only.
        </p>
      </div>

      {/* Results */}
      {result ? (
        <div className="slide-in">
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4, width: "fit-content" }}>
            {(["stats","trades","signals"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "7px 18px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: tab === t ? "var(--blue)" : "transparent",
                color: tab === t ? "#fff" : "var(--muted)", border: "none",
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>

          {tab === "stats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Win Rate"       value={`${fmt(result.winrate_pct, 1)}%`}    color={result.winrate_pct >= 50 ? "green" : "red"} glow />
                <StatCard label="Profit Factor"  value={fmt(result.profit_factor)}            color={result.profit_factor >= 1 ? "green" : "red"} />
                <StatCard label="Max Drawdown"   value={`${fmt(result.max_drawdown_pct)}%`}  color={result.max_drawdown_pct > 15 ? "red" : "yellow"} />
                <StatCard label="Net P&L"        value={`$${fmt(result.net_pnl)}`}           color={result.net_pnl >= 0 ? "green" : "red"} glow />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Total Trades"    value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L`} />
                <StatCard label="Avg Win"         value={`$${fmt(result.avg_win)}`}  color="green" />
                <StatCard label="Avg Loss"        value={`$${fmt(result.avg_loss)}`} color="red" />
                <StatCard label="Worst Streak"    value={String(result.largest_losing_streak)} color="yellow" />
              </div>

              {result.equity_curve?.length > 1 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <p style={{ fontWeight: 600 }}>Equity Curve</p>
                    <p className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
                      $10,000 → <span style={{ color: result.final_equity >= 10000 ? "var(--green)" : "var(--red)" }}>${fmt(result.final_equity)}</span>
                    </p>
                  </div>
                  <EquityChart points={result.equity_curve} height={200} />
                </div>
              )}

              {months.length > 0 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                  <p style={{ fontWeight: 600, marginBottom: 14 }}>Monthly Returns</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {months.map(([month, pnl]) => (
                      <div key={month} style={{
                        borderRadius: 10, padding: "10px 8px", textAlign: "center",
                        background: (pnl as number) >= 0 ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)",
                        border: `1px solid ${(pnl as number) >= 0 ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)"}`,
                      }}>
                        <p style={{ fontSize: 9, color: "var(--muted)", marginBottom: 2 }}>{month}</p>
                        <p className="num" style={{ fontSize: 12, fontWeight: 700, color: (pnl as number) >= 0 ? "var(--green)" : "var(--red)" }}>
                          {(pnl as number) >= 0 ? "+" : ""}${fmt(pnl as number, 0)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Long trades", count: result.longs_count,  wr: result.long_winrate_pct,  color: "var(--green)" },
                  { label: "Short trades", count: result.shorts_count, wr: result.short_winrate_pct, color: "var(--red)"   },
                ].map(s => (
                  <div key={s.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{s.label}</p>
                    <p className="num" style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.count}</p>
                    <p className="num" style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>Win rate {s.wr}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "trades" && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--dim)" }}>
                    {["#","Direction","Entry","Exit","Entry Price","Exit Price","P&L","Reason"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades?.length ? result.trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 14px", color: "var(--muted)" }}>{i + 1}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                          background: t.direction === "long" ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)",
                          color: t.direction === "long" ? "var(--green)" : "var(--red)" }}>
                          {t.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="num" style={{ padding: "9px 14px", color: "var(--muted)", fontSize: 11 }}>{new Date(t.entry_time).toLocaleDateString()}</td>
                      <td className="num" style={{ padding: "9px 14px", color: "var(--muted)", fontSize: 11 }}>{new Date(t.exit_time).toLocaleDateString()}</td>
                      <td className="num" style={{ padding: "9px 14px" }}>${t.entry_price.toLocaleString()}</td>
                      <td className="num" style={{ padding: "9px 14px" }}>${t.exit_price?.toLocaleString()}</td>
                      <td className="num" style={{ padding: "9px 14px", color: t.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                        {t.pnl >= 0 ? "+" : ""}${t.pnl?.toFixed(2)}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10,
                          background: t.exit_reason === "tp" ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)",
                          color: t.exit_reason === "tp" ? "var(--green)" : "var(--red)" }}>
                          {t.exit_reason?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No trade data — re-run backtest with --include-trades flag</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "signals" && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--dim)" }}>
                    {["Time","TF","Direction","Type","Price","Retest Level","MTF"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.signals?.length ? result.signals.map((s, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="num" style={{ padding: "9px 14px", color: "var(--muted)", fontSize: 11 }}>{new Date(s.timestamp).toLocaleString()}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, background: "var(--dim)", color: "var(--blue2)", fontWeight: 700 }}>{s.timeframe}</span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 700,
                          background: s.direction === "long" ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)",
                          color: s.direction === "long" ? "var(--green)" : "var(--red)" }}>
                          {s.direction.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "var(--text)" }}>{s.type}</td>
                      <td className="num" style={{ padding: "9px 14px" }}>${s.price?.toLocaleString()}</td>
                      <td className="num" style={{ padding: "9px 14px", color: "var(--muted)" }}>{s.retest_level ? `$${s.retest_level?.toLocaleString()}` : "—"}</td>
                      <td style={{ padding: "9px 14px", color: "var(--muted)", fontSize: 11 }}>{s.mtf_alignment ?? "—"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No signal data — re-run backtest to generate signals</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 28, marginBottom: 10 }}>◈</p>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>No backtest results yet</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Copy the command above and run it on your machine. Results appear here automatically.</p>
        </div>
      )}
    </div>
  );
}
