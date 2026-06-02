"use client";

export default function EquityChart({ points, height = 140 }: { points: number[]; height?: number }) {
  const W = 800, H = height, PAD = 10;

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm"
        style={{ height, color: "var(--muted)" }}>
        No trades yet
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const xs = points.map((_, i) => PAD + (i / (points.length - 1)) * (W - PAD * 2));
  const ys = points.map((v) => H - PAD - ((v - min) / range) * (H - PAD * 2));

  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = [
    ...xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`),
    `L${xs[xs.length - 1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`,
  ].join(" ");

  const positive = points[points.length - 1] >= points[0];
  const color = positive ? "var(--green)" : "var(--red)";
  const fillColor = positive ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)";
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  // Horizontal zero line
  const zeroY = H - PAD - ((points[0] - min) / range) * (H - PAD * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {/* Zero baseline */}
      <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY}
        stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
      {/* Area fill */}
      <path d={area} fill={fillColor} />
      {/* Line */}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
      <circle cx={lastX} cy={lastY} r="6" fill={color} opacity="0.2" />
    </svg>
  );
}
