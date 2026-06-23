"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import StatCard from "@/components/StatCard";
import type { BacktestResult } from "@/lib/types";
import type { Candle, SignalMarker, MAPoint, HighlightTrade, TradeRange } from "@/components/CandleChart";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const SYMBOLS  = ["BTC","ETH","SOL","SPX","GOLD"];
const LIMITS   = [365, 730];
const INTERVALS: { label: string; value: string }[] = [
  { label: "1D", value: "1d" },
];
const fmt = (n: number, d = 2) => n?.toFixed(d) ?? "—";

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 18px", borderRadius: 8, fontSize: 15, fontWeight: 600,
      cursor: "pointer", transition: "all .12s",
      background: active ? "var(--teal)" : "#ffffff",
      color: active ? "#ffffff" : "var(--muted)",
      border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
      boxShadow: active ? "0 2px 8px rgba(0,200,150,.3)" : "0 1px 2px rgba(0,0,0,.06)",
    }}>{children}</button>
  );
}

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
        background: "#ffffff", border: "1px solid var(--border)",
        borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,.05)",
      }}>
        <p style={{ fontSize: 32, marginBottom: 8, opacity: 0.25 }}>📊</p>
        <p style={{ fontSize: 15 }}>Run backtest to see trades</p>
      </div>
    );

  return (
    <div style={{
      background: "#ffffff", border: "1px solid var(--border)",
      borderRadius: 14, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.05)",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--dim)" }}>
            {["","#","Side","Entry","Exit","Entry $","Exit $","P&L","Result","Pattern"].map(h => (
              <th key={h} style={{
                padding: "11px 14px", textAlign: "left",
                color: "var(--muted)", fontWeight: 700, fontSize: 12,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const win    = t.pnl > 0;
            const isLong = t.direction === "long";
            const sel    = selectedIdx === i;
            return (
              <>
                <tr key={i} ref={el => { rowRefs.current[i] = el; }}
                  onClick={() => onSelect(sel ? null : i)}
                  style={{
                    borderBottom: sel ? "none" : "1px solid var(--border)",
                    cursor: "pointer", transition: "background .1s",
                    background: sel ? "rgba(0,200,150,.06)" : "transparent",
                    outline: sel ? "2px solid rgba(0,200,150,.4)" : "none",
                    outlineOffset: sel ? -2 : 0,
                  }}>
                  <td style={{ padding: "10px 8px 10px 14px", color: "var(--muted)", fontSize: 13 }}>{sel ? "▼" : "▶"}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                      background: isLong ? "rgba(0,200,150,.1)" : "rgba(234,57,67,.1)",
                      color: isLong ? "var(--teal)" : "var(--red)",
                      border: `1px solid ${isLong ? "rgba(0,200,150,.25)" : "rgba(234,57,67,.25)"}`,
                    }}>{isLong ? "LONG" : "SHORT"}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 13 }}>
                    {new Date(t.entry_time).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 13 }}>
                    {new Date(t.exit_time).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: "var(--text)" }}>${t.entry_price?.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: "var(--text)" }}>${t.exit_price?.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 800, fontSize: 15, color: win ? "var(--teal)" : "var(--red)" }}>
                    {win ? "+" : ""}${t.pnl?.toFixed(2)}
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{
                      padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: win ? "rgba(0,200,150,.1)" : t.exit_reason === "be" ? "rgba(37,99,235,.08)" : t.exit_reason === "eod" ? "rgba(107,122,150,.08)" : "rgba(234,57,67,.1)",
                      color: win ? "var(--teal)" : t.exit_reason === "be" ? "var(--blue2)" : t.exit_reason === "eod" ? "var(--muted)" : "var(--red)",
                      border: `1px solid ${win ? "rgba(0,200,150,.25)" : t.exit_reason === "be" ? "rgba(37,99,235,.2)" : t.exit_reason === "eod" ? "rgba(107,122,150,.2)" : "rgba(234,57,67,.25)"}`,
                    }}>
                      {t.exit_reason === "be" ? "BE" : t.exit_reason?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", fontSize: 13, color: "var(--muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.entry_reason}
                  </td>
                </tr>
                {sel && (
                  <tr key={`${i}-d`} style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,200,150,.03)" }}>
                    <td colSpan={10} style={{ padding: "0 14px 14px 40px" }}>
                      <div style={{
                        background: win ? "rgba(0,200,150,.06)" : "rgba(234,57,67,.05)",
                        border: `1px solid ${win ? "rgba(0,200,150,.2)" : "rgba(234,57,67,.2)"}`,
                        borderRadius: 10, padding: "14px 18px",
                      }}>
                        <p style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: win ? "var(--teal)" : "var(--red)", marginBottom: 6 }}>
                          {win ? "✓ Why it worked" : "✗ Why it failed"}
                        </p>
                        <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.7 }}>{t.analysis ?? "—"}</p>
                        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                          {[`SL @ $${t.sl_price?.toFixed(0)}`, `TP @ $${t.tp_price?.toFixed(0)}`,
                            `Hold: ${Math.round((new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / 86_400_000)}d`
                          ].map(s => (
                            <span key={s} style={{ fontSize: 13, color: "var(--muted)", padding: "2px 10px", borderRadius: 5, background: "var(--dim)", border: "1px solid var(--border)" }}>{s}</span>
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

const CANDLE_API: Record<string, string> = {
  SPX:  "/api/candles-yahoo?symbol=%5EGSPC",
  GOLD: "/api/candles-yahoo?symbol=GC%3DF",
};

export default function BacktestLoopPage() {
  const [result,   setResult]   = useState<BacktestResult | null>(null);
  const [candles,  setCandles]  = useState<Candle[]>([]);
  const [symbol,   setSymbol]   = useState("BTC");
  const [limit,    setLimit]    = useState(730);
  const [loading,  setLoading]  = useState(false);
  const [running,  setRunning]  = useState(false);
  const [runErr,   setRunErr]   = useState<string | null>(null);
  const [tab,      setTab]      = useState<"stats"|"trades">("stats");
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);
  const [highlightTrade,   setHighlightTrade]   = useState<HighlightTrade | null>(null);

  const loadCandles = useCallback(async (sym: string, lim: number) => {
    setLoading(true);
    try {
      let url: string;
      if (CANDLE_API[sym]) {
        url = `${CANDLE_API[sym]}&limit=${lim + 200}`;
      } else {
        url = `/api/candles?symbol=${sym}&interval=1d&limit=${lim + 200}&testnet=false`;
      }
      const r = await fetch(url);
      const d = await r.json();
      if (Array.isArray(d)) setCandles(d);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadCandles(symbol, limit); }, []);
  useEffect(() => {
    loadCandles(symbol, limit);
    setResult(null); setRunErr(null);
  }, [symbol, limit]);

  async function runBacktest() {
    setRunning(true); setRunErr(null);
    try {
      const r = await fetch("/api/backtestloop/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, limit, interval: "1d" }),
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
    <div style={{ padding: "24px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div style={{ marginRight: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>
            Optimised Strategy
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", marginTop: 3 }}>Loop-validated filters · ATR 2× · RR 1.5 · 1% neckline</p>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05)", flexWrap: "wrap" }}>
          {SYMBOLS.map(s => <SegBtn key={s} active={symbol === s} onClick={() => setSymbol(s)}>{s}</SegBtn>)}
        </div>

        <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
          {LIMITS.map(l => <SegBtn key={l} active={limit === l} onClick={() => setLimit(l)}>{l}d</SegBtn>)}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button onClick={runBacktest} disabled={running} style={{
            padding: "12px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: running ? "not-allowed" : "pointer",
            background: running ? "var(--dim)" : "var(--teal)",
            color: running ? "var(--muted)" : "#ffffff",
            border: "none", display: "flex", alignItems: "center", gap: 8,
            boxShadow: running ? "none" : "0 4px 16px rgba(0,200,150,.4)",
            transition: "all .15s",
          }}>
            {running ? (
              <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />Analysing…</>
            ) : "▶  Run Backtest"}
          </button>
        </div>
      </div>

      {runErr && (
        <div style={{ background: "rgba(234,57,67,.06)", border: "1px solid rgba(234,57,67,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 14, color: "var(--red)" }}>⚠ {runErr}</div>
      )}

      <div style={{
        display: "flex", alignItems: "stretch",
        background: "#ffffff", border: "1px solid var(--border)",
        borderRadius: 12, marginBottom: 16, overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.04)",
      }}>
        <div style={{ padding: "14px 22px", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "rgba(0,200,150,.04)" }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--teal)" }} className="pulse" />
          <span style={{ fontWeight: 800, fontSize: 18, color: "var(--text)" }}>{symbol}</span>
          <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "rgba(0,200,150,.12)", border: "1px solid rgba(0,200,150,.25)", color: "var(--teal)", fontWeight: 700 }}>1D</span>
        </div>

        {[
          { label: "Candles",      value: candles.length > 0 ? candles.length.toLocaleString() : "—" },
          { label: "Signals",      value: markers.filter(m => m.type === "Entry").length > 0 ? String(markers.filter(m => m.type === "Entry").length) : "—" },
          { label: "Long ↑",       value: longs > 0  ? String(longs)  : "—", color: "var(--teal)" },
          { label: "Short ↓",      value: shorts > 0 ? String(shorts) : "—", color: "var(--red)"  },
          { label: "Win Rate",     value: result ? `${fmt(result.winrate_pct, 1)}%` : "—", color: result ? (result.winrate_pct >= 50 ? "var(--teal)" : "var(--red)") : undefined },
          { label: "Net P&L",      value: result ? `$${fmt(result.net_pnl)}` : "—", color: result ? (result.net_pnl >= 0 ? "var(--teal)" : "var(--red)") : undefined },
          { label: "Prof. Factor", value: result ? fmt(result.profit_factor) : "—", color: result ? (result.profit_factor >= 1 ? "var(--teal)" : "var(--red)") : undefined },
        ].map(item => (
          <div key={item.label} style={{ padding: "14px 20px", borderRight: "1px solid var(--border)", minWidth: 90 }}>
            <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>{item.label}</p>
            <p className="num" style={{ fontSize: 18, fontWeight: 700, color: item.color ?? "var(--text)" }}>{item.value}</p>
          </div>
        ))}

        <div style={{ marginLeft: "auto", padding: "14px 18px", display: "flex", gap: 12, alignItems: "center" }}>
          {[{ c: "var(--teal)", l: "Long" }, { c: "var(--red)", l: "Short" }, { c: "var(--blue)", l: "TP" }, { c: "var(--yellow)", l: "SL" }].map(x => (
            <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: x.c }} />
              <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{x.l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: "#fff", border: "1px solid var(--border)", borderRadius: 14,
        padding: "0 0 4px", marginBottom: 18, overflow: "hidden", position: "relative",
        boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.05)",
      }}>
        {loading && (
          <div style={{ position: "absolute", top: 12, left: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--muted)" }}>
            <span style={{ width: 11, height: 11, border: "2px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />Loading…
          </div>
        )}
        {candles.length > 0 ? (
          <CandleChart candles={candles} signals={markers} maLine={ma200} maLabel="200 MA" height={460}
            highlightTrade={highlightTrade} tradeRanges={tradeRanges} onTradeClick={selectTrade} />
        ) : (
          <div style={{ height: 460, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "var(--muted)", fontSize: 15 }}>Loading chart…</p>
          </div>
        )}
        {!running && markers.length === 0 && candles.length > 0 && (
          <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,.95)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 20px", fontSize: 15, color: "var(--muted)", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.1)" }}>
            Hit <strong style={{ color: "var(--teal)" }}>▶ Run Backtest</strong> to see signals
          </div>
        )}
      </div>

      {result && (
        <div className="slide-in">
          <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 4, width: "fit-content", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
            {(["stats","trades"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "8px 24px", borderRadius: 7, fontSize: 15, fontWeight: 700,
                cursor: "pointer", transition: "all .12s",
                background: tab === t ? "var(--teal)" : "transparent",
                color: tab === t ? "#fff" : "var(--muted)", border: "none",
                boxShadow: tab === t ? "0 2px 8px rgba(0,200,150,.3)" : "none",
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
                <StatCard label="Total Trades"  value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L · ${longs}↑ ${shorts}↓`} />
                <StatCard label="Avg Win"       value={`$${fmt(result.avg_win)}`}   color="green" />
                <StatCard label="Avg Loss"      value={`$${fmt(result.avg_loss)}`}  color="red" />
                <StatCard label="Worst Streak"  value={String(result.largest_losing_streak)} color="yellow" />
              </div>
              {months.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
                  <p style={{ fontWeight: 700, marginBottom: 14, fontSize: 15, color: "var(--text)" }}>Monthly Returns</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 8 }}>
                    {months.map(([month, pnl]) => {
                      const pos = (pnl as number) >= 0;
                      return (
                        <div key={month} style={{
                          borderRadius: 9, padding: "10px 10px", textAlign: "center",
                          background: pos ? "rgba(0,200,150,.07)" : "rgba(234,57,67,.07)",
                          border: `1px solid ${pos ? "rgba(0,200,150,.2)" : "rgba(234,57,67,.2)"}`,
                        }}>
                          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{month}</p>
                          <p className="num" style={{ fontSize: 15, fontWeight: 800, color: pos ? "var(--teal)" : "var(--red)" }}>
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
        tr:hover td { background: rgba(0,200,150,.03); }
      `}</style>
    </div>
  );
}
