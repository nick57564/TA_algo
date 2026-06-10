"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",          icon: "⬡",  label: "Overview"   },
  { href: "/backtest",  icon: "◈",  label: "Backtest"   },
  { href: "/signals",   icon: "⚡",  label: "Signals"    },
  { href: "/paper",     icon: "◎",  label: "Paper"      },
  { href: "/live",      icon: "●",  label: "Live"       },
  { href: "/log",       icon: "≡",  label: "Event Log"  },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside style={{
      width: 220,
      minHeight: "100vh",
      background: "var(--surface)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      position: "sticky",
      top: 0,
      height: "100vh",
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#fff",
          }}>B</div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>TA Algo</p>
            <p style={{ fontSize: 10, color: "var(--muted)" }}>BTCUSD Structure</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        {NAV.map(({ href, icon, label }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8, marginBottom: 2,
                background: active ? "rgba(59,130,246,.12)" : "transparent",
                border: `1px solid ${active ? "rgba(59,130,246,.25)" : "transparent"}`,
                color: active ? "var(--blue2)" : "var(--muted)",
                fontSize: 13, fontWeight: active ? 600 : 400,
                transition: "all .15s",
                cursor: "pointer",
              }}>
                <span style={{ fontSize: 15, width: 18, textAlign: "center" }}>{icon}</span>
                {label}
                {href === "/live" && (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, padding: "2px 6px",
                    borderRadius: 4, background: "rgba(239,68,68,.15)",
                    color: "var(--red)", fontWeight: 700, letterSpacing: "0.05em",
                  }}>LIVE</span>
                )}
                {href === "/paper" && (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, padding: "2px 6px",
                    borderRadius: 4, background: "rgba(16,185,129,.12)",
                    color: "var(--green)", fontWeight: 700,
                  }}>TEST</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: 10, color: "var(--muted)" }}>Hyperliquid · v1.0</p>
        <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>Strategy-first approach</p>
      </div>
    </aside>
  );
}
