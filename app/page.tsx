"use client";
import { useEffect, useState } from "react";
import EquityChart from "@/components/EquityChart";
import StatCard from "@/components/StatCard";
import type { BotEvent, BotStatus, BacktestResult, TradeEvent } from "@/lib/types";

const fmt = (n: number, d = 2) => n.toFixed(d);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour12: false });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });

const KIND: Record<string, { bg: string; color: string; label: string }> = {
  entry:     { bg: "rgba(16,185,129,.15)",  color: "var(--green)",  label: "ENTRY" },
  exit:      { bg: "rgba(59,130,246,.15)",  color: "var(--blue)",   label: "EXIT" },
  signal:    { bg: "rgba(245,158,11,.15)",  color: "var(--yellow)", label: "SIGNAL" },
  breakeven: { bg: "rgba(139,92,246,.15)",  color: "var(--purple)", label: "B/E" },
  error:     { bg: "rgba(239,68,68,.15)",   color: "var(--red)",    label: "ERROR" },
  info:      { bg: "rgba(71,85,105,.25)",   color: "var(--muted)",  label: "INFO" },
};

function Badge({ kind }: { kind: string }) {
  const s = KIND[kind] ?? KIND.info;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold num tracking-wider" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}
function Pill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>
      <span className="text-xs font-semibold num" style={{ color: color ?? "var(--text)" }}>{value}</span>
    </span>
  );
}

export default function Overview() {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [live, setLive]     = useState(true);
  const [lastPoll, setLP]   = useState<Date | null>(null);

  async function poll() {
    const [ev, st, bt] = await Promise.all([
      fetch("/api/events",  { cache: "no-store" }).then(r => r.json()).catch(() => []),
      fetch("/api/status",  { cache: "no-store" }).then(r => r.json()).catch(() => null),
      fetch("/api/backtest",{ cache: "no-store" }).then(r => r.json()).catch(() => null),
    ]);
    setEvents(ev); setStatus(st); setResult(bt); setLP(new Date());
  }

  useEffect(() => {
    poll();
    if (!live) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [live]);

  const exits   = events.filter(e => e.kind === "exit")  as TradeEvent[];
  const entries = events.filter(e => e.kind === "entry") as TradeEvent[];
  const pnl     = exits.reduce((a, e) => a + (e.data.pnl ?? 0), 0);
  const wins    = exits.filter(e => (e.data.pnl ?? 0) > 0).length;
  const wr      = exits.length ? (wins / exits.length) * 100 : 0;
  const curve   = result?.equity_curve?.length
    ? result.equity_curve
    : [10000, ...[...exits].reverse().map(e => e.data.equity ?? 10000)];
  const openTrade = entries.find(e => !exits.some(x => new Date(x.ts) > new Date(e.ts)));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Overview</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {lastPoll ? `Updated ${fmtTime(lastPoll.toISOString())}` : "Connecting…"}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLive(v => !v)} className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all" style={{ background: live ? "var(--blue-dim)" : "var(--card)", border: `1px solid ${live ? "var(--blue)" : "var(--border)"}`, color: live ? "var(--blue)" : "var(--muted)" }}>
            {live ? "● LIVE" : "○ PAUSED"}
          </button>
          <button onClick={poll} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)" }}>↻</button>
        </div>
      </div>

      {/* Status bar */}
      {status && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-5 flex-wrap" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <span className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.running ? "pulse" : ""}`} style={{ background: status.running ? "var(--green)" : "var(--muted)" }} />
            <span className="text-sm font-medium">{status.running ? "Running" : "Idle"}</span>
          </span>
          <Pill label="Mode"   value={status.mode.toUpperCase()} />
          <Pill label="Symbol" value={status.symbol} />
          <Pill label="TF"     value={status.timeframe} />
          <Pill label="Broker" value={status.broker_connected ? `${status.broker} ✓` : "Not connected"} color={status.broker_connected ? "var(--green)" : "var(--muted)"} />
        </div>
      )}

      {/* Open trade */}
      {openTrade && (
        <div className="rounded-xl px-4 py-3 slide-in flex items-center gap-3" style={{ background: "rgba(16,185,129,.07)", border: "1px solid rgba(16,185,129,.3)" }}>
          <span className="w-2 h-2 rounded-full pulse" style={{ background: "var(--green)" }} />
          <span className="text-sm font-semibold num" style={{ color: "var(--green)" }}>
            OPEN {openTrade.data.direction?.toUpperCase()} · Entry ${fmt(openTrade.data.entry_price ?? 0)} · SL ${fmt(openTrade.data.stop_loss ?? 0)} · TP ${fmt(openTrade.data.take_profit ?? 0)}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Net P&L"  value={`$${fmt(pnl)}`} color={pnl >= 0 ? "green" : "red"} glow={Math.abs(pnl) > 0} />
        <StatCard label="Win Rate" value={exits.length ? `${fmt(wr, 1)}%` : "—"} color={wr >= 50 ? "green" : exits.length ? "red" : "default"} />
        <StatCard label="Trades"   value={String(exits.length)} sub={`${wins}W · ${exits.length - wins}L`} />
        <StatCard label="Equity"   value={`$${fmt(curve[curve.length - 1] ?? 10000)}`} color="blue" />
      </div>

      {/* Chart */}
      <div className="rounded-xl p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm font-semibold">Equity Curve</p>
          <p className="text-xs num" style={{ color: "var(--muted)" }}>$10,000 → ${fmt(curve[curve.length - 1] ?? 10000)}</p>
        </div>
        <EquityChart points={curve} height={160} />
      </div>

      {/* Event log (last 20) */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 flex justify-between items-center" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-sm font-semibold">Recent Events</p>
          <span className="text-xs num px-2 py-0.5 rounded" style={{ background: "var(--dim)", color: "var(--muted)" }}>{events.length}</span>
        </div>
        {events.length === 0
          ? <div className="py-14 text-center text-sm" style={{ color: "var(--muted)" }}>No events yet<br /><code className="text-xs mt-1 block opacity-50">cd bot && python main.py --tf 4h</code></div>
          : events.slice(0, 20).map(e => (
            <div key={e.id} className="flex gap-3 items-start px-5 py-3 hover:bg-white/[.02] transition-colors" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-16 shrink-0 text-right">
                <p className="text-[10px] num" style={{ color: "var(--muted)" }}>{fmtDate(e.ts)}</p>
                <p className="text-[10px] num" style={{ color: "var(--muted)" }}>{fmtTime(e.ts)}</p>
              </div>
              <div className="w-14 shrink-0 pt-0.5"><Badge kind={e.kind} /></div>
              <p className="text-sm flex-1" style={{ color: KIND[e.kind]?.color ?? "var(--text)" }}>{e.message}</p>
            </div>
          ))
        }
      </div>
    </div>
  );
}
