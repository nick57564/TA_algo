"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import StatCard from "@/components/StatCard";
import type { BacktestResult } from "@/lib/types";
import type { Candle, SignalMarker, MAPoint, HighlightTrade, TradeRange } from "@/components/CandleChart";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const SYMBOLS  = ["BTC","ETH","SOL","ARB","AVAX","DOGE","APT"];
const LIMITS   = [200, 365, 500];
const INTERVALS: { label: string; value: string }[] = [
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];
const fmt = (n: number, d = 2) => n?.toFixed(d) ?? "—";

/* ── Pill button ─────────────────────────────────────────────────── */
function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
      cursor: "pointer", transition: "all .15s",
      background: active
        ? "linear-gradient(135deg, #3b82f6, #6366f1)"
        : "rgba(255,255,255,0.05)",
      color: active ? "#fff" : "var(--muted)",
      border: active ? "1px solid rgba(99,102,241,.4)" : "1px solid rgba(255,255,255,0.06)",
      boxShadow: active ? "0 0 16px rgba(99,102,241,.35), inset 0 1px 0 rgba(255,255,255,.15)" : "none",
    }}>{children}</button>
  );
}

/* ── Trades table ────────────────────────────────────────────────── */
function TradesTable({ trades, selectedIdx, onSelect }: {
  trades: import("@/lib/types").Trade[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  useEffect(() => {
    if (selectedIdx == null) return;
    rowRefs.current[selectedIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedIdx]);

  if (!trades.length)
    return (
      <div style={{
        padding: 48, textAlign: "center", color: "var(--muted)",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border)", borderRadius: 20,
        backdropFilter: "blur(20px)",
      }}>
        <p style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>📊</p>
        <p style={{ fontSize: 13 }}>Run backtest to see individual trades</p>
      </div>
    );

  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: "1px solid var(--border)",
      borderRadius: 20, overflow: "hidden",
      backdropFilter: "blur(20px)",
      boxShadow: "0 8px 40px rgba(0,0,0,.4)",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.03)",
          }}>
            {["","#","Dir","Entry","Exit","Entry $","Exit $","P&L","Result","Trigger"].map(h => (
              <th key={h} style={{
                padding: "12px 14px", textAlign: "left",
                color: "var(--muted)", fontWeight: 700, fontSize: 10,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const win      = t.pnl > 0;
            const selected = selectedIdx === i;
            const open     = selected;
            return (
              <>
                <tr
                  key={i}
                  ref={el => { rowRefs.current[i] = el; }}
                  onClick={() => onSelect(selected ? null : i)}
                  className={selected ? "trade-row-glow" : undefined}
                  style={{
                    borderBottom: open ? "none" : "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer", transition: "background .12s",
                    background: selected
                      ? "rgba(239,68,68,.12)"
                      : "transparent",
                    outline: selected ? "1px solid rgba(239,68,68,.6)" : "none",
                    outlineOffset: selected ? -1 : 0,
                    boxShadow: selected
                      ? "0 0 20px rgba(239,68,68,.4), inset 0 0 16px rgba(239,68,68,.1)"
                      : "none",
                    position: "relative",
                  }}>
                  <td style={{ padding: "10px 8px 10px 16px", color: "var(--muted)", fontSize: 10 }}>
                    <span style={{ opacity: 0.5 }}>{open ? "▼" : "▶"}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                      background: t.direction === "long"
                        ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)",
                      color: t.direction === "long" ? "var(--green2)" : "var(--red2)",
                      border: `1px solid ${t.direction === "long" ? "rgba(16,185,129,.3)" : "rgba(239,68,68,.3)"}`,
                      letterSpacing: "0.06em",
                    }}>{t.direction.toUpperCase()}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 11 }}>
                    {new Date(t.entry_time).toLocaleDateString()}
                    <span style={{ opacity: 0.5 }}> {new Date(t.entry_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 11 }}>
                    {new Date(t.exit_time).toLocaleDateString()}
                    <span style={{ opacity: 0.5 }}> {new Date(t.exit_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>${t.entry_price?.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>${t.exit_price?.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 800, color: win ? "var(--green2)" : "var(--red2)", fontSize: 13 }}>
                    {win ? "+" : ""}${t.pnl?.toFixed(2)}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.04em",
                      background: win
                        ? "rgba(16,185,129,.15)"
                        : t.exit_reason === "eod" ? "rgba(100,116,139,.12)"
                        : t.exit_reason === "be"  ? "rgba(99,102,241,.15)"
                        : "rgba(239,68,68,.15)",
                      color: win
                        ? "var(--green2)"
                        : t.exit_reason === "eod" ? "var(--muted)"
                        : t.exit_reason === "be"  ? "var(--purple2)"
                        : "var(--red2)",
                      border: `1px solid ${win
                        ? "rgba(16,185,129,.3)"
                        : t.exit_reason === "eod" ? "rgba(100,116,139,.2)"
                        : t.exit_reason === "be"  ? "rgba(99,102,241,.3)"
                        : "rgba(239,68,68,.3)"}`,
                    }}>
                      {t.exit_reason === "be" ? "BE" : t.exit_reason?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{
                    padding: "10px 8px", fontSize: 11, color: "var(--muted)",
                    maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{t.entry_reason}</td>
                </tr>
                {open && (
                  <tr key={`${i}-analysis`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td colSpan={10} style={{ padding: "0 16px 16px 44px" }}>
                      <div style={{
                        background: win ? "rgba(16,185,129,.06)" : "rgba(239,68,68,.06)",
                        border: `1px solid ${win ? "rgba(16,185,129,.18)" : "rgba(239,68,68,.18)"}`,
                        borderRadius: 14, padding: "14px 18px",
                        backdropFilter: "blur(10px)",
                      }}>
                        <p style={{
                          fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: win ? "var(--green2)" : "var(--red2)",
                          marginBottom: 8,
                        }}>{win ? "✓ Why it worked" : "✗ Why it failed"}</p>
                        <p style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{t.analysis ?? "—"}</p>
                        <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                          {[
                            `SL @ $${t.sl_price?.toFixed(0)}`,
                            `TP @ $${t.tp_price?.toFixed(0)}`,
                            `Duration: ${Math.round((new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / 3_600_000)}h`,
                          ].map(s => (
                            <span key={s} style={{
                              fontSize: 10, color: "var(--muted)",
                              padding: "2px 10px", borderRadius: 999,
                              background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.07)",
                            }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */
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
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);
  const [highlightTrade,   setHighlightTrade]   = useState<HighlightTrade | null>(null);

  const loadCandles = useCallback(async (sym: string, iv: string, lim: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/candles?symbol=${sym}&interval=${iv}&limit=${lim + 200}&testnet=false`);
      const d = await r.json();
      if (Array.isArray(d)) setCandles(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadCandles(symbol, interval, limit); }, []);
  useEffect(() => {
    loadCandles(symbol, interval, limit);
    setResult(null); setRunErr(null);
  }, [symbol, interval, limit]);

  async function runBacktest() {
    setRunning(true); setRunErr(null);
    try {
      const r = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, limit, interval }),
      });
      const d = await r.json();
      if (d.error) setRunErr(d.error);
      else setResult(d);
    } catch (e) { setRunErr(String(e)); }
    setRunning(false);
  }

  const markers: SignalMarker[] = result?.signals?.map((s: { timestamp: string; direction: "long"|"short"; type: string; price: number }) => ({
    time:      new Date(s.timestamp).getTime(),
    direction: s.direction,
    type:      s.type,
    price:     s.price,
  })) ?? [];
  const months = result ? Object.entries(result.monthly_returns ?? {}).sort() : [];

  const ma200: MAPoint[] = [];
  {
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += Number(candles[i].c);
      if (i >= 200) sum -= Number(candles[i - 200].c);
      ma200.push({ time: candles[i].t, value: sum / Math.min(i + 1, 200) });
    }
  }

  const longs  = result?.trades?.filter((t: { direction: string }) => t.direction === "long").length  ?? 0;
  const shorts = result?.trades?.filter((t: { direction: string }) => t.direction === "short").length ?? 0;

  function selectTrade(idx: number | null) {
    const trade = idx != null ? result?.trades?.[idx] : null;
    setSelectedTradeIdx(idx);
    setHighlightTrade(trade ? {
      entryTime: new Date(trade.entry_time).getTime(),
      exitTime:  new Date(trade.exit_time).getTime(),
      direction: trade.direction,
    } : null);
    if (trade) setTab("trades");
  }

  const tradeRanges: TradeRange[] = result?.trades?.map((t: { entry_time: string; exit_time: string }) => ({
    entryTime: new Date(t.entry_time).getTime(),
    exitTime:  new Date(t.exit_time).getTime(),
  })) ?? [];

  const winRate = result?.winrate_pct ?? 0;
  const netPnl  = result?.net_pnl ?? 0;

  return (
    <div style={{ padding: "32px 28px", maxWidth: 1240, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "var(--green2)",
              boxShadow: "0 0 10px var(--green2)",
              animation: "pulse-dot 2s ease infinite",
            }} />
            <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
              Live · Hyperliquid
            </span>
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #e8edf8 30%, #60a5fa 70%, #a78bfa 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>Strategy Backtest</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
            Pattern recognition · {symbol}-USDC · {interval.toUpperCase()}
          </p>
        </div>

        <button
          onClick={runBacktest}
          disabled={running}
          style={{
            padding: "12px 32px", borderRadius: 999, fontSize: 14, fontWeight: 800,
            cursor: running ? "not-allowed" : "pointer",
            background: running
              ? "rgba(255,255,255,0.05)"
              : "linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)",
            color: running ? "var(--muted)" : "#fff",
            border: running ? "1px solid var(--border)" : "1px solid rgba(139,92,246,.4)",
            display: "flex", alignItems: "center", gap: 9,
            boxShadow: running
              ? "none"
              : "0 0 30px rgba(99,102,241,.45), 0 4px 16px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.2)",
            transition: "all .2s",
            letterSpacing: "0.01em",
          }}>
          {running ? (
            <>
              <span style={{
                width: 14, height: 14, border: "2px solid var(--muted)",
                borderTopColor: "transparent", borderRadius: "50%",
                display: "inline-block", animation: "spin .7s linear infinite",
              }} />
              Analysing…
            </>
          ) : "▶ Run Backtest"}
        </button>
      </div>

      {runErr && (
        <div style={{
          background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
          borderRadius: 14, padding: "12px 18px", marginBottom: 16,
          fontSize: 12, color: "var(--red2)",
          backdropFilter: "blur(10px)",
        }}>⚠ {runErr}</div>
      )}

      {/* ── Controls bar ── */}
      <div style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid var(--border)",
        borderRadius: 20, padding: "18px 22px", marginBottom: 18,
        display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 32px rgba(0,0,0,.25)",
      }}>
        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", display: "block", marginBottom: 8, fontWeight: 700 }}>Symbol</label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {SYMBOLS.map(s => <PillBtn key={s} active={symbol === s} onClick={() => setSymbol(s)}>{s}</PillBtn>)}
          </div>
        </div>

        <div style={{ width: 1, height: 40, background: "var(--border)", flexShrink: 0 }} />

        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", display: "block", marginBottom: 8, fontWeight: 700 }}>Timeframe</label>
          <div style={{ display: "flex", gap: 5 }}>
            {INTERVALS.map(iv => <PillBtn key={iv.value} active={interval === iv.value} onClick={() => setInterval(iv.value)}>{iv.label}</PillBtn>)}
          </div>
        </div>

        <div style={{ width: 1, height: 40, background: "var(--border)", flexShrink: 0 }} />

        <div>
          <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", display: "block", marginBottom: 8, fontWeight: 700 }}>Lookback</label>
          <div style={{ display: "flex", gap: 5 }}>
            {LIMITS.map(l => <PillBtn key={l} active={limit === l} onClick={() => setLimit(l)}>{l}d</PillBtn>)}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {[
            { color: "#10b981", label: "Long" },
            { color: "#ef4444", label: "Short" },
            { color: "#3b82f6", label: "TP" },
            { color: "#f59e0b", label: "SL" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 999,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: l.color, boxShadow: `0 0 6px ${l.color}` }} />
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border)",
        borderRadius: 20, padding: "18px 18px 14px",
        marginBottom: 18, position: "relative",
        backdropFilter: "blur(20px)",
        boxShadow: "0 8px 40px rgba(0,0,0,.35)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontWeight: 700, fontSize: 14 }}>{symbol}-USDC</p>
            <span style={{
              fontSize: 10, padding: "2px 10px", borderRadius: 999, fontWeight: 700,
              background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
              color: "var(--muted)", letterSpacing: "0.06em",
            }}>{interval.toUpperCase()}</span>
            {loading && (
              <span style={{
                fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ width: 10, height: 10, border: "1.5px solid var(--border2)", borderTopColor: "var(--blue)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                Loading
              </span>
            )}
            {markers.length > 0 && (
              <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 999, background: "rgba(59,130,246,.1)", color: "var(--blue2)", border: "1px solid rgba(59,130,246,.2)", fontWeight: 700 }}>
                {markers.filter(m => m.type === "Entry").length} signals
              </span>
            )}
            {result && longs > 0 && (
              <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 999, background: "rgba(16,185,129,.1)", color: "var(--green2)", border: "1px solid rgba(16,185,129,.2)", fontWeight: 700 }}>
                {longs}↑
              </span>
            )}
            {result && shorts > 0 && (
              <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 999, background: "rgba(239,68,68,.1)", color: "var(--red2)", border: "1px solid rgba(239,68,68,.2)", fontWeight: 700 }}>
                {shorts}↓
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)", opacity: 0.6 }}>{candles.length} candles · Hyperliquid</span>
        </div>

        {candles.length > 0 ? (
          <CandleChart candles={candles} signals={markers} maLine={ma200} maLabel="200 MA" height={480}
            highlightTrade={highlightTrade} tradeRanges={tradeRanges} onTradeClick={selectTrade} />
        ) : (
          <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 36, height: 36, border: "2px solid var(--border)", borderTopColor: "var(--blue)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading chart…</p>
          </div>
        )}

        {!running && markers.length === 0 && candles.length > 0 && (
          <div style={{
            position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
            background: "rgba(4,7,15,.85)", border: "1px solid var(--border)",
            borderRadius: 14, padding: "11px 22px", fontSize: 12, color: "var(--muted)",
            backdropFilter: "blur(16px)", whiteSpace: "nowrap",
            boxShadow: "0 8px 32px rgba(0,0,0,.5)",
          }}>
            Hit <strong style={{ color: "#fff" }}>▶ Run Backtest</strong> to see signals on the chart
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="slide-in">

          {/* quick KPI strip */}
          <div style={{
            display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap",
            padding: "14px 20px",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border)", borderRadius: 18,
            backdropFilter: "blur(20px)",
            alignItems: "center",
          }}>
            {[
              { label: "Win Rate",     value: `${fmt(winRate,1)}%`,             ok: winRate >= 50 },
              { label: "Net P&L",      value: `$${fmt(netPnl)}`,               ok: netPnl  >= 0  },
              { label: "Total Trades", value: String(result.total_trades),      ok: true          },
              { label: "Profit Factor",value: fmt(result.profit_factor),        ok: result.profit_factor >= 1 },
              { label: "Max DD",       value: `${fmt(result.max_drawdown_pct)}%`, ok: result.max_drawdown_pct < 15 },
            ].map((k, idx) => (
              <div key={k.label} style={{ display: "flex", alignItems: "center", gap: idx > 0 ? 10 : 0 }}>
                {idx > 0 && <div style={{ width: 1, height: 28, background: "var(--border)" }} />}
                <div style={{ paddingLeft: idx > 0 ? 10 : 0 }}>
                  <p style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 2 }}>{k.label}</p>
                  <p className="num" style={{ fontSize: 18, fontWeight: 800, color: k.ok ? "var(--green2)" : "var(--red2)", letterSpacing: "-0.02em" }}>{k.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px", width: "fit-content" }}>
            {(["stats","trades"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "7px 22px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all .15s",
                background: tab === t
                  ? "linear-gradient(135deg, #3b82f6, #6366f1)"
                  : "transparent",
                color: tab === t ? "#fff" : "var(--muted)",
                border: "none",
                boxShadow: tab === t ? "0 0 14px rgba(99,102,241,.35)" : "none",
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
                <div style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--border)",
                  borderRadius: 20, padding: 20,
                  backdropFilter: "blur(20px)",
                }}>
                  <p style={{ fontWeight: 700, marginBottom: 14, fontSize: 13, letterSpacing: "-0.01em" }}>Monthly Returns</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
                    {months.map(([month, pnl]) => {
                      const pos = (pnl as number) >= 0;
                      return (
                        <div key={month} style={{
                          borderRadius: 12, padding: "10px 8px", textAlign: "center",
                          background: pos ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)",
                          border: `1px solid ${pos ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)"}`,
                          transition: "transform .15s",
                        }}>
                          <p style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{month}</p>
                          <p className="num" style={{ fontSize: 12, fontWeight: 800, color: pos ? "var(--green2)" : "var(--red2)" }}>
                            {pos ? "+" : ""}${fmt(pnl as number, 0)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "trades" && (
            <TradesTable trades={result.trades ?? []} selectedIdx={selectedTradeIdx} onSelect={selectTrade} />
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes tradeGlow {
          0%, 100% { box-shadow: 0 0 12px rgba(239,68,68,.35), inset 0 0 10px rgba(239,68,68,.08); }
          50%       { box-shadow: 0 0 28px rgba(239,68,68,.75), inset 0 0 18px rgba(239,68,68,.2); }
        }
        .trade-row-glow td { animation: tradeGlow 1.4s ease-in-out infinite; }
        tr:not(.trade-row-glow):hover td { background: rgba(255,255,255,0.025); }
      `}</style>
    </div>
  );
}
