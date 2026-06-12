"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import StatCard from "@/components/StatCard";
import type { BacktestResult } from "@/lib/types";
import type { Candle, SignalMarker } from "@/components/CandleChart";

// SSR-safe — lightweight-charts uses window
const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const SYMBOLS  = ["BTC","ETH","SOL","ARB","AVAX","DOGE","APT"];
const LIMITS   = [200, 365, 500, 1000];
const INTERVALS: { label: string; value: string }[] = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];
const fmt = (n: number, d = 2) => n?.toFixed(d) ?? "—";

const INDICATORS = [
  { id: "ema50",     label: "50 EMA",           desc: "Trend filter — daily",    color: "#3b82f6" },
  { id: "structure", label: "Market Structure",  desc: "HH/HL · LL/LH state",    color: "#8b5cf6" },
  { id: "swing",     label: "Swing Detection",   desc: "Color-change method",     color: "#f59e0b" },
  { id: "mtf",       label: "MTF Sync",          desc: "W+D or D+4H alignment",  color: "#06b6d4" },
  { id: "engulfing", label: "Engulfing Candle",  desc: "1H entry confirmation",   color: "#10b981" },
  { id: "retest",    label: "Retest Zone",       desc: "Structural level retest", color: "#3b82f6" },
];

export default function BacktestPage() {
  const [result,   setResult]   = useState<BacktestResult | null>(null);
  const [candles,  setCandles]  = useState<Candle[]>([]);
  const [symbol,   setSymbol]   = useState("BTC");
  const [interval, setInterval] = useState("1d");
  const [limit,    setLimit]    = useState(365);
  const [polling,  setPolling]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [tab,      setTab]      = useState<"chart"|"stats"|"trades">("chart");
  const [activeInd, setActiveInd] = useState(
    new Set(["ema50","structure","swing","mtf","engulfing","retest"])
  );

  // Load candles from Hyperliquid
  const loadCandles = useCallback(async (sym: string, iv: string, lim: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/candles?symbol=${sym}&interval=${iv}&limit=${lim}&testnet=false`);
      const d = await r.json();
      if (Array.isArray(d)) setCandles(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadCandles(symbol, interval, limit);
    fetch("/api/backtest").then(r => r.json()).then(d => { if (d) setResult(d); }).catch(() => {});
  }, []);

  // Reload chart when symbol/interval/limit changes
  useEffect(() => {
    loadCandles(symbol, interval, limit);
  }, [symbol, interval, limit, loadCandles]);

  function toggleInd(id: string) {
    setActiveInd(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function buildCmd() {
    return `cd bot && python main.py --mode backtest --symbol ${symbol} --limit ${limit}`;
  }

  function copy() {
    navigator.clipboard.writeText(buildCmd());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startPolling() {
    setPolling(true);
    let n = 0;
    const id = window.setInterval(async () => {
      n++;
      const r = await fetch("/api/backtest", { cache: "no-store" }).then(x => x.json()).catch(() => null);
      if (r) { setResult(r); setPolling(false); window.clearInterval(id); }
      if (n > 90) { setPolling(false); window.clearInterval(id); }
    }, 2000);
  }

  // Convert backtest result signals → chart markers
  const chartSignals: SignalMarker[] = result?.signals?.map(s => ({
    time:      new Date(s.timestamp).getTime(),
    direction: s.direction,
    type:      s.type,
    price:     s.price,
  })) ?? [];

  // Also add entry/exit from trades if no dedicated signals
  const tradeMarkers: SignalMarker[] = (!result?.signals?.length && result?.trades)
    ? result.trades.flatMap(t => [
        { time: new Date(t.entry_time).getTime(), direction: t.direction, type: "Entry", price: t.entry_price },
        { time: new Date(t.exit_time).getTime(),  direction: t.direction, type: t.exit_reason === "tp" ? "Exit TP" : "Exit SL", price: t.exit_price },
      ])
    : [];

  const markers = chartSignals.length ? chartSignals : tradeMarkers;
  const months  = result ? Object.entries(result.monthly_returns ?? {}).sort() : [];

  return (
    <div style={{ padding: 28, maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Backtest</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>
          Signals plotted on the real price chart — see exactly where the bot fires
        </p>
      </div>

      {/* ── Controls bar ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>

        {/* Symbol */}
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 7 }}>Symbol</label>
          <div style={{ display: "flex", gap: 6 }}>
            {SYMBOLS.map(s => (
              <button key={s} onClick={() => setSymbol(s)} style={{
                padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: symbol === s ? "var(--blue)" : "var(--dim)",
                color: symbol === s ? "#fff" : "var(--muted)",
                border: `1px solid ${symbol === s ? "var(--blue)" : "transparent"}`,
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Interval */}
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 7 }}>Chart interval</label>
          <div style={{ display: "flex", gap: 6 }}>
            {INTERVALS.map(iv => (
              <button key={iv.value} onClick={() => setInterval(iv.value)} style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: interval === iv.value ? "var(--blue)" : "var(--dim)",
                color: interval === iv.value ? "#fff" : "var(--muted)",
                border: `1px solid ${interval === iv.value ? "var(--blue)" : "transparent"}`,
              }}>{iv.label}</button>
            ))}
          </div>
        </div>

        {/* Candle count */}
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 7 }}>Candles</label>
          <div style={{ display: "flex", gap: 6 }}>
            {LIMITS.map(l => (
              <button key={l} onClick={() => setLimit(l)} style={{
                padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: limit === l ? "var(--blue)" : "var(--dim)",
                color: limit === l ? "#fff" : "var(--muted)",
                border: `1px solid ${limit === l ? "var(--blue)" : "transparent"}`,
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
          {[
            { color: "#10b981", label: "Long entry ▲" },
            { color: "#ef4444", label: "Short entry ▼" },
            { color: "#3b82f6", label: "Take profit ●" },
            { color: "#f59e0b", label: "Stop loss ●"  },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
              <span style={{ fontSize: 10, color: "var(--muted)" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Candlestick chart ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 16, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ fontWeight: 600, fontSize: 14 }}>{symbol}-USDC · {interval.toUpperCase()}</p>
            {loading && <span style={{ fontSize: 11, color: "var(--muted)" }}>Loading…</span>}
            {markers.length > 0 && (
              <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 5, background: "rgba(59,130,246,.1)", color: "var(--blue2)", border: "1px solid rgba(59,130,246,.2)" }}>
                {markers.filter(m => m.type === "Entry").length} signals found
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {candles.length} candles · Hyperliquid
          </span>
        </div>

        {candles.length > 0 ? (
          <CandleChart candles={candles} signals={markers} height={480} />
        ) : (
          <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <div style={{ width: 32, height: 32, border: "2px solid var(--blue)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading chart…</p>
          </div>
        )}

        {markers.length === 0 && candles.length > 0 && (
          <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(13,19,33,.9)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 20px", fontSize: 12, color: "var(--muted)", textAlign: "center", backdropFilter: "blur(8px)" }}>
            No signals yet — run the backtest command below and they'll appear on the chart
          </div>
        )}
      </div>

      {/* ── Indicator toggles ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Active indicators & signals</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          {INDICATORS.map(ind => {
            const on = activeInd.has(ind.id);
            return (
              <button key={ind.id} onClick={() => toggleInd(ind.id)} style={{
                padding: "10px 12px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                background: on ? `${ind.color}18` : "var(--dim)",
                border: `1px solid ${on ? ind.color + "55" : "var(--border)"}`,
                opacity: on ? 1 : 0.45,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: on ? ind.color : "var(--border)" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: on ? ind.color : "var(--muted)" }}>{ind.label}</span>
                </div>
                <p style={{ fontSize: 9, color: "var(--muted)", paddingLeft: 12 }}>{ind.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Run command ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Run backtest on your machine</p>
        <div style={{ background: "#060a12", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <code style={{ flex: 1, fontSize: 12, color: "var(--green)", fontFamily: "monospace" }}>
            <span style={{ color: "var(--muted)" }}>$ </span>{buildCmd()}
          </code>
          <button onClick={copy} style={{
            padding: "5px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: copied ? "var(--green)" : "var(--dim)", color: "#fff", border: "none",
          }}>{copied ? "✓" : "Copy"}</button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={startPolling} disabled={polling} style={{
            padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            cursor: polling ? "not-allowed" : "pointer",
            background: polling ? "var(--dim)" : "var(--blue)",
            color: polling ? "var(--muted)" : "#fff", border: "none",
          }}>
            {polling ? "⏳ Waiting for results…" : "▶ Watch for results"}
          </button>
          {result && (
            <button onClick={() => { fetch("/api/backtest", { method: "DELETE" }); setResult(null); }} style={{
              padding: "9px 16px", borderRadius: 10, fontSize: 12, cursor: "pointer",
              background: "var(--dim)", color: "var(--muted)", border: "1px solid var(--border)",
            }}>Clear</button>
          )}
          {polling && <p style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center" }}>Checking every 2s…</p>}
        </div>
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
          Results and signals push to this dashboard automatically. Signals will appear on the chart above.
        </p>
      </div>

      {/* ── Results tabs ── */}
      {result && (
        <div className="slide-in">
          <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4, width: "fit-content" }}>
            {(["stats","trades"] as const).map(t => (
              <button key={t} onClick={() => setTab(t as "stats"|"trades")} style={{
                padding: "7px 18px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: tab === t ? "var(--blue)" : "transparent",
                color: tab === t ? "#fff" : "var(--muted)", border: "none",
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>

          {tab === "stats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Win Rate"      value={`${fmt(result.winrate_pct, 1)}%`}   color={result.winrate_pct >= 50 ? "green" : "red"} glow />
                <StatCard label="Profit Factor" value={fmt(result.profit_factor)}           color={result.profit_factor >= 1 ? "green" : "red"} />
                <StatCard label="Max Drawdown"  value={`${fmt(result.max_drawdown_pct)}%`} color={result.max_drawdown_pct > 15 ? "red" : "yellow"} />
                <StatCard label="Net P&L"       value={`$${fmt(result.net_pnl)}`}          color={result.net_pnl >= 0 ? "green" : "red"} glow />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Total Trades" value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L`} />
                <StatCard label="Avg Win"      value={`$${fmt(result.avg_win)}`}  color="green" />
                <StatCard label="Avg Loss"     value={`$${fmt(result.avg_loss)}`} color="red" />
                <StatCard label="Worst Streak" value={String(result.largest_losing_streak)} color="yellow" />
              </div>
              {months.length > 0 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
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
            </div>
          )}

          {tab === "trades" && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--dim)" }}>
                    {["#","Dir","Entry date","Exit date","Entry $","Exit $","P&L","Reason"].map(h => (
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
                      <td className="num" style={{ padding: "9px 14px" }}>${t.entry_price?.toLocaleString()}</td>
                      <td className="num" style={{ padding: "9px 14px" }}>${t.exit_price?.toLocaleString()}</td>
                      <td className="num" style={{ padding: "9px 14px", fontWeight: 600, color: t.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
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
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Run backtest to see individual trades here</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
