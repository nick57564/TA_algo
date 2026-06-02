interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "blue" | "yellow" | "default";
  glow?: boolean;
}

export default function StatCard({ label, value, sub, color = "default", glow }: StatCardProps) {
  const colorMap: Record<string, string> = {
    green:   "var(--green)",
    red:     "var(--red)",
    blue:    "var(--blue)",
    yellow:  "var(--yellow)",
    default: "var(--text)",
  };
  const c = colorMap[color];
  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        background: "var(--card)",
        border: `1px solid ${glow ? colorMap[color] + "44" : "var(--border)"}`,
        boxShadow: glow ? `0 0 20px ${colorMap[color]}18` : "none",
      }}
    >
      <p className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-2xl font-bold num" style={{ color: c }}>{value}</p>
      {sub && <p className="text-xs mt-1 num" style={{ color: "var(--muted)" }}>{sub}</p>}
    </div>
  );
}
