"use client";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import EquityChart from "@/components/EquityChart";

interface LogEntry {
  ts: number;
  type: "trend" | "pattern" | "skip" | "wait" | "entry" | "exit" | "info";
  msg: string;
}

interface PaperAccount {
  balance: number;
  equity: number;
  unrealized_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  net_pnl: number;
  equity_curve: number[];
  last_run?: string;
  started_at?: string;
  initializing?: boolean;
  signal_log?: LogEntry[];
  position?: {
    direction: "long" | "short";
    size: number;
    entry_price: number;
    sl_price: number;
    tp_price: number;
    unrealized_pnl: number;
    entry_reason: string;
  } | null;
}

export default function PaperPage() {
  const [account,  setAccount]  = useState<PaperAccount | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const load = async () => {
    const r = await fetch("/api/paper/account").then(x => x.json()).catch(() => null);
    setAccount(r);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  async function start() {
    setStarting(true);
    await fetch("/api/paper/start", { method: "POST" });
    await load();
    setStarting(false);
  }

  async function reset() {
    setResetting(true);
    await fetch("/api/paper/start", { method: "DELETE" });
    setAccount(null);
    setResetting(false);
  }

  const fmt = (n: number, d = 2) =>
    n?.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) ?? "—";

  return (
    <div style={{ padding: "24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: "rgba(0,200,150,.12)", color: "var(--teal)", border: "1px solid rgba(0,200,150,.2)" }}>
              TESTNET
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Paper Trading</h1>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Simulated on live Hyperliquid prices · Same strategy as backtest · No real money
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {account && !account.initializing && (
            <button onClick={reset} disabled={resetting} style={{
              padding: "10px 20px", borderRadius: 9, fontSize: 14, cursor: "pointer",
              background: "#fff", color: "var(--muted)",
              border: "1px solid var(--border)", fontWeight: 600,
            }}>
              {resetting ? "Resetting…" : "Reset"}
            </button>
          )}
          {!account && !loading && (
            <button onClick={start} disabled={starting} style={{
              padding: "12px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: starting ? "not-allowed" : "pointer",
              background: starting ? "var(--dim)" : "var(--teal)",
              color: starting ? "var(--muted)" : "#fff",
              border: "none",
              boxShadow: starting ? "none" : "0 4px 16px rgba(0,200,150,.4)",
            }}>
              {starting ? "Starting…" : "▶  Start Paper Trading"}
            </button>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 14, padding: "60px 0", justifyContent: "center" }}>
          <span style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
          Loading…
        </div>
      )}

      {/* ── Not started ── */}
      {!loading && !account && (
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.3 }}>📊</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Paper trading not started</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
            Click Start to begin simulating trades with $10,000 virtual USDC.<br />
            The bot uses the exact same strategy as the backtest — running on live BTC prices.
          </p>
          <button onClick={start} disabled={starting} style={{
            padding: "14px 40px", borderRadius: 12, fontSize: 16, fontWeight: 700,
            cursor: starting ? "not-allowed" : "pointer",
            background: starting ? "var(--dim)" : "var(--teal)",
            color: starting ? "var(--muted)" : "#fff",
            border: "none",
            boxShadow: starting ? "none" : "0 6px 20px rgba(0,200,150,.4)",
          }}>
            {starting ? "Starting…" : "▶  Start Paper Trading"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>
            Updates every hour · No wallet required
          </p>
        </div>
      )}

      {/* ── Initializing ── */}
      {!loading && account?.initializing && (
        <div style={{
          background: "rgba(0,200,150,.05)", border: "1px solid rgba(0,200,150,.2)",
          borderRadius: 14, padding: "32px 28px", textAlign: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ width: 14, height: 14, border: "2px solid rgba(0,200,150,.3)", borderTopColor: "var(--teal)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
            <p style={{ fontWeight: 700, fontSize: 16, color: "var(--teal)" }}>Initializing paper trading…</p>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Fetching live data and running the strategy. This takes about 30 seconds.
          </p>
        </div>
      )}

      {/* ── Active account ── */}
      {!loading && account && !account.initializing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard label="Balance"        value={`$${fmt(account.balance)}`}     color="blue" glow />
            <StatCard label="Equity"         value={`$${fmt(account.equity)}`}      color={account.equity >= 10000 ? "green" : "red"} />
            <StatCard label="Unrealized P&L" value={`${account.unrealized_pnl >= 0 ? "+" : ""}$${fmt(account.unrealized_pnl)}`} color={account.unrealized_pnl >= 0 ? "green" : "red"} />
            <StatCard label="Net P&L"        value={`${account.net_pnl >= 0 ? "+" : ""}$${fmt(account.net_pnl)}`} color={account.net_pnl >= 0 ? "green" : "red"} glow />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <StatCard label="Trades"  value={String(account.total_trades)} sub={`${account.wins}W · ${account.losses}L`} />
            <StatCard label="Win Rate" value={account.total_trades ? `${((account.wins / account.total_trades) * 100).toFixed(1)}%` : "—"} color={account.total_trades && account.wins / account.total_trades >= 0.5 ? "green" : "red"} />
            <StatCard label="Return"  value={`${(((account.equity - 10000) / 10000) * 100).toFixed(2)}%`} color={account.equity >= 10000 ? "green" : "red"} />
          </div>

          {/* Open position */}
          {account.position && (
            <div style={{
              background: account.position.direction === "long" ? "rgba(0,200,150,.05)" : "rgba(234,57,67,.05)",
              border: `1px solid ${account.position.direction === "long" ? "rgba(0,200,150,.2)" : "rgba(234,57,67,.2)"}`,
              borderRadius: 14, padding: "20px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div className="pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: account.position.direction === "long" ? "var(--teal)" : "var(--red)" }} />
                <p style={{ fontWeight: 700, fontSize: 16 }}>Open Position</p>
                <span style={{
                  padding: "3px 12px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                  background: account.position.direction === "long" ? "rgba(0,200,150,.15)" : "rgba(234,57,67,.15)",
                  color: account.position.direction === "long" ? "var(--teal)" : "var(--red)",
                }}>
                  {account.position.direction.toUpperCase()}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
                {[
                  { label: "Size",           value: `${account.position.size} BTC` },
                  { label: "Entry Price",    value: `$${fmt(account.position.entry_price)}` },
                  { label: "Stop Loss",      value: `$${fmt(account.position.sl_price)}` },
                  { label: "Take Profit",    value: `$${fmt(account.position.tp_price)}` },
                ].map(item => (
                  <div key={item.label} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                    <p style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{item.label}</p>
                    <p className="num" style={{ fontWeight: 700, fontSize: 16 }}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: 13, color: "var(--muted)", maxWidth: "80%" }}>{account.position.entry_reason}</p>
                <p className="num" style={{
                  fontSize: 18, fontWeight: 800,
                  color: account.position.unrealized_pnl >= 0 ? "var(--teal)" : "var(--red)",
                }}>
                  {account.position.unrealized_pnl >= 0 ? "+" : ""}${fmt(account.position.unrealized_pnl)}
                </p>
              </div>
            </div>
          )}

          {/* Equity curve */}
          {(account.equity_curve?.length ?? 0) > 1 && (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontWeight: 700, fontSize: 15 }}>Equity Curve</p>
                <p className="num" style={{ fontSize: 13, color: "var(--muted)" }}>$10,000 start</p>
              </div>
              <EquityChart points={account.equity_curve} height={160} />
            </div>
          )}

          {/* No trades yet */}
          {account.total_trades === 0 && !account.position && (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "40px 28px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
              <p style={{ fontSize: 32, marginBottom: 12, opacity: 0.2 }}>⏳</p>
              <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Waiting for the next signal</p>
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                The strategy checks for entries every hour. A trade will appear here when all conditions align:<br />
                price above/below 200 MA · pattern detected · RSI + volume confirmation.
              </p>
            </div>
          )}

          {/* Signal Log */}
          {(account.signal_log?.length ?? 0) > 0 && (
            <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #21262d", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3fb950", boxShadow: "0 0 6px #3fb950" }} className="pulse" />
                <p style={{ fontWeight: 700, fontSize: 14, color: "#e6edf3" }}>Live Signal Log</p>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#8b949e" }}>newest first · updates every 15s</span>
              </div>
              <div style={{ padding: "12px 0", maxHeight: 480, overflowY: "auto", fontFamily: "monospace" }}>
                {account.signal_log!.map((entry, idx) => {
                  const colors: Record<string, string> = {
                    trend:   "#8b949e",
                    pattern: "#d2a8ff",
                    skip:    "#6e7681",
                    wait:    "#e3b341",
                    entry:   "#3fb950",
                    exit:    "#f78166",
                    info:    "#58a6ff",
                  };
                  const color = colors[entry.type] ?? "#e6edf3";
                  const date = new Date(entry.ts);
                  const timeStr = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={idx} style={{
                      display: "flex", gap: 12, padding: "7px 20px",
                      borderBottom: "1px solid #161b22",
                      opacity: entry.type === "skip" ? 0.5 : 1,
                    }}>
                      <span style={{ color: "#484f58", fontSize: 12, flexShrink: 0, paddingTop: 1 }}>{timeStr}</span>
                      <span style={{ color, fontSize: 13, lineHeight: 1.5 }}>{entry.msg}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "var(--muted)" }}>
            {account.started_at && <span>Started {new Date(account.started_at).toLocaleDateString()}</span>}
            {account.last_run   && <span>Last updated {new Date(account.last_run).toLocaleTimeString()}</span>}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
