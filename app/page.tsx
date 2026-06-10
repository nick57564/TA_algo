"use client";
import { useEffect, useState } from "react";
import EquityChart from "@/components/EquityChart";
import StatCard from "@/components/StatCard";
import type { BotEvent, BacktestResult } from "@/lib/types";

const KIND_COLOR: Record<string, string> = {
  entry:  "var(--green)",
  exit:   "var(--red)",
  signal: "var(--blue2)",
  info:   "var(--muted)",
  error:  "var(--red)",
};
const KIND_ICON: Record<string, string> = {
  entry: "▲", exit: "▼", signal: "⚡", info: "·", error: "✕",
};

export default function Overview() {
  const [events, setEvents]   = useState<BotEvent[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);

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

  const lastEntry = events.find(e => e.kind === "entry");
  const lastExit  = events.find(e => e.kind === "exit");

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Overview</h1>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>BTCUSD Structure Bot · Hyperliquid</p>
      </div>

      {/* Strategy summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Trend Filter",     value: "Daily 50 EMA",      sub: "Long above / Short below",    color: "blue"   as const },
          { label: "MTF Sync",         value: "W+D or D+4H",       sub: "Must agree before entry",     color: "purple" as const },
          { label: "Entry Signal",     value: "1H Engulfing",      sub: "On structural retest",        color: "blue"   as const },
        ].map(c => <StatCard key={c.label} {...c} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Risk per Trade",  value: "1%",   sub: "of account balance",  color: "yellow" as const },
          { label: "Stop Loss",       value: "1%",   sub: "at structural level",  color: "red"    as const },
          { label: "Take Profit",     value: "3%",   sub: "fixed from entry",     color: "green"  as const },
          { label: "R:R Ratio",       value: "1 : 3", sub: "minimum per trade",  color: "green"  as const },
        ].map(c => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Backtest snapshot */}
      {backtest && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14 }}>Last Backtest Results</p>
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{backtest.symbol} · {new Date(backtest.ts).toLocaleString()}</p>
            </div>
            <a href="/backtest" style={{ fontSize: 12, color: "var(--blue2)", textDecoration: "none" }}>View full →</a>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatCard label="Win Rate"      value={`${backtest.winrate_pct}%`}      color={backtest.winrate_pct >= 50 ? "green" : "red"} />
            <StatCard label="Profit Factor" value={String(backtest.profit_factor)}  color={backtest.profit_factor >= 1 ? "green" : "red"} />
            <StatCard label="Max Drawdown"  value={`${backtest.max_drawdown_pct}%`} color={backtest.max_drawdown_pct > 15 ? "red" : "yellow"} />
            <StatCard label="Net P&L"       value={`$${backtest.net_pnl.toLocaleString()}`} color={backtest.net_pnl >= 0 ? "green" : "red"} glow />
          </div>
          {backtest.equity_curve?.length > 1 && <EquityChart points={backtest.equity_curve} height={120} />}
        </div>
      )}

      {/* Recent events */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ fontWeight: 600, fontSize: 14 }}>Recent Events</p>
          <a href="/log" style={{ fontSize: 12, color: "var(--blue2)", textDecoration: "none" }}>View all →</a>
        </div>
        {events.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No events yet — run the bot to see activity here.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {events.slice(0, 8).map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--dim)" }}>
                <span style={{ color: KIND_COLOR[e.kind] ?? "var(--muted)", fontSize: 13, marginTop: 1, width: 14 }}>
                  {KIND_ICON[e.kind] ?? "·"}
                </span>
                <span className="num" style={{ color: "var(--muted)", fontSize: 11, marginTop: 2, whiteSpace: "nowrap" }}>
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span style={{ color: "var(--text)", fontSize: 13 }}>{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
