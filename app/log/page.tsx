"use client";
import { useEffect, useState } from "react";
import type { BotEvent } from "@/lib/types";

const KIND_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  entry:  { icon: "▲", color: "var(--green)",  bg: "rgba(16,185,129,.08)"  },
  exit:   { icon: "▼", color: "var(--red)",    bg: "rgba(239,68,68,.08)"   },
  signal: { icon: "⚡", color: "var(--blue2)", bg: "rgba(59,130,246,.08)"  },
  info:   { icon: "·",  color: "var(--muted)", bg: "transparent"           },
  error:  { icon: "✕", color: "var(--red)",    bg: "rgba(239,68,68,.06)"   },
};

export default function LogPage() {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const load = () => fetch("/api/events").then(r => r.json()).then(setEvents).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === "all" ? events : events.filter(e => e.kind === filter);

  return (
    <div style={{ padding: 28, maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Event Log</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>{events.length} events · auto-refreshes every 3s</p>
        </div>
        <button onClick={() => { fetch("/api/events", { method: "DELETE" }); setEvents([]); }} style={{
          padding: "8px 16px", borderRadius: 9, fontSize: 12, cursor: "pointer",
          background: "rgba(239,68,68,.1)", color: "var(--red)", border: "1px solid rgba(239,68,68,.2)",
        }}>Clear log</button>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {["all", "signal", "entry", "exit", "info", "error"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filter === f ? "var(--blue)" : "transparent",
            color: filter === f ? "#fff" : "var(--muted)", border: "none",
          }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No events. Run the bot and events will stream here.</p>
        </div>
      ) : (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          {filtered.map((e, i) => {
            const s = KIND_STYLES[e.kind] ?? KIND_STYLES.info;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "10px 16px", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                background: s.bg,
              }}>
                <span style={{ color: s.color, width: 16, textAlign: "center", flexShrink: 0, marginTop: 2 }}>{s.icon}</span>
                <span className="num" style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap", marginTop: 3, width: 160, flexShrink: 0 }}>
                  {new Date(e.ts).toLocaleString()}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "var(--text)", fontSize: 13 }}>{e.message}</p>
                  {e.data && Object.keys(e.data).length > 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 10, marginTop: 3, fontFamily: "monospace" }}>
                      {JSON.stringify(e.data)}
                    </p>
                  )}
                </div>
                <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: s.color, background: s.bg, border: `1px solid ${s.color}33`, flexShrink: 0 }}>
                  {e.kind.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
