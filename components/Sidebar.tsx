"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/backtest",     icon: "◈", label: "Backtest"  },
  { href: "/backtestloop", icon: "◇", label: "Indicators" },
  { href: "/paper",        icon: "◎", label: "Paper"     },
  { href: "/live",         icon: "●", label: "Live"      },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside style={{
      width: 260,
      minHeight: "100vh",
      background: "var(--sb-bg)",
      borderRight: "1px solid var(--sb-border)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      position: "sticky",
      top: 0,
      height: "100vh",
    }}>

      {/* Logo */}
      <div style={{ padding: "24px 22px 20px", borderBottom: "1px solid var(--sb-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <svg viewBox="0 0 46 36" width="48" height="37" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
            <rect width="46" height="36" rx="7" fill="#22263a"/>
            <line x1="2"  y1="30" x2="20" y2="30" stroke="#00c896" strokeWidth="2.2" strokeLinecap="round" opacity="0.8"/>
            <line x1="14" y1="19" x2="42" y2="19" stroke="#00c896" strokeWidth="2.2" strokeLinecap="round" opacity="0.8"/>
            <line x1="30" y1="8"  x2="46" y2="8"  stroke="#00c896" strokeWidth="2.2" strokeLinecap="round" opacity="0.8"/>
            <polyline points="3,33 6,21 9,30 13,21 16,25 18,19 23,12 27,19 31,12 36,7 40,4"
              fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--sb-text)", letterSpacing: "-0.01em" }}>TA Algo</p>
            <p style={{ fontSize: 11, color: "var(--sb-muted)" }}>Structure Bot</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "16px 12px" }}>
        <p style={{ fontSize: 12, color: "var(--sb-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, padding: "4px 10px", marginBottom: 8 }}>Trading</p>
        {NAV.map(({ href, icon, label }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 16px", borderRadius: 10, marginBottom: 4,
                background: active ? "var(--sb-active)" : "transparent",
                border: `1px solid ${active ? "var(--sb-active-border)" : "transparent"}`,
                color: active ? "var(--teal)" : "var(--sb-muted)",
                fontSize: 15, fontWeight: active ? 700 : 500,
                transition: "all .15s", cursor: "pointer",
              }}>
                <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{icon}</span>
                {label}
                {href === "/live" && (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, padding: "2px 7px",
                    borderRadius: 5, background: "rgba(234,57,67,.2)",
                    color: "#f87171", fontWeight: 700, letterSpacing: "0.06em",
                    border: "1px solid rgba(234,57,67,.3)",
                  }}>LIVE</span>
                )}
                {href === "/paper" && (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, padding: "2px 7px",
                    borderRadius: 5, background: "rgba(0,200,150,.15)",
                    color: "var(--teal)", fontWeight: 700,
                    border: "1px solid rgba(0,200,150,.3)",
                  }}>TEST</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: "16px 22px", borderTop: "1px solid var(--sb-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 6px var(--teal)" }} className="pulse" />
          <p style={{ fontSize: 13, color: "var(--teal)", fontWeight: 600 }}>Connected · Hyperliquid</p>
        </div>
        <p style={{ fontSize: 12, color: "var(--sb-muted)" }}>Strategy-first approach · v1.0</p>
      </div>
    </aside>
  );
}
