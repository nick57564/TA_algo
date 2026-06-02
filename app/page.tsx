"use client";

import { useEffect, useRef, useState } from "react";
import type { BotEvent, TradeEvent } from "@/lib/types";

const POLL_MS = 3000;

function isTrade(e: BotEvent): e is TradeEvent {
  return e.kind === "entry" || e.kind === "exit";
}

function kindBadge(kind: BotEvent["kind"]) {
  const base = "px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide";
  switch (kind) {
    case "entry":     return `${base} bg-emerald-900 text-emerald-300`;
    case "exit":      return `${base} bg-sky-900 text-sky-300`;
    case "signal":    return `${base} bg-yellow-900 text-yellow-300`;
    case "breakeven": return `${base} bg-purple-900 text-purple-300`;
    case "error":     return `${base} bg-red-900 text-red-300`;
    default:          return `${base} bg-slate-800 text-slate-400`;
  }
}

function kindColor(kind: BotEvent["kind"]) {
  switch (kind) {
    case "entry":     return "text-emerald-400";
    case "exit":      return "text-sky-400";
    case "signal":    return "text-yellow-400";
    case "breakeven": return "text-purple-400";
    case "error":     return "text-red-400";
    default:          return "text-slate-400";
  }
}

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-AU", { hour12: false });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}

