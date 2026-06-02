"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",          label: "Overview",    icon: "⬡" },
  { href: "/backtest",  label: "Backtest",    icon: "◈" },
  { href: "/bot",       label: "Bot Control", icon: "◎" },
  { href: "/log",       label: "Event Log",   icon: "≡" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border)" }}
      className="flex flex-col w-56 shrink-0 h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: "var(--blue)", color: "#fff" }}>TA</div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>TA Algo</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>H&S Strategy</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = path === href;
          return (
            <Link key={href} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{
                color: active ? "#fff" : "var(--muted)",
                background: active ? "var(--blue-dim)" : "transparent",
                borderLeft: active ? "2px solid var(--blue)" : "2px solid transparent",
              }}
            >
              <span className="text-base w-4 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t text-xs" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        <p>BTC · H&S Pattern</p>
        <p className="mt-0.5 opacity-50">v2.0 · 2026</p>
      </div>
    </aside>
  );
}
