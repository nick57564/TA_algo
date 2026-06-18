interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "yellow" | "blue" | "purple";
  glow?: boolean;
}

const COLOR_MAP = {
  green:  { text: "#00c896", border: "rgba(0,200,150,.2)",  bg: "rgba(0,200,150,.07)"  },
  red:    { text: "#ea3943", border: "rgba(234,57,67,.2)",  bg: "rgba(234,57,67,.07)"  },
  yellow: { text: "#d97706", border: "rgba(245,158,11,.2)", bg: "rgba(245,158,11,.07)" },
  blue:   { text: "#2563eb", border: "rgba(37,99,235,.2)",  bg: "rgba(37,99,235,.07)"  },
  purple: { text: "#7c3aed", border: "rgba(124,58,237,.2)", bg: "rgba(124,58,237,.07)" },
};

export default function StatCard({ label, value, sub, color, glow }: StatCardProps) {
  const c = color ? COLOR_MAP[color] : null;
  return (
    <div style={{
      background: "#ffffff",
      border: `1px solid ${c ? c.border : "var(--border)"}`,
      borderRadius: 12,
      padding: "18px 20px",
      boxShadow: glow && c
        ? `0 0 0 1px ${c.border}, 0 4px 20px rgba(0,0,0,.08)`
        : "0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.05)",
      position: "relative",
      overflow: "hidden",
    }}>
      {c && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: c.text, borderRadius: "12px 12px 0 0",
          opacity: 0.7,
        }} />
      )}
      <p style={{
        fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
        color: "var(--muted)", marginBottom: 8, fontWeight: 700,
      }}>{label}</p>
      <p className="num" style={{
        fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em",
        color: c ? c.text : "var(--text)", lineHeight: 1,
      }}>{value}</p>
      {sub && (
        <p className="num" style={{
          fontSize: 11, color: "var(--muted)", marginTop: 6,
        }}>{sub}</p>
      )}
    </div>
  );
}
