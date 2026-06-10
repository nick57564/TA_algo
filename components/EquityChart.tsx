"use client";

interface Props {
  points: number[];
  height?: number;
  showGrid?: boolean;
}

export default function EquityChart({ points, height = 160, showGrid = true }: Props) {
  if (!points || points.length < 2) return null;

  const w = 900, h = height;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = { t: 10, b: 24, l: 10, r: 10 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;

  const x = (i: number) => pad.l + (i / (points.length - 1)) * iw;
  const y = (v: number) => pad.t + (1 - (v - min) / range) * ih;

  const pts = points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${y(points[0])} ` +
    points.map((v, i) => `L${x(i)},${y(v)}`).join(" ") +
    ` L${x(points.length - 1)},${h - pad.b} L${x(0)},${h - pad.b} Z`;

  const isUp = points[points.length - 1] >= points[0];
  const color = isUp ? "var(--green)" : "var(--red)";
  const fillColor = isUp ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)";

  // Grid lines
  const gridLines = showGrid ? [0, 0.25, 0.5, 0.75, 1].map(p => ({
    yPos: pad.t + p * ih,
    value: max - p * range,
  })) : [];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity=".25" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </linearGradient>
      </defs>

      {gridLines.map((g, i) => (
        <line key={i} x1={pad.l} y1={g.yPos} x2={w - pad.r} y2={g.yPos}
          stroke="var(--border)" strokeWidth=".5" strokeDasharray="4,6" />
      ))}

      <path d={area} fill="url(#eq-grad)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Start / end dots */}
      <circle cx={x(0)} cy={y(points[0])} r="3" fill={color} opacity=".6" />
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="3.5" fill={color} />
    </svg>
  );
}
