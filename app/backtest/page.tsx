"use client";
import { useEffect, useState } from "react";
import EquityChart from "@/components/EquityChart";
import StatCard from "@/components/StatCard";
import type { BacktestResult, BotConfig } from "@/lib/types";

const SYMBOLS = ["BTC/USDT","ETH/USDT","SOL/USDT","AAPL","MSFT","NVDA","SPY","QQQ","EUR/USD","GBP/USD"];
const TIMEFRAMES = ["1h","4h","1d","1w"];
const fmt = (n: number, d = 2) => n.toFixed(d);

export default function BacktestPage() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [symbol, setSymbol] = useState("BTC/USDT");
  const [tf, setTf]         = useState("4h");
  const [limit, setLimit]   = useState(500);
  const [copied, setCopied] = useState<"cmd"|"webhook"|null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then((c: BotConfig) => {
      setSymbol(c.symbol); setTf(c.timeframe);
    }).catch(() => {});
    fetch("/api/backtest").then(r => r.json()).then(d => { if (d) setResult(d); }).catch(() => {});
  }, []);

  async function saveAndPoll() {
    // Save config so bot can read it
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, timeframe: tf, mode: "backtest" }),
    }).catch(() => {});

    // Start polling for results the bot will push to /api/backtest
    setPolling(true);
    let attempts = 0;
    const id = setInterval(async () => {
      attempts++;
      const r = await fetch("/api/backtest", { cache: "no-store" }).then(x => x.json()).catch(() => null);
      if (r && r.symbol === symbol && r.timeframe === tf) {
        setResult(r); setPolling(false); clearInterval(id);
      }
      if (attempts > 90) { setPolling(false); clearInterval(id); } // 3 min timeout
    }, 2000);
  }

  const cmd = `cd bot && python main.py --mode backtest --symbol "${symbol}" --tf ${tf} --limit ${limit}`;
  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/event`
    : "https://your-app.vercel.app/api/event";

  function copy(text: string, key: "cmd"|"webhook") {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const months = result ? Object.entries(result.monthly_returns).sort() : [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Backtest</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Run H&S strategy on historical data — bot runs on your machine, results appear here</p>
      </div>

      {/* How it works banner */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)" }}>
        <span className="text-base mt-0.5">ℹ</span>
        <div className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
          <p><span style={{ color: "var(--blue)" }}>How it works:</span> The backtest runs on your local machine (Python needs pandas + ccxt). Results are automatically pushed to this dashboard via the API. Vercel hosts the UI only — Python runs locally.</p>
          <p>Vercel can&apos;t run the backtest directly because it requires heavy libraries (pandas, ccxt, numpy) and takes 30–60 seconds — beyond serverless limits.</p>
        </div>
      </div>

      {/* Config */}
      <div className="rounded-xl p-5 space-y-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-sm font-semibold">Configuration</p>

        {/* Symbol */}
        <div>
          <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "var(--muted)" }}>Symbol</label>
          <div className="flex flex-wrap gap-2">
            {SYMBOLS.map(s => (
              <button key={s} onClick={() => setSymbol(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: symbol === s ? "var(--blue)" : "var(--dim)",
                  color: symbol === s ? "#fff" : "var(--muted)",
                  border: `1px solid ${symbol === s ? "var(--blue)" : "transparent"}`,
                }}>
                {s}
              </button>
            ))}
            <input
              value={SYMBOLS.includes(symbol) ? "" : symbol}
              onChange={e => e.target.value && setSymbol(e.target.value)}
              placeholder="Custom…"
              className="px-3 py-1.5 rounded-lg text-xs outline-none w-28"
              style={{ background: "var(--dim)", color: "var(--text)", border: "1px solid var(--border)" }} />
          </div>
        </div>

        {/* Timeframe */}
        <div>
          <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "var(--muted)" }}>Timeframe</label>
          <div className="flex gap-2">
            {TIMEFRAMES.map(t => (
              <button key={t} onClick={() => setTf(t)}
                className="px-5 py-2 rounded-lg text-xs font-bold num transition-all"
                style={{
                  background: tf === t ? "var(--blue)" : "var(--dim)",
                  color: tf === t ? "#fff" : "var(--muted)",
                  border: `1px solid ${tf === t ? "var(--blue)" : "transparent"}`,
                }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Candles */}
        <div>
          <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "var(--muted)" }}>
            Candles <span className="num" style={{ color: "var(--blue)" }}>{limit}</span>
          </label>
          <input type="range" min={100} max={1000} step={50} value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="w-48 accent-blue-500" />
        </div>

        {/* Command box */}
        <div>
          <label className="text-xs uppercase tracking-widest mb-2 block" style={{ color: "var(--muted)" }}>
            Run this command on your machine
          </label>
          <div className="rounded-lg flex items-center gap-3 px-4 py-3"
            style={{ background: "#0a0a14", border: "1px solid var(--border)" }}>
            <code className="text-xs num flex-1 break-all" style={{ color: "var(--green)" }}>
              <span style={{ color: "var(--muted)" }}>$ </span>{cmd}
            </code>
            <button onClick={() => copy(cmd, "cmd")}
              className="text-xs px-2.5 py-1 rounded shrink-0 transition-all"
              style={{ background: copied === "cmd" ? "var(--green)" : "var(--dim)", color: "#fff" }}>
              {copied === "cmd" ? "✓" : "Copy"}
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Results will appear below automatically once the bot finishes.
          </p>
        </div>

        {/* Poll button */}
        <div className="flex items-center gap-3">
          <button onClick={saveAndPoll} disabled={polling}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: polling ? "var(--dim)" : "var(--blue)",
              color: polling ? "var(--muted)" : "#fff",
              cursor: polling ? "not-allowed" : "pointer",
            }}>
            {polling ? "⏳ Waiting for results…" : "▶ Save config & watch for results"}
          </button>
          {polling && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Checking every 2s — run the command above to start
            </p>
          )}
        </div>
      </div>

      {/* TradingView webhook */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">TradingView Webhook</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Paste in TradingView Alerts → Notifications → Webhook URL
            </p>
          </div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "rgba(59,130,246,.15)", color: "var(--blue)" }}>TV</div>
        </div>

        <div className="rounded-lg px-3 py-2.5 flex items-center gap-3"
          style={{ background: "var(--dim)", border: "1px solid var(--border)" }}>
          <code className="text-xs num flex-1 truncate" style={{ color: "var(--blue)" }}>{webhookUrl}</code>
          <button onClick={() => copy(webhookUrl, "webhook")}
            className="text-xs px-2.5 py-1 rounded shrink-0 transition-all"
            style={{ background: copied === "webhook" ? "var(--green)" : "var(--border)", color: "#fff" }}>
            {copied === "webhook" ? "✓ Copied" : "Copy"}
          </button>
        </div>

        <div className="rounded-lg p-3" style={{ background: "var(--dim)" }}>
          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Alert Message (JSON)</p>
          <pre className="text-xs num" style={{ color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{`{"kind":"signal","message":"{{strategy.order.action}} on {{ticker}} {{interval}}","data":{"symbol":"{{ticker}}","timeframe":"{{interval}}","direction":"{{strategy.order.action}}"}}`}</pre>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          {["Create alert in TradingView", "Paste webhook URL above", "Paste JSON message → Save"].map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--dim)", color: "var(--muted)" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={{ background: "var(--blue)", color: "#fff" }}>{i+1}</span>
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-5 slide-in">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Results — <span className="num" style={{ color: "var(--blue)" }}>{result.symbol}</span>
              <span className="mx-2" style={{ color: "var(--muted)" }}>·</span>
              <span className="num">{result.timeframe?.toUpperCase()}</span>
            </p>
            <p className="text-xs num" style={{ color: "var(--muted)" }}>{new Date(result.ts).toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Win Rate"      value={`${fmt(result.winrate_pct, 1)}%`}      color={result.winrate_pct >= 50 ? "green" : "red"} glow />
            <StatCard label="Profit Factor" value={fmt(result.profit_factor)}              color={result.profit_factor >= 1 ? "green" : "red"} />
            <StatCard label="Max Drawdown"  value={`${fmt(result.max_drawdown_pct)}%`}    color={result.max_drawdown_pct > 15 ? "red" : "yellow"} />
            <StatCard label="Net P&L"       value={`$${fmt(result.net_pnl)}`}             color={result.net_pnl >= 0 ? "green" : "red"} glow />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Trades"    value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L`} />
            <StatCard label="Avg Win"         value={`$${fmt(result.avg_win)}`}  color="green" />
            <StatCard label="Avg Loss"        value={`$${fmt(result.avg_loss)}`} color="red" />
            <StatCard label="Worst Streak"    value={String(result.largest_losing_streak)} color="yellow" />
          </div>

          {result.equity_curve?.length > 1 && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-semibold">Equity Curve</p>
                <p className="text-xs num" style={{ color: "var(--muted)" }}>$10,000 → ${fmt(result.final_equity)}</p>
              </div>
              <EquityChart points={result.equity_curve} height={180} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Long trades</p>
              <p className="text-2xl font-bold num" style={{ color: "var(--green)" }}>{result.longs_count}</p>
              <p className="text-xs num mt-1" style={{ color: "var(--muted)" }}>Win rate {fmt(result.long_winrate_pct, 1)}%</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Short trades</p>
              <p className="text-2xl font-bold num" style={{ color: "var(--red)" }}>{result.shorts_count}</p>
              <p className="text-xs num mt-1" style={{ color: "var(--muted)" }}>Win rate {fmt(result.short_winrate_pct, 1)}%</p>
            </div>
          </div>

          {months.length > 0 && (
            <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="text-sm font-semibold mb-4">Monthly Returns</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {months.map(([month, pnl]) => (
                  <div key={month} className="rounded-lg p-2.5 text-center"
                    style={{ background: pnl >= 0 ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)", border: `1px solid ${pnl >= 0 ? "rgba(16,185,129,.2)" : "rgba(239,68,68,.2)"}` }}>
                    <p className="text-[10px]" style={{ color: "var(--muted)" }}>{month}</p>
                    <p className="text-xs font-bold num mt-0.5" style={{ color: pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                      {pnl >= 0 ? "+" : ""}${fmt(pnl, 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl p-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="text-2xl mb-2">◈</p>
          <p className="text-sm font-medium mb-1">No results yet</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Copy the command above, run it on your machine, and results will appear here automatically.</p>
        </div>
      )}
    </div>
  );
}
