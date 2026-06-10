interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "yellow" | "blue" | "purple";
  glow?: boolean;
}

const COLOR_MAP = {
  green:  { text: "var(--green)",  bg: "rgba(16,185,129,.08)",  border: "rgba(16,185,129,.2)"  },
  red:    { text: "var(--red)",    bg: "rgba(239,68,68,.08)",   border: "rgba(239,68,68,.2)"   },
  yellow: { text: "var(--yellow)", bg: "rgba(245,158,11,.08)",  border: "rgba(245,158,11,.2)"  },
  blue:   { text: "var(--blue2)",  bg: "rgba(59,130,246,.08)",  border: "rgba(59,130,246,.2)"  },
  purple: { text: "var(--purple)", bg: "rgba(139,92,246,.08)",  border: "rgba(139,92,246,.2)"  },
};

export default function StatCard({ label, value, sub, color, glow }: StatCardProps) {
  const c = color ? COLOR_MAP[color] : null;
  return (
    <div style={{
      background: c ? c.bg : "var(--card)",
      border: `1px solid ${c ? c.border : "var(--border)"}`,
      borderRadius: 12, padding: "16px 18px",
      boxShadow: glow && c ? `0 0 24px ${c.border}` : undefined,
    }}>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 6 }}>{label}</p>
      <p className="num" style={{ fontSize: 22, fontWeight: 700, color: c ? c.text : "var(--text)" }}>{value}</p>
      {sub && <p className="num" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sub}</p>}
    </div>
  );
}
