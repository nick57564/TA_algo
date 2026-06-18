interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "yellow" | "blue" | "purple";
  glow?: boolean;
}

const COLOR_MAP = {
  green:  { text: "#00d4b4", border: "rgba(0,212,180,.2)",   bg: "rgba(0,212,180,.07)"   },
  red:    { text: "#ea3943", border: "rgba(234,57,67,.2)",   bg: "rgba(234,57,67,.07)"   },
  yellow: { text: "#f5a623", border: "rgba(245,166,35,.2)",  bg: "rgba(245,166,35,.07)"  },
  blue:   { text: "#60a5fa", border: "rgba(59,130,246,.2)",  bg: "rgba(59,130,246,.07)"  },
  purple: { text: "#a78bfa", border: "rgba(139,92,246,.2)",  bg: "rgba(139,92,246,.07)"  },
};

export default function StatCard({ label, value, sub, color, glow }: StatCardProps) {
  const c = color ? COLOR_MAP[color] : null;
  return (
    <div style={{
      background: c ? c.bg : "var(--card)",
      border: `1px solid ${c ? c.border : "var(--border)"}`,
      borderRadius: 10,
      padding: "16px 18px",
      boxShadow: glow && c
        ? `0 0 20px ${c.border}`
        : "none",
    }}>
      <p style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
        color: "var(--muted)", marginBottom: 8, fontWeight: 600,
      }}>{label}</p>
      <p className="num" style={{
        fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em",
        color: c ? c.text : "var(--text)", lineHeight: 1,
      }}>{value}</p>
      {sub && (
        <p className="num" style={{
          fontSize: 11, color: "var(--muted)", marginTop: 5,
        }}>{sub}</p>
      )}
    </div>
  );
}