function EquityChart({ points }: { points: number[] }) {
  const W = 600, H = 120, PAD = 8;
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-[120px] text-slate-600 text-sm">
        Waiting for trades…
      </div>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = points.map((v) => H - PAD - ((v - min) / range) * (H - PAD * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
  const fill = [...xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`),
    `L${xs[xs.length - 1]},${H} L${xs[0]},${H} Z`].join(" ");
  const positive = (points[points.length - 1] ?? 0) >= points[0];
  const stroke = positive ? "#34d399" : "#f87171";
  const fillColor = positive ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]" preserveAspectRatio="none">
      <path d={fill} fill={fillColor} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="3" fill={stroke} />
    </svg>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: "emerald" | "red" }) {
  const valColor = color === "emerald" ? "text-emerald-400" : color === "red" ? "text-red-400" : "text-slate-100";
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3">
      <p className="text-slate-500 text-xs uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold ${valColor}`}>{value}</p>
    </div>
  );
}

function Stats({ events }: { events: BotEvent[] }) {
  const exits = events.filter((e) => e.kind === "exit") as TradeEvent[];
  const entries = events.filter((e) => e.kind === "entry") as TradeEvent[];
  if (exits.length === 0 && entries.length === 0) return null;

  const wins = exits.filter((e) => e.data.pnl != null && e.data.pnl > 0);
  const winrate = exits.length ? (wins.length / exits.length) * 100 : 0;
  const totalPnl = exits.reduce((acc, e) => acc + (e.data.pnl ?? 0), 0);
  const latestEquity = exits[0]?.data.equity;

  const openTrade = entries.find((e) => {
    const entryTs = new Date(e.ts).getTime();
    return !exits.some((x) => new Date(x.ts).getTime() > entryTs);
  });

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <StatCard label="Closed trades" value={String(exits.length)} />
      <StatCard label="Win rate" value={exits.length ? `${fmt(winrate, 1)}%` : "—"} color={winrate >= 50 ? "emerald" : "red"} />
      <StatCard label="Net P&L" value={exits.length ? `$${fmt(totalPnl)}` : "—"} color={totalPnl >= 0 ? "emerald" : "red"} />
      <StatCard label="Equity" value={latestEquity != null ? `$${fmt(latestEquity)}` : "—"} />
      {openTrade && (
        <div className="col-span-2 sm:col-span-4 bg-emerald-950 border border-emerald-700 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-300 text-sm font-semibold">
            OPEN {openTrade.data.direction?.toUpperCase()} @${fmt(openTrade.data.entry_price ?? 0)}
            {" — "}SL ${fmt(openTrade.data.stop_loss ?? 0)} / TP ${fmt(openTrade.data.take_profit ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}

function LogRow({ event }: { event: BotEvent }) {
  const trade = isTrade(event) ? event : null;
  return (
    <div className="flex gap-3 items-start py-2.5 border-b border-slate-800 hover:bg-slate-900/50 px-1 transition-colors">
      <div className="w-[70px] shrink-0 text-right">
        <p className="text-slate-500 text-xs">{fmtDate(event.ts)}</p>
        <p className="text-slate-400 text-xs">{fmtTime(event.ts)}</p>
      </div>
      <div className="w-[72px] shrink-0 pt-0.5">
        <span className={kindBadge(event.kind)}>{event.kind}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${kindColor(event.kind)}`}>{event.message}</p>
        {trade?.data && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-slate-500">
            {trade.data.symbol && <span>{trade.data.symbol}</span>}
            {trade.data.timeframe && <span>{trade.data.timeframe}</span>}
            {trade.data.direction && (
              <span className={trade.data.direction === "long" ? "text-emerald-500" : "text-red-500"}>
                {trade.data.direction.toUpperCase()}
              </span>
            )}
            {trade.data.entry_price != null && <span>entry ${fmt(trade.data.entry_price)}</span>}
            {trade.data.exit_price != null && <span>exit ${fmt(trade.data.exit_price)}</span>}
            {trade.data.pnl != null && (
              <span className={trade.data.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                {trade.data.pnl >= 0 ? "+" : ""}${fmt(trade.data.pnl)}
                {trade.data.pnl_pct != null ? ` (${fmt(trade.data.pnl_pct * 100, 2)}%)` : ""}
              </span>
            )}
            {trade.data.exit_reason && (
              <span className="uppercase text-slate-600">{trade.data.exit_reason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const [live, setLive] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function poll() {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      if (res.ok) {
        setEvents(await res.json());
        setLastPoll(new Date());
      }
    } catch { /* keep last data on network error */ }
  }

  useEffect(() => {
    poll();
    if (live) intervalRef.current = setInterval(poll, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live]);

  const exitEvents = [...events].reverse().filter((e) => e.kind === "exit") as TradeEvent[];
  const equityCurve = [10_000, ...exitEvents.map((e) => e.data.equity ?? 10_000)];

  return (
    <main className="min-h-screen bg-[#0b0f17] text-slate-200 px-4 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            TA Algo <span className="text-slate-500 font-normal">/ BTC H&amp;S Strategy</span>
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">
            {lastPoll ? `Updated ${fmtTime(lastPoll.toISOString())}` : "Connecting…"}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setLive((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded border font-semibold transition-colors ${
              live ? "border-emerald-700 bg-emerald-950 text-emerald-400" : "border-slate-700 bg-slate-900 text-slate-400"
            }`}
          >
            {live ? "● LIVE" : "○ PAUSED"}
          </button>
          <button onClick={poll} className="text-xs px-3 py-1.5 rounded border border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors">
            Refresh
          </button>
        </div>
      </div>

      <Stats events={events} />

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6">
        <p className="text-slate-500 text-xs uppercase tracking-widest mb-3">Equity curve</p>
        <EquityChart points={equityCurve} />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>Start $10,000</span>
          <span>Current ${fmt(equityCurve[equityCurve.length - 1] ?? 10_000)}</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <p className="text-slate-400 text-xs uppercase tracking-widest">
            Event log <span className="text-slate-600">({events.length})</span>
          </p>
          <p className="text-slate-600 text-xs">refreshes every {POLL_MS / 1000}s</p>
        </div>
        <div className="px-2">
          {events.length === 0 ? (
            <div className="py-12 text-center text-slate-600 text-sm">
              No events yet — start the bot and they will appear here.
              <br />
              <code className="text-slate-500 text-xs mt-1 block">python main.py --tf 4h</code>
            </div>
          ) : (
            events.map((e) => <LogRow key={e.id} event={e} />)
          )}
        </div>
      </div>
    </main>
  );
}
