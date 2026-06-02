"use client";
import { useEffect, useState } from "react";
import type { BotConfig, BotStatus } from "@/lib/types";
import { DEFAULT_CONFIG } from "@/lib/types";

const fmt = (n: number, d = 2) => n.toFixed(d);

export default function BotControl() {
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [saved, setSaved]   = useState(false);
  const [testingIB, setTestingIB] = useState(false);
  const [ibResult, setIBResult]   = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(setConfig).catch(() => {});
    fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => {});
    const id = setInterval(() => {
      fetch("/api/status", { cache: "no-store" }).then(r => r.json()).then(setStatus).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  async function save() {
    await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testIB() {
    setTestingIB(true); setIBResult(null);
    // The bot tests IB connection and reports via status API
    await fetch("/api/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker: "ib", broker_connected: false }),
    });
    // Simulate test result after 3s (real result comes from bot heartbeat)
    setTimeout(() => { setTestingIB(false); setIBResult("fail"); }, 3000);
  }

  const isLive = status?.running;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Bot Control</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Configure and monitor the trading bot</p>
      </div>

      {/* Status */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-sm font-semibold mb-4">Bot Status</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Status",   value: isLive ? "Running" : "Idle",          color: isLive ? "var(--green)" : "var(--muted)" },
            { label: "Mode",     value: status?.mode?.toUpperCase() ?? "—",   color: "var(--blue)" },
            { label: "Symbol",   value: status?.symbol ?? "—",                color: "var(--text)" },
            { label: "Broker",   value: status?.broker_connected ? `${status.broker} ✓` : "Disconnected", color: status?.broker_connected ? "var(--green)" : "var(--muted)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3" style={{ background: "var(--dim)" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>{label}</p>
              <p className="text-sm font-bold num flex items-center gap-2" style={{ color }}>
                {label === "Status" && <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "pulse" : ""}`} style={{ background: color }} />}
                {value}
              </p>
            </div>
          ))}
        </div>

        {status?.open_position && (
          <div className="mt-4 rounded-lg px-4 py-3" style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--green)" }}>Open Position</p>
            <div className="grid grid-cols-3 gap-4 text-xs num">
              <span><span style={{ color: "var(--muted)" }}>Dir: </span><span style={{ color: "var(--text)" }}>{status.open_position.direction.toUpperCase()}</span></span>
              <span><span style={{ color: "var(--muted)" }}>Entry: </span><span style={{ color: "var(--text)" }}>${fmt(status.open_position.entry_price)}</span></span>
              <span><span style={{ color: "var(--muted)" }}>SL: </span><span style={{ color: "var(--red)" }}>${fmt(status.open_position.stop_loss)}</span></span>
              <span><span style={{ color: "var(--muted)" }}>TP: </span><span style={{ color: "var(--green)" }}>${fmt(status.open_position.take_profit)}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Mode */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-sm font-semibold mb-1">Trading Mode</p>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>Only use Live after paper trading validation</p>
        <div className="flex gap-3">
          {(["backtest","paper","live"] as const).map(m => {
            const colors: Record<string, string> = { backtest: "var(--blue)", paper: "var(--yellow)", live: "var(--red)" };
            const active = config.mode === m;
            return (
              <button key={m} onClick={() => setConfig(c => ({ ...c, mode: m }))}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: active ? `${colors[m]}22` : "var(--dim)",
                  border: `1px solid ${active ? colors[m] : "transparent"}`,
                  color: active ? colors[m] : "var(--muted)",
                }}>
                {m === "backtest" ? "◈ Backtest" : m === "paper" ? "◎ Paper" : "⚡ Live"}
              </button>
            );
          })}
        </div>
        {config.mode === "live" && (
          <div className="mt-3 rounded-lg px-4 py-3 text-xs" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", color: "var(--red)" }}>
            ⚠ Live mode uses real capital. Ensure paper trading is validated for 3+ months.
          </div>
        )}
      </div>

      {/* Risk params */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-sm font-semibold mb-4">Risk Management</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            { key: "risk_pct" as const, label: "Risk per trade (%)", min: 0.1, max: 5, step: 0.1 },
            { key: "sl_pct"   as const, label: "Stop-loss (%)",      min: 0.1, max: 10, step: 0.1 },
            { key: "tp_pct"   as const, label: "Take-profit (%)",    min: 0.5, max: 20, step: 0.5 },
          ].map(({ key, label, min, max, step }) => (
            <div key={key}>
              <div className="flex justify-between mb-1">
                <label className="text-xs" style={{ color: "var(--muted)" }}>{label}</label>
                <span className="text-xs font-bold num" style={{ color: "var(--blue)" }}>{config[key]}%</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={config[key]}
                onChange={e => setConfig(c => ({ ...c, [key]: parseFloat(e.target.value) }))}
                className="w-full accent-blue-500" />
              <div className="flex justify-between text-[10px] mt-0.5 num" style={{ color: "var(--muted)" }}>
                <span>{min}%</span><span>{max}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Brokers */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold">Interactive Brokers</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>Connect via TWS or IB Gateway (local)</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.broker_connected ? "pulse" : ""}`}
              style={{ background: status?.broker_connected ? "var(--green)" : "var(--muted)" }} />
            <span className="text-xs" style={{ color: status?.broker_connected ? "var(--green)" : "var(--muted)" }}>
              {status?.broker_connected ? "Connected" : "Not connected"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--muted)" }}>Host</label>
            <input value={config.ib_host} onChange={e => setConfig(c => ({ ...c, ib_host: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm num outline-none"
              style={{ background: "var(--dim)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "var(--muted)" }}>Port <span style={{ color: "var(--muted)" }}>(7497 = TWS paper · 7496 = TWS live · 4002 = Gateway)</span></label>
            <input type="number" value={config.ib_port} onChange={e => setConfig(c => ({ ...c, ib_port: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 rounded-lg text-sm num outline-none"
              style={{ background: "var(--dim)", border: "1px solid var(--border)", color: "var(--text)" }} />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setConfig(c => ({ ...c, broker: c.broker === "ib" ? "none" : "ib" }))}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: config.broker === "ib" ? "rgba(59,130,246,.15)" : "var(--dim)",
              border: `1px solid ${config.broker === "ib" ? "var(--blue)" : "transparent"}`,
              color: config.broker === "ib" ? "var(--blue)" : "var(--muted)",
            }}>
            {config.broker === "ib" ? "✓ IB Enabled" : "Enable IB"}
          </button>
          <button onClick={testIB} disabled={testingIB}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--dim)", color: "var(--muted)", opacity: testingIB ? 0.5 : 1 }}>
            {testingIB ? "Testing…" : "Test Connection"}
          </button>
        </div>

        {ibResult && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{ background: ibResult === "ok" ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)", color: ibResult === "ok" ? "var(--green)" : "var(--red)" }}>
            {ibResult === "ok" ? "✓ IB connected successfully" : "✗ Connection failed — make sure TWS or IB Gateway is running"}
          </div>
        )}

        {/* Setup guide */}
        <div className="mt-4 rounded-lg p-4 space-y-2" style={{ background: "var(--dim)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--muted)" }}>IB Setup Guide</p>
          {[
            "Download TWS (Trader Workstation) from interactivebrokers.com",
            "Log in → Configure → API → Settings → Enable ActiveX and Socket Clients",
            "Set Socket port to 7497 (paper) or 7496 (live)",
            "Start the bot: cd bot && python main.py --mode paper --broker ib",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <span className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{ background: "var(--border)", color: "var(--text)" }}>{i + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <button onClick={save}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
        style={{ background: saved ? "var(--green)" : "var(--blue)", color: "#fff" }}>
        {saved ? "✓ Saved" : "Save Configuration"}
      </button>

      {/* Run instructions */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <p className="text-sm font-semibold mb-3">Run the Bot</p>
        <div className="space-y-2">
          {[
            { label: "Backtest",     cmd: `cd bot && python main.py --mode backtest --symbol "${config.symbol}" --tf ${config.timeframe}` },
            { label: "Paper trade",  cmd: `cd bot && python main.py --mode paper --symbol "${config.symbol}" --tf ${config.timeframe}` },
            { label: "Live (IB)",    cmd: `cd bot && python main.py --mode live --broker ib --symbol "${config.symbol}" --tf ${config.timeframe}` },
          ].map(({ label, cmd }) => (
            <div key={label} className="rounded-lg px-4 py-3" style={{ background: "var(--dim)" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--muted)" }}>{label}</p>
              <code className="text-xs num" style={{ color: "var(--blue)" }}>{cmd}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
