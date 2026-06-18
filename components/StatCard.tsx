interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "yellow" | "blue" | "purple";
  glow?: boolean;
}

const COLOR_MAP = {
  green:  { text: "var(--green2)", glow: "rgba(16,185,129,.18)",  border: "rgba(16,185,129,.25)", bg: "rgba(16,185,129,.06)"  },
  red:    { text: "var(--red2)",   glow: "rgba(239,68,68,.18)",   border: "rgba(239,68,68,.25)",  bg: "rgba(239,68,68,.06)"   },
  yellow: { text: "var(--yellow2)",glow: "rgba(245,158,11,.18)",  border: "rgba(245,158,11,.25)", bg: "rgba(245,158,11,.06)"  },
  blue:   { text: "var(--blue2)",  glow: "rgba(59,130,246,.18)",  border: "rgba(59,130,246,.25)", bg: "rgba(59,130,246,.06)"  },
  purple: { text: "var(--purple2)",glow: "rgba(139,92,246,.18)",  border: "rgba(139,92,246,.25)", bg: "rgba(139,92,246,.06)"  },
};

export default function StatCard({ label, value, sub, color, glow }: StatCardProps) {
  const c = color ? COLOR_MAP[color] : null;
  return (
    <div style={{
      background: c ? c.bg : "rgba(255,255,255,0.03)",
      border: `1px solid ${c ? c.border : "var(--border)"}`,
      borderRadius: 16,
      padding: "20px 22px",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      boxShadow: glow && c
        ? `0 0 0 1px ${c.border}, 0 8px 32px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`
        : "0 4px 24px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      position: "relative",
      overflow: "hidden",
      transition: "box-shadow .2s, transform .2s",
    }}>
      {/* subtle top-edge highlight */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: c
          ? `linear-gradient(90deg, transparent, ${c.border}, transparent)`
          : "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)",
      }} />
      <p style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
        color: "var(--muted)", marginBottom: 10, fontWeight: 600,
      }}>{label}</p>
      <p className="num" style={{
        fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em",
        color: c ? c.text : "var(--text)",
        lineHeight: 1,
      }}>{value}</p>
      {sub && (
        <p className="num" style={{
          fontSize: 11, color: "var(--muted)", marginTop: 6,
          letterSpacing: "0.02em",
        }}>{sub}</p>
      )}
    </div>
  );
}
