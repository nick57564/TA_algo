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

/* ── Segment button (Hyperliquid-style) ── */
function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      cursor: "pointer", transition: "all .12s",
      background: active ? "var(--teal-bg)" : "transparent",
      color: active ? "var(--teal)" : "var(--muted)",
      border: active ? "1px solid var(--teal-border)" : "1px solid transparent",
    }}>{children}</button>
  );
}

/* ── Trades table ── */
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
        padding: 40, textAlign: "center", color: "var(--muted)",
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
      }}>
        Run backtest to see trades
      </div>
    );

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
            {["","#","Side","Entry","Exit","Entry $","Exit $","P&L","Result","Pattern"].map(h => (
              <th key={h} style={{
                padding: "10px 12px", textAlign: "left",
                color: "var(--muted)", fontWeight: 600, fontSize: 10,
                textTransform: "uppercase", letterSpacing: "0.07em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const win      = t.pnl > 0;
            const isLong   = t.direction === "long";
            const selected = selectedIdx === i;
            return (
              <>
                <tr key={i} ref={el => { rowRefs.current[i] = el; }}
                  onClick={() => onSelect(selected ? null : i)}
                  className={selected ? "trade-row-sel" : undefined}
                  style={{
                    borderBottom: selected ? "none" : "1px solid rgba(255,255,255,0.04)",
                    cursor: "pointer", transition: "background .1s",
                    background: selected ? "rgba(0,212,180,.06)" : "transparent",
                    outline: selected ? "1px solid rgba(0,212,180,.35)" : "none",
                    outlineOffset: -1,
                  }}>
                  <td style={{ padding: "9px 8px 9px 12px", color: "var(--muted)", fontSize: 10 }}>
                    {selected ? "▼" : "▶"}
                  </td>
                  <td style={{ padding: "9px 8px", color: "var(--muted)", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "9px 8px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: isLong ? "rgba(0,212,180,.12)" : "rgba(234,57,67,.12)",
                      color: isLong ? "var(--teal)" : "var(--red)",
                      border: `1px solid ${isLong ? "rgba(0,212,180,.2)" : "rgba(234,57,67,.2)"}`,
                    }}>{isLong ? "LONG" : "SHORT"}</span>
                  </td>
                  <td style={{ padding: "9px 8px", color: "var(--muted)", fontSize: 11 }}>
                    {new Date(t.entry_time).toLocaleDateString()}
                    <span style={{ opacity: 0.5 }}> {new Date(t.entry_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td style={{ padding: "9px 8px", color: "var(--muted)", fontSize: 11 }}>
                    {new Date(t.exit_time).toLocaleDateString()}
                    <span style={{ opacity: 0.5 }}> {new Date(t.exit_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </td>
                  <td style={{ padding: "9px 8px", fontWeight: 600 }}>${t.entry_price?.toLocaleString()}</td>
                  <td style={{ padding: "9px 8px", fontWeight: 600 }}>${t.exit_price?.toLocaleString()}</td>
                  <td style={{ padding: "9px 8px", fontWeight: 700,
                    color: win ? "var(--teal)" : "var(--red)", fontSize: 13 }}>
                    {win ? "+" : ""}${t.pnl?.toFixed(2)}
                  </td>
                  <td style={{ padding: "9px 8px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: win
                        ? "rgba(0,212,180,.12)"
                        : t.exit_reason === "be" ? "rgba(96,165,250,.1)"
                        : t.exit_reason === "eod" ? "rgba(90,112,144,.1)"
                        : "rgba(234,57,67,.12)",
                      color: win ? "var(--teal)"
                        : t.exit_reason === "be" ? "var(--blue2)"
                        : t.exit_reason === "eod" ? "var(--muted)"
                        : "var(--red)",
                      border: `1px solid ${win
                        ? "rgba(0,212,180,.2)"
                        : t.exit_reason === "be" ? "rgba(96,165,250,.2)"
                        : t.exit_reason === "eod" ? "rgba(90,112,144,.2)"
                        : "rgba(234,57,67,.2)"}`,
                    }}>
                      {t.exit_reason === "be" ? "BE" : t.exit_reason?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{
                    padding: "9px 8px", fontSize: 11, color: "var(--muted)",
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{t.entry_reason}</td>
                </tr>
                {selected && (
                  <tr key={`${i}-detail`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td colSpan={10} style={{ padding: "0 12px 12px 36px" }}>
                      <div style={{
                        background: win ? "rgba(0,212,180,.05)" : "rgba(234,57,67,.05)",
                        border: `1px solid ${win ? "rgba(0,212,180,.15)" : "rgba(234,57,67,.15)"}`,
                        borderRadius: 8, padding: "12px 16px",
                      }}>
                        <p style={{
                          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.08em", color: win ? "var(--teal)" : "var(--red)", marginBottom: 6,
                        }}>{win ? "✓ Why it worked" : "✗ Why it failed"}</p>
                        <p style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>{t.analysis ?? "—"}</p>
                        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                          {[
                            `SL @ $${t.sl_price?.toFixed(0)}`,
                            `TP @ $${t.tp_price?.toFixed(0)}`,
                            `Hold: ${Math.round((new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / 3_600_000)}h`,
                          ].map(s => (
                            <span key={s} style={{
                              fontSize: 10, color: "var(--muted)",
                              padding: "2px 8px", borderRadius: 4,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid var(--border)",
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

/* ── Main page ── */
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
      else { setResult(d); setTab("stats"); }
    } catch (e) { setRunErr(String(e)); }
    setRunning(false);
  }

  const markers: SignalMarker[] = result?.signals?.map((s: { timestamp: string; direction: "long"|"short"; type: string; price: number }) => ({
    time: new Date(s.timestamp).getTime(), direction: s.direction, type: s.type, price: s.price,
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

  return (
    /* full-width, no max-width */
    <div style={{ padding: "20px 24px", minHeight: "100vh" }}>

      {/* ── Top bar: title + symbol strip + run button ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        marginBottom: 16, flexWrap: "wrap",
      }}>
        {/* Title */}
        <div style={{ marginRight: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)", display: "inline-block" }} className="pulse" />
            <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>Live · Hyperliquid</span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>
            Strategy <span style={{ color: "var(--teal)" }}>Backtest</span>
          </h1>
        </div>

        {/* Symbol pills */}
        <div style={{
          display: "flex", gap: 4, flexWrap: "wrap",
          padding: "6px 10px", background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 8,
        }}>
          {SYMBOLS.map(s => <SegBtn key={s} active={symbol === s} onClick={() => setSymbol(s)}>{s}</SegBtn>)}
        </div>

        {/* Timeframe pills */}
        <div style={{
          display: "flex", gap: 4,
          padding: "6px 10px", background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 8,
        }}>
          {INTERVALS.map(iv => <SegBtn key={iv.value} active={interval === iv.value} onClick={() => setInterval(iv.value)}>{iv.label}</SegBtn>)}
        </div>

        {/* Lookback pills */}
        <div style={{
          display: "flex", gap: 4,
          padding: "6px 10px", background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 8,
        }}>
          {LIMITS.map(l => <SegBtn key={l} active={limit === l} onClick={() => setLimit(l)}>{l}d</SegBtn>)}
        </div>

        {/* Run button — far right */}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={runBacktest} disabled={running} style={{
            padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: running ? "not-allowed" : "pointer",
            background: running ? "var(--dim)" : "var(--teal)",
            color: running ? "var(--muted)" : "#0b0e1a",
            border: "none", display: "flex", alignItems: "center", gap: 8,
            boxShadow: running ? "none" : "0 0 20px rgba(0,212,180,.35)",
            transition: "all .15s",
          }}>
            {running ? (
              <>
                <span style={{ width: 13, height: 13, border: "2px solid var(--muted)", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                Analysing…
              </>
            ) : "▶ Run Backtest"}
          </button>
        </div>
      </div>

      {runErr && (
        <div style={{
          background: "rgba(234,57,67,.08)", border: "1px solid rgba(234,57,67,.2)",
          borderRadius: 8, padding: "10px 16px", marginBottom: 14,
          fontSize: 12, color: "var(--red2)",
        }}>⚠ {runErr}</div>
      )}

      {/* ── Hyperliquid-style data strip ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 8, marginBottom: 12, overflow: "hidden",
      }}>
        {/* Symbol badge */}
        <div style={{
          padding: "10px 18px", borderRight: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(0,212,180,.05)",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal)" }} />
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em" }}>{symbol}-USDC</span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 4,
            background: "var(--teal-bg)", border: "1px solid var(--teal-border)",
            color: "var(--teal)", fontWeight: 700, letterSpacing: "0.06em",
          }}>{interval.toUpperCase()}</span>
        </div>

        {/* Stats */}
        {[
          { label: "Candles", value: candles.length > 0 ? candles.length.toLocaleString() : "—" },
          { label: "Signals",  value: markers.filter(m => m.type === "Entry").length > 0 ? String(markers.filter(m => m.type === "Entry").length) : "—" },
          { label: "Long",    value: longs  > 0 ? String(longs)  : "—", color: "var(--teal)" },
          { label: "Short",   value: shorts > 0 ? String(shorts) : "—", color: "var(--red)"  },
          { label: "Win Rate",value: result ? `${fmt(result.winrate_pct, 1)}%` : "—",
            color: result ? (result.winrate_pct >= 50 ? "var(--teal)" : "var(--red)") : undefined },
          { label: "Net P&L", value: result ? `$${fmt(result.net_pnl)}` : "—",
            color: result ? (result.net_pnl >= 0 ? "var(--teal)" : "var(--red)") : undefined },
          { label: "Prof. Factor", value: result ? fmt(result.profit_factor) : "—",
            color: result ? (result.profit_factor >= 1 ? "var(--teal)" : "var(--red)") : undefined },
        ].map((item, i) => (
          <div key={item.label} style={{
            padding: "10px 18px", borderRight: "1px solid var(--border)",
            minWidth: 80,
          }}>
            <p style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, marginBottom: 3 }}>{item.label}</p>
            <p className="num" style={{ fontSize: 14, fontWeight: 700, color: item.color ?? "var(--text)" }}>{item.value}</p>
          </div>
        ))}

        {/* Legend */}
        <div style={{ marginLeft: "auto", padding: "10px 16px", display: "flex", gap: 12, alignItems: "center" }}>
          {[
            { color: "var(--teal)", label: "Long ▲" },
            { color: "var(--red)",  label: "Short ▼" },
            { color: "var(--blue2)",label: "TP ●" },
            { color: "var(--yellow)",label: "SL ●" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: l.color }} />
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "0 0 4px", marginBottom: 14,
        overflow: "hidden", position: "relative",
      }}>
        {loading && (
          <div style={{
            position: "absolute", top: 10, left: 14, zIndex: 10,
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, color: "var(--muted)",
          }}>
            <span style={{ width: 10, height: 10, border: "1.5px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
            Loading…
          </div>
        )}

        {candles.length > 0 ? (
          <CandleChart candles={candles} signals={markers} maLine={ma200} maLabel="200 MA" height={460}
            highlightTrade={highlightTrade} tradeRanges={tradeRanges} onTradeClick={selectTrade} />
        ) : (
          <div style={{ height: 460, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 32, height: 32, border: "2px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading chart…</p>
          </div>
        )}

        {!running && markers.length === 0 && candles.length > 0 && (
          <div style={{
            position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
            background: "rgba(11,14,26,.9)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "9px 18px", fontSize: 12, color: "var(--muted)",
            backdropFilter: "blur(12px)", whiteSpace: "nowrap",
          }}>
            Hit <strong style={{ color: "var(--teal)" }}>▶ Run Backtest</strong> to see signals
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="slide-in">
          {/* Tabs */}
          <div style={{
            display: "flex", gap: 0, marginBottom: 12,
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 4, width: "fit-content",
          }}>
            {(["stats","trades"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "6px 20px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all .12s",
                background: tab === t ? "var(--teal-bg)" : "transparent",
                color: tab === t ? "var(--teal)" : "var(--muted)",
                border: tab === t ? "1px solid var(--teal-border)" : "1px solid transparent",
              }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
            ))}
          </div>

          {tab === "stats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <StatCard label="Win Rate"      value={`${fmt(result.winrate_pct, 1)}%`}   color={result.winrate_pct >= 50 ? "green" : "red"} glow />
                <StatCard label="Profit Factor" value={fmt(result.profit_factor)}           color={result.profit_factor >= 1 ? "green" : "red"} />
                <StatCard label="Max Drawdown"  value={`${fmt(result.max_drawdown_pct)}%`} color={result.max_drawdown_pct > 15 ? "red" : "yellow"} />
                <StatCard label="Net P&L"       value={`$${fmt(result.net_pnl)}`}          color={result.net_pnl >= 0 ? "green" : "red"} glow />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                <StatCard label="Total Trades" value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L · ${longs}↑ ${shorts}↓`} />
                <StatCard label="Avg Win"      value={`$${fmt(result.avg_win)}`}  color="green" />
                <StatCard label="Avg Loss"     value={`$${fmt(result.avg_loss)}`} color="red" />
                <StatCard label="Worst Streak" value={String(result.largest_losing_streak)} color="yellow" />
              </div>

              {months.length > 0 && (
                <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                  <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Monthly Returns</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 6 }}>
                    {months.map(([month, pnl]) => {
                      const pos = (pnl as number) >= 0;
                      return (
                        <div key={month} style={{
                          borderRadius: 7, padding: "8px 10px", textAlign: "center",
                          background: pos ? "rgba(0,212,180,.07)" : "rgba(234,57,67,.07)",
                          border: `1px solid ${pos ? "rgba(0,212,180,.18)" : "rgba(234,57,67,.18)"}`,
                        }}>
                          <p style={{ fontSize: 9, color: "var(--muted)", marginBottom: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{month}</p>
                          <p className="num" style={{ fontSize: 12, fontWeight: 700, color: pos ? "var(--teal)" : "var(--red)" }}>
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
        .trade-row-sel td { background: rgba(0,212,180,.06); }
        tr:not(.trade-row-sel):hover td { background: rgba(255,255,255,.02); }
        @keyframes tradeGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(0,212,180,.25); }
          50%       { box-shadow: 0 0 22px rgba(0,212,180,.55); }
        }
      `}</style>
    </div>
  );
}
