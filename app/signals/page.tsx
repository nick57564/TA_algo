"use client";
import { useEffect, useState } from "react";
import type { BotEvent } from "@/lib/types";

const DIRECTION_COLORS = {
  long:  { bg: "rgba(16,185,129,.1)",  border: "rgba(16,185,129,.25)",  text: "var(--green)"  },
  short: { bg: "rgba(239,68,68,.1)",   border: "rgba(239,68,68,.25)",   text: "var(--red)"    },
};

const KIND_STYLES: Record<string, { icon: string; color: string }> = {
  signal: { icon: "⚡", color: "var(--blue2)"  },
  entry:  { icon: "▲",  color: "var(--green)"  },
  exit:   { icon: "▼",  color: "var(--red)"    },
  info:   { icon: "·",  color: "var(--muted)"  },
  error:  { icon: "✕",  color: "var(--red)"    },
};

export default function SignalsPage() {
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [filter, setFilter] = useState<"all"|"signal"|"entry"|"exit">("all");

  useEffect(() => {
    const load = () => fetch("/api/events").then(r => r.json()).then(setEvents).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === "all" ? events : events.filter(e => e.kind === filter);
  const signals  = events.filter(e => e.kind === "signal");
  const entries  = events.filter(e => e.kind === "entry");
  const exits    = events.filter(e => e.kind === "exit");

  return (
    <div style={{ padding: 28, maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signals & Entries</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>Live feed of all bot signals, entries, and exits</p>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Signals", value: signals.length,  color: "blue"  as const },
          { label: "Entries",       value: entries.length,  color: "green" as const },
          { label: "Exits",         value: exits.length,    color: "red"   as const },
          { label: "All Events",    value: events.length,   color: undefined         },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 6 }}>{s.label}</p>
            <p className="num" style={{ fontSize: 24, fontWeight: 700, color: s.color ? `var(--${s.color})` : "var(--text)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {(["all","signal","entry","exit"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "7px 18px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filter === f ? "var(--blue)" : "transparent",
            color: filter === f ? "#fff" : "var(--muted)", border: "none",
          }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 24, marginBottom: 8 }}>⚡</p>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>No signals yet</p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>Start the bot to see signals appear here in real time.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((e, i) => {
            const s = KIND_STYLES[e.kind] ?? KIND_STYLES.info;
            const dir = e.data?.direction as string | undefined;
            const dc  = dir && DIRECTION_COLORS[dir as "long"|"short"];
            return (
              <div key={i} className="slide-in" style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "12px 16px",
                display: "flex", alignItems: "flex-start", gap: 14,
              }}>
                <span style={{ color: s.color, fontSize: 16, marginTop: 1, width: 20, textAlign: "center", flexShrink: 0 }}>{s.icon}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{e.message}</p>
                    {dir && dc && (
                      <span style={{ padding: "1px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700, background: dc.bg, color: dc.text, border: `1px solid ${dc.border}`, flexShrink: 0 }}>
                        {dir.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {e.data && Object.keys(e.data).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {Object.entries(e.data).filter(([k]) => k !== "direction").map(([k, v]) => (
                        <span key={k} style={{ fontSize: 10, color: "var(--muted)", background: "var(--dim)", padding: "2px 7px", borderRadius: 5 }}>
                          {k}: <span className="num" style={{ color: "var(--text)" }}>{String(v)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <span className="num" style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {new Date(e.ts).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
