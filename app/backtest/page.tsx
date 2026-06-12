"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import StatCard from "@/components/StatCard";
import type { BacktestResult } from "@/lib/types";
import type { Candle, SignalMarker, MAPoint } from "@/components/CandleChart";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const SYMBOLS  = ["BTC","ETH","SOL","ARB","AVAX","DOGE","APT"];
const LIMITS   = [200, 365, 500];
const INTERVALS: { label: string; value: string }[] = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];
const fmt = (n: number, d = 2) => n?.toFixed(d) ?? "—";


export default function BacktestPage() {
  const [result,   setResult]   = useState<BacktestResult | null>(null);
  const [candles,  setCandles]  = useState<Candle[]>([]);
  const [symbol,   setSymbol]   = useState("BTC");
  const [interval, setInterval] = useState("1d");
  const [limit,    setLimit]    = useState(365);
  const [loading,  setLoading]  = useState(false);
  const [running,  setRunning]  = useState(false);
  const [runErr,   setRunErr]   = useState<string | null>(null);
  const [tab,      setTab]      = useState<"stats"|"trades">("stats");

  const loadCandles = useCallback(async (sym: string, iv: string, lim: number) => {
    setLoading(true);
    try {
      // fetch 200 extra candles so the 200 MA has warmup and covers the full chart
      const r = await fetch(`/api/candles?symbol=${sym}&interval=${iv}&limit=${lim + 200}&testnet=false`);
      const d = await r.json();
      if (Array.isArray(d)) setCandles(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadCandles(symbol, interval, limit); }, []);
  useEffect(() => { loadCandles(symbol, interval, limit); }, [symbol, interval, limit]);

  async function runBacktest() {
    setRunning(true);
    setRunErr(null);
    try {
      const r = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, limit }),
      });
      const d = await r.json();
      if (d.error) { setRunErr(d.error); }
      else { setResult(d); }
    } catch (e) {
      setRunErr(String(e));
    }
    setRunning(false);
  }

  const markers: SignalMarker[] = result?.signals?.map((s: { timestamp: string; direction: "long"|"short"; type: string; price: number }) => ({
    time:      new Date(s.timestamp).getTime(),
    direction: s.direction,
    type:      s.type,
    price:     s.price,
  })) ?? [];
  const months = result ? Object.entries(result.monthly_returns ?? {}).sort() : [];

  // 200-period SMA from loaded candles
  const ma200: MAPoint[] = [];
  if (candles.length >= 200) {
    for (let i = 199; i < candles.length; i++) {
      const slice = candles.slice(i - 199, i + 1);
      const avg = slice.reduce((s, c) => s + Number(c.c), 0) / 200;
      ma200.push({ time: candles[i].t, value: avg });
    }
  }

  const longs  = result?.trades?.filter((t: { direction: string }) => t.direction === "long").length  ?? 0;
  const shorts = result?.trades?.filter((t: { direction: string }) => t.direction === "short").length ?? 0;

  return (
    <div style={{ padding: 28, maxWidth: 1200 }}>

      {/* ── Header + Run button ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Backtest</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>
            Pick a symbol, hit Run — signals appear on the chart instantly
          </p>
        </div>
        <button
          onClick={runBacktest}
          disabled={running}
          style={{
            padding: "11px 28px", borderRadius: 12, fontSize: 14, fontWeight: 700,
            cursor: running ? "not-allowed" : "pointer",
            background: running ? "var(--dim)" : "var(--blue)",
            color: running ? "var(--muted)" : "#fff",
            border: "none", display: "flex", alignItems: "center", gap: 8,
            boxShadow: running ? "none" : "0 0 20px rgba(59,130,246,.35)",
            transition: "all .15s",
          }}
        >
          {running
            ? <><span style={{ width: 14, height: 14, border: "2px solid var(--muted)", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} /> Running…</>
            : "▶ Run Backtest"
          }
        </button>
      </div>

      {runErr && (
        <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 14, fontSize: 12, color: "#f87171" }}>
          Error: {runErr}
        </div>
      )}

      {/* ── Controls bar ── */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 18, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end" }}>

        {/* Symbol */}
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 7 }}>Symbol</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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

        {/* Chart interval */}
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 7 }}>Chart view</label>
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

        {/* Lookback */}
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", display: "block", marginBottom: 7 }}>Lookback (days)</label>
          <div style={{ display: "flex", gap: 6 }}>
            {LIMITS.map(l => (
              <button key={l} onClick={() => setLimit(l)} style={{
                padding: "6px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                background: limit === l ? "var(--blue)" : "var(--dim)",
                color: limit === l ? "#fff" : "var(--muted)",
                border: `1px solid ${limit === l ? "var(--blue)" : "transparent"}`,
              }}>{l}d</button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
          {[
            { color: "#10b981", label: "Long ▲" },
            { color: "#ef4444", label: "Short ▼" },
            { color: "#3b82f6", label: "TP ●" },
            { color: "#f59e0b", label: "SL ●" },
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
              <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 5, background: "rgba(59,130,246,.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,.2)" }}>
                {markers.filter(m => m.type === "Entry").length} signals
              </span>
            )}
            {result && longs + shorts > 0 && (
              <>
                <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 5, background: "rgba(16,185,129,.1)", color: "#10b981", border: "1px solid rgba(16,185,129,.2)" }}>
                  {longs} long
                </span>
                <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 5, background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.2)" }}>
                  {shorts} short
                </span>
              </>
            )}
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{candles.length} candles · Hyperliquid</span>
        </div>

        {candles.length > 0 ? (
          <CandleChart candles={candles} signals={markers} maLine={ma200} maLabel="200 MA" height={480} />
        ) : (
          <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
            <div style={{ width: 32, height: 32, border: "2px solid var(--blue)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading chart…</p>
          </div>
        )}

        {!running && markers.length === 0 && candles.length > 0 && (
          <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(13,19,33,.9)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 20px", fontSize: 12, color: "var(--muted)", textAlign: "center", backdropFilter: "blur(8px)", whiteSpace: "nowrap" }}>
            Hit <strong style={{ color: "#fff" }}>▶ Run Backtest</strong> to see signals on the chart
          </div>
        )}
      </div>

      {/* ── Results tabs ── */}
      {result && (
        <div className="slide-in">
          <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4, width: "fit-content" }}>
            {(["stats","trades"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
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
                <StatCard label="Total Trades" value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L · ${longs}↑ ${shorts}↓`} />
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
