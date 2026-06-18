"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/backtest",  icon: "◈",  label: "Backtest"   },
  { href: "/paper",     icon: "◎",  label: "Paper"      },
  { href: "/live",      icon: "●",  label: "Live"       },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside style={{
      width: 260,
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
      <div style={{ padding: "20px 18px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Support / Resistance breakout icon */}
          <svg viewBox="0 0 46 36" width="46" height="36" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <rect width="46" height="36" rx="7" fill="#0f1320"/>
            {/* Support line 1 — bottom */}
            <line x1="2" y1="30" x2="20" y2="30" stroke="#00d4b4" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            {/* Middle resistance → support */}
            <line x1="14" y1="19" x2="42" y2="19" stroke="#00d4b4" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            {/* Top resistance */}
            <line x1="30" y1="8"  x2="46" y2="8"  stroke="#00d4b4" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            {/* Price path */}
            <polyline
              points="3,33 6,21 9,30 13,21 16,25 18,19 23,12 27,19 31,12 36,7 40,4"
              fill="none" stroke="#ffffff" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>TA Algo</p>
            <p style={{ fontSize: 10, color: "var(--muted)" }}>Structure Bot</p>
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
                padding: "12px 16px", borderRadius: 9, marginBottom: 4,
                background: active ? "rgba(0,212,180,.1)" : "transparent",
                border: `1px solid ${active ? "rgba(0,212,180,.25)" : "transparent"}`,
                color: active ? "var(--teal)" : "var(--muted)",
                fontSize: 14, fontWeight: active ? 700 : 500,
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
