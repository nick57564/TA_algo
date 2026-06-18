"use client";
import { useEffect, useState } from "react";
import EquityChart from "@/components/EquityChart";
import StatCard from "@/components/StatCard";
import type { BotEvent, BacktestResult } from "@/lib/types";

const KIND_COLOR: Record<string, string> = {
  entry:  "var(--teal)",
  exit:   "var(--red)",
  signal: "var(--blue2)",
  info:   "var(--muted)",
  error:  "var(--red)",
};
const KIND_ICON: Record<string, string> = {
  entry: "▲", exit: "▼", signal: "⚡", info: "·", error: "✕",
};

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

export default function Overview() {
  const [events,   setEvents]   = useState<BotEvent[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [btcPrice, setBtcPrice] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const [ev, bt] = await Promise.all([
        fetch("/api/events").then(r => r.json()).catch(() => []),
        fetch("/api/backtest").then(r => r.json()).catch(() => null),
      ]);
      setEvents(ev);
      setBacktest(bt);
    };
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, []);

  // Live BTC price from Hyperliquid
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const r = await fetch("/api/candles?symbol=BTC&interval=1d&limit=2&testnet=false");
        const d = await r.json();
        if (Array.isArray(d) && d.length > 0) setBtcPrice(Number(d[d.length - 1].c));
      } catch {}
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 10000);
    return () => clearInterval(id);
  }, []);

  const STRATEGY = [
    { label: "Trend Filter",    value: "Daily 50 EMA",   note: "Long above · Short below" },
    { label: "MTF Sync",        value: "W+D or D+4H",    note: "All timeframes must agree" },
    { label: "Entry Signal",    value: "1H Engulfing",   note: "On structural retest" },
    { label: "Risk per Trade",  value: "1%",             note: "of account balance" },
    { label: "Stop Loss",       value: "Structural",     note: "ATR-based distance" },
    { label: "Take Profit",     value: "2× R",           note: "Measured-move target" },
    { label: "R:R Ratio",       value: "1 : 2",          note: "Minimum per trade" },
    { label: "Trailing Stop",   value: "Chandelier",     note: "Locks in after breakeven" },
    { label: "MA Filter",       value: "200-day SMA",    note: "Only trend-aligned trades" },
    { label: "Max Dist MA",     value: "10% / 18%",      note: "Candles / Structure" },
  ];

  return (
    <div style={{ padding: "20px 24px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)", flexShrink: 0 }} />
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Overview</h1>
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 1 }}>BTCUSD Structure Bot · Hyperliquid</p>
          </div>
        </div>
        {btcPrice && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
            background: "#fff", border: "1px solid var(--border)", borderRadius: 9,
            boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>BTC-USDC</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--teal)", letterSpacing: "-0.02em" }} className="num">
              ${btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        )}
      </div>

      {/* ── Top stat strip ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18,
      }}>
        {[
          { label: "Strategy",    value: "Structure",     sub: "Pattern recognition",  color: undefined },
          { label: "Universe",    value: "7 Pairs",       sub: "BTC ETH SOL ARB…",    color: undefined },
          { label: "Timeframes",  value: "1H · 4H · 1D", sub: "Multi-timeframe sync", color: undefined },
          { label: "Exchange",    value: "Hyperliquid",   sub: "Perpetuals · Live",    color: "green" as const },
        ].map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* ── Main two-column grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>

        {/* ── Left: Strategy rules ── */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.04)", padding: "18px 20px" }}>
          <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, letterSpacing: "-0.01em" }}>Strategy Rules</p>
          <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>Live parameters driving every signal</p>
          {STRATEGY.map(({ label, value, note }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div>
                <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</p>
                <p style={{ fontSize: 11, color: "var(--muted)", opacity: 0.6, marginTop: 1 }}>{note}</p>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--teal)", letterSpacing: "-0.01em", textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Right: Backtest snapshot + events ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Backtest results */}
          {backtest ? (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.04)", padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 13 }}>Last Backtest</p>
                  <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    {backtest.symbol} · {new Date(backtest.ts).toLocaleString()}
                  </p>
                </div>
                <a href="/backtest" style={{ fontSize: 12, color: "var(--teal)", textDecoration: "none", fontWeight: 600 }}>View full →</a>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                <StatCard label="Win Rate"      value={`${backtest.winrate_pct}%`}      color={backtest.winrate_pct >= 50 ? "green" : "red"} />
                <StatCard label="Profit Factor" value={String(backtest.profit_factor)}  color={backtest.profit_factor >= 1 ? "green" : "red"} />
                <StatCard label="Max DD"        value={`${backtest.max_drawdown_pct}%`} color={backtest.max_drawdown_pct > 15 ? "red" : "yellow"} />
                <StatCard label="Net P&L"       value={`$${backtest.net_pnl.toFixed(0)}`} color={backtest.net_pnl >= 0 ? "green" : "red"} glow />
              </div>
              {backtest.equity_curve?.length > 1 && <EquityChart points={backtest.equity_curve} height={110} />}
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.04)", padding: "28px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>No backtest results yet</p>
              <a href="/backtest" style={{
                display: "inline-block", padding: "8px 20px", borderRadius: 7,
                background: "var(--teal-bg)", border: "1px solid var(--teal-border)",
                color: "var(--teal)", fontSize: 13, fontWeight: 700, textDecoration: "none",
              }}>Run Backtest →</a>
            </div>
          )}

          {/* Recent events */}
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.04)", padding: "18px 20px", flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 13 }}>Recent Events</p>
              <a href="/log" style={{ fontSize: 12, color: "var(--teal)", textDecoration: "none", fontWeight: 600 }}>View all →</a>
            </div>
            {events.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center" }}>
                <p style={{ fontSize: 30, marginBottom: 8, opacity: 0.2 }}>📡</p>
                <p style={{ color: "var(--muted)", fontSize: 13 }}>No events yet</p>
                <p style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, opacity: 0.7 }}>Run the bot to see activity here</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {events.slice(0, 10).map((e, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "8px 10px", borderRadius: 7,
                    background: "rgba(255,255,255,0.03)",
                  }}>
                    <span style={{ color: KIND_COLOR[e.kind] ?? "var(--muted)", fontSize: 12, marginTop: 1, width: 14, flexShrink: 0 }}>
                      {KIND_ICON[e.kind] ?? "·"}
                    </span>
                    <span className="num" style={{ color: "var(--muted)", fontSize: 10, marginTop: 2, whiteSpace: "nowrap", flexShrink: 0 }}>
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>
                    <span style={{ color: "var(--text)", fontSize: 12, lineHeight: 1.4 }}>{e.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom: Pattern guide ── */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.04)", padding: "18px 20px" }}>
        <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Detected Patterns</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {[
            { name: "Head & Shoulders",     dir: "Short", type: "Structure" },
            { name: "Inv. Head & Shoulders",dir: "Long",  type: "Structure" },
            { name: "Double Top",           dir: "Short", type: "Structure" },
            { name: "Double Bottom",        dir: "Long",  type: "Structure" },
            { name: "Triple Top",           dir: "Short", type: "Structure" },
            { name: "Triple Bottom",        dir: "Long",  type: "Structure" },
            { name: "Bearish Engulfing",    dir: "Short", type: "Candle" },
            { name: "Bullish Engulfing",    dir: "Long",  type: "Candle" },
            { name: "Hammer",               dir: "Long",  type: "Candle" },
            { name: "Shooting Star",        dir: "Short", type: "Candle" },
            { name: "Morning Star",         dir: "Long",  type: "Candle" },
            { name: "Evening Star",         dir: "Short", type: "Candle" },
          ].map(p => (
            <div key={p.name} style={{
              padding: "10px 12px", borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  background: p.dir === "Long" ? "rgba(0,212,180,.12)" : "rgba(234,57,67,.12)",
                  color: p.dir === "Long" ? "var(--teal)" : "var(--red)",
                  border: `1px solid ${p.dir === "Long" ? "rgba(0,212,180,.2)" : "rgba(234,57,67,.2)"}`,
                }}>{p.dir}</span>
                <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>{p.type}</span>
              </div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{p.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
