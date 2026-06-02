"use client";
import { useEffect, useState } from "react";
import type { BotEvent, TradeEvent } from "@/lib/types";

const fmt = (n: number, d = 2) => n.toFixed(d);
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour12: false });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "2-digit" });

const KIND: Record<string, { bg: string; color: string; label: string }> = {
  entry:     { bg: "rgba(16,185,129,.15)",  color: "var(--green)",  label: "ENTRY" },
  exit:      { bg: "rgba(59,130,246,.15)",  color: "var(--blue)",   label: "EXIT" },
  signal:    { bg: "rgba(245,158,11,.15)",  color: "var(--yellow)", label: "SIGNAL" },
  breakeven: { bg: "rgba(139,92,246,.15)",  color: "var(--purple)", label: "B/E" },
  error:     { bg: "rgba(239,68,68,.15)",   color: "var(--red)",    label: "ERROR" },
  info:      { bg: "rgba(71,85,105,.25)",   color: "var(--muted)",  label: "INFO" },
};

export default function LogPage() {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [live, setLive]     = useState(true);
  const [lastPoll, setLP]   = useState<Date | null>(null);

  async function poll() {
    const data = await fetch("/api/events", { cache: "no-store" }).then(r => r.json()).catch(() => []);
    setEvents(data); setLP(new Date());
  }

  async function clear() {
    if (!confirm("Clear all events?")) return;
    await fetch("/api/events", { method: "DELETE" });
    setEvents([]);
  }

  useEffect(() => {
    poll();
    if (!live) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [live]);

  const filtered = filter === "all" ? events : events.filter(e => e.kind === filter);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Event Log</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {lastPoll ? `Updated ${fmtTime(lastPoll.toISOString())}` : "Connecting…"} · {events.length} events
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLive(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
            style={{ background: live ? "var(--blue-dim)" : "var(--card)", border: `1px solid ${live ? "var(--blue)" : "var(--border)"}`, color: live ? "var(--blue)" : "var(--muted)" }}>
            {live ? "● LIVE" : "○ PAUSED"}
          </button>
          <button onClick={poll}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)" }}>↻</button>
          <button onClick={clear}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--red)" }}>Clear</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["all", ...Object.keys(KIND)].map(k => {
          const s = KIND[k];
          const active = filter === k;
          const count = k === "all" ? events.length : events.filter(e => e.kind === k).length;
          return (
            <button key={k} onClick={() => setFilter(k)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
              style={{
                background: active ? (s?.bg ?? "var(--blue-dim)") : "var(--card)",
                border: `1px solid ${active ? (s?.color ?? "var(--blue)") : "var(--border)"}`,
                color: active ? (s?.color ?? "var(--blue)") : "var(--muted)",
              }}>
              {k === "all" ? "All" : s.label}
              <span className="px-1 rounded text-[10px]" style={{ background: "rgba(255,255,255,.08)" }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        {/* Header row */}
        <div className="grid gap-3 px-5 py-2.5 text-[10px] uppercase tracking-widest"
          style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)", gridTemplateColumns: "90px 60px 1fr auto" }}>
          <span>Time</span><span>Type</span><span>Message</span><span>Details</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm" style={{ color: "var(--muted)" }}>No events</div>
        ) : (
          filtered.map(e => {
            const s = KIND[e.kind] ?? KIND.info;
            const trade = (e.kind === "entry" || e.kind === "exit") ? e as TradeEvent : null;
            return (
              <div key={e.id}
                className="grid gap-3 px-5 py-3 hover:bg-white/[.015] transition-colors slide-in"
                style={{ borderBottom: "1px solid var(--border)", gridTemplateColumns: "90px 60px 1fr auto" }}>
                <div>
                  <p className="text-[10px] num" style={{ color: "var(--muted)" }}>{fmtDate(e.ts)}</p>
                  <p className="text-xs num" style={{ color: "var(--text)" }}>{fmtTime(e.ts)}</p>
                </div>
                <div className="pt-0.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold num" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                </div>
                <p className="text-sm self-center" style={{ color: s.color }}>{e.message}</p>
                <div className="text-right self-center">
                  {trade?.data.pnl != null && (
                    <span className="text-sm font-bold num"
                      style={{ color: trade.data.pnl >= 0 ? "var(--green)" : "var(--red)" }}>
                      {trade.data.pnl >= 0 ? "+" : ""}${fmt(trade.data.pnl)}
                    </span>
                  )}
                  {trade?.data.direction && (
                    <p className="text-[10px] num mt-0.5" style={{ color: "var(--muted)" }}>
                      {trade.data.direction.toUpperCase()} · {trade.data.symbol} · {trade.data.timeframe}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
