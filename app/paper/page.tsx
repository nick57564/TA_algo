"use client";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import EquityChart from "@/components/EquityChart";

interface PaperAccount {
  balance: number;
  equity: number;
  unrealized_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  net_pnl: number;
  equity_curve: number[];
  position?: {
    direction: "long" | "short";
    size: number;
    entry_price: number;
    unrealized_pnl: number;
  } | null;
}

const SETUP_STEPS = [
  { n: 1, title: "Create testnet wallet",  desc: "Go to app.hyperliquid-testnet.xyz and connect MetaMask" },
  { n: 2, title: "Get $10,000 fake USDC",  desc: 'Click "Get testnet funds" on the site — instant, free' },
  { n: 3, title: "Add keys to config",     desc: "Paste wallet address & private key into bot/config.py"  },
  { n: 4, title: "Start paper trading",    desc: "Run: cd bot && python main.py --mode paper"              },
];

export default function PaperPage() {
  const [account, setAccount] = useState<PaperAccount | null>(null);

  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/paper/account").then(x => x.json()).catch(() => null);
      if (r) setAccount(r);
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const fmt = (n: number, d = 2) => n?.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) ?? "—";

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,.12)", color: "var(--green)", border: "1px solid rgba(16,185,129,.2)" }}>TESTNET</span>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Paper Trading</h1>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Hyperliquid testnet · $10,000 fake USDC · no real money at risk</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {account && (
            <button onClick={() => fetch("/api/paper/account", { method: "DELETE" })} style={{
              padding: "8px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer",
              background: "var(--dim)", color: "var(--muted)", border: "1px solid var(--border)",
            }}>Reset</button>
          )}
        </div>
      </div>

      {account ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Account stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard label="Balance"       value={`$${fmt(account.balance)}`}     color="blue"  glow />
            <StatCard label="Equity"        value={`$${fmt(account.equity)}`}      color={account.equity >= 10000 ? "green" : "red"} />
            <StatCard label="Unrealized P&L" value={`${account.unrealized_pnl >= 0 ? "+" : ""}$${fmt(account.unrealized_pnl)}`} color={account.unrealized_pnl >= 0 ? "green" : "red"} />
            <StatCard label="Net P&L"       value={`${account.net_pnl >= 0 ? "+" : ""}$${fmt(account.net_pnl)}`} color={account.net_pnl >= 0 ? "green" : "red"} glow />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <StatCard label="Trades"  value={String(account.total_trades)} sub={`${account.wins}W · ${account.losses}L`} />
            <StatCard label="Win Rate" value={account.total_trades ? `${((account.wins / account.total_trades) * 100).toFixed(1)}%` : "—"} color={account.wins / account.total_trades >= 0.5 ? "green" : "red"} />
            <StatCard label="Return"   value={`${((account.equity - 10000) / 100).toFixed(2)}%`} color={account.equity >= 10000 ? "green" : "red"} />
          </div>

          {/* Open position */}
          {account.position && (
            <div style={{
              background: account.position.direction === "long" ? "rgba(16,185,129,.06)" : "rgba(239,68,68,.06)",
              border: `1px solid ${account.position.direction === "long" ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)"}`,
              borderRadius: 14, padding: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div className="pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: account.position.direction === "long" ? "var(--green)" : "var(--red)" }} />
                <p style={{ fontWeight: 600, fontSize: 14 }}>Open Position</p>
                <span style={{
                  padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: account.position.direction === "long" ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)",
                  color: account.position.direction === "long" ? "var(--green)" : "var(--red)",
                }}>{account.position.direction.toUpperCase()}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <div><p style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Size</p><p className="num" style={{ fontWeight: 600 }}>{account.position.size} BTC</p></div>
                <div><p style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Entry Price</p><p className="num" style={{ fontWeight: 600 }}>${fmt(account.position.entry_price)}</p></div>
                <div><p style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Unrealized P&L</p>
                  <p className="num" style={{ fontWeight: 600, color: account.position.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                    {account.position.unrealized_pnl >= 0 ? "+" : ""}${fmt(account.position.unrealized_pnl)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Equity curve */}
          {account.equity_curve?.length > 1 && (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontWeight: 600 }}>Equity Curve</p>
                <p className="num" style={{ fontSize: 12, color: "var(--muted)" }}>$10,000 start</p>
              </div>
              <EquityChart points={account.equity_curve} height={160} />
            </div>
          )}
        </div>
      ) : (
        /* Setup guide */
        <div>
          <div style={{ background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.15)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
            <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Paper trading not running yet</p>
            <p style={{ color: "var(--muted)", fontSize: 13 }}>Follow the steps below to start with $10,000 in fake USDC on the Hyperliquid testnet. Same exchange, same API — no real money.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {SETUP_STEPS.map(s => (
              <div key={s.n} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--blue2)", flexShrink: 0 }}>{s.n}</div>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</p>
                  <p style={{ color: "var(--muted)", fontSize: 13 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.07em" }}>Run command</p>
            <code style={{ fontSize: 13, color: "var(--green)", fontFamily: "monospace" }}>
              <span style={{ color: "var(--muted)" }}>$ </span>cd bot && python main.py --mode paper
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
