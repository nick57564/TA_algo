"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import StatCard from "@/components/StatCard";
import type { BacktestResult } from "@/lib/types";
import type { Candle, SignalMarker, MAPoint, HighlightTrade, TradeRange } from "@/components/CandleChart";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const SYMBOLS  = ["BTC","ETH","SOL","SPX","GOLD"];
const LIMITS   = [365, 730];
const fmt = (n: number, d = 2) => n?.toFixed(d) ?? "—";

// Step definitions — added one by one
const STEPS = [
  { id: 1, label: "Swing Detection", desc: "Identify Swing Highs & Swing Lows and label them HH/HL/LH/LL" },
  { id: 2, label: "Market Structure", desc: "Close above LH = bullish · close below HL = bearish · only closes count" },
  { id: 3, label: "Daily EMA Filter", desc: "Close above 50 EMA = only longs · below = only shorts · never an entry signal" },
  { id: 4, label: "HTF Confirmation", desc: "Long: Weekly+Daily OR Daily+4H bullish · Short: same but bearish · else no trade" },
  { id: 5, label: "TF Scoring", desc: "Weekly / Daily / 4H each scored 0-60 on 7 criteria" },
  { id: 6, label: "Trade Requirements", desc: "ALL must be true: EMA direction · HTF aligned · 2×45+ scores · 120+ total · entry signal" },
  { id: 7, label: "Entry Signal", desc: "SoS or engulfing on the 4H — only fires when the step 6 setup is valid" },
  { id: 8, label: "Risk & Backtest", desc: "Risk 1% · SL beyond HL/LH · TP 1:3 · automatically run the full strategy" },
];

function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "9px 18px", borderRadius: 8, fontSize: 15, fontWeight: 600,
      cursor: "pointer", transition: "all .12s",
      background: active ? "var(--teal)" : "#ffffff",
      color: active ? "#ffffff" : "var(--muted)",
      border: `1px solid ${active ? "var(--teal)" : "var(--border)"}`,
      boxShadow: active ? "0 2px 8px rgba(0,200,150,.3)" : "0 1px 2px rgba(0,0,0,.06)",
    }}>{children}</button>
  );
}

function TradesTable({ trades, selectedIdx, onSelect }: {
  trades: import("@/lib/types").Trade[];
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
}) {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  useEffect(() => {
    if (selectedIdx == null) return;
    rowRefs.current[selectedIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedIdx]);

  if (!trades.length)
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--muted)", background: "#ffffff", border: "1px solid var(--border)", borderRadius: 14 }}>
        <p style={{ fontSize: 32, marginBottom: 8, opacity: 0.25 }}>📊</p>
        <p style={{ fontSize: 15 }}>Run backtest to see trades</p>
      </div>
    );

  return (
    <div style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--dim)" }}>
            {["","#","Side","Entry","Exit","Entry $","Exit $","P&L","Result","Reason"].map(h => (
              <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "var(--muted)", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const win = t.pnl > 0, isLong = t.direction === "long", sel = selectedIdx === i;
            return (
              <>
                <tr key={i} ref={el => { rowRefs.current[i] = el; }}
                  onClick={() => onSelect(sel ? null : i)}
                  style={{ borderBottom: sel ? "none" : "1px solid var(--border)", cursor: "pointer", background: sel ? "rgba(0,200,150,.06)" : "transparent" }}>
                  <td style={{ padding: "10px 8px 10px 14px", color: "var(--muted)" }}>{sel ? "▼" : "▶"}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)", fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 13, fontWeight: 700, background: isLong ? "rgba(0,200,150,.1)" : "rgba(234,57,67,.1)", color: isLong ? "var(--teal)" : "var(--red)", border: `1px solid ${isLong ? "rgba(0,200,150,.25)" : "rgba(234,57,67,.25)"}` }}>{isLong ? "LONG" : "SHORT"}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)" }}>{new Date(t.entry_time).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 8px", color: "var(--muted)" }}>{new Date(t.exit_time).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>${t.entry_price?.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 600 }}>${t.exit_price?.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 800, fontSize: 15, color: win ? "var(--teal)" : "var(--red)" }}>{win ? "+" : ""}${t.pnl?.toFixed(2)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: win ? "rgba(0,200,150,.1)" : t.exit_reason === "be" ? "rgba(37,99,235,.08)" : "rgba(234,57,67,.1)", color: win ? "var(--teal)" : t.exit_reason === "be" ? "var(--blue2)" : "var(--red)", border: `1px solid ${win ? "rgba(0,200,150,.25)" : t.exit_reason === "be" ? "rgba(37,99,235,.2)" : "rgba(234,57,67,.25)"}` }}>
                      {t.exit_reason === "be" ? "BE" : t.exit_reason?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.entry_reason}</td>
                </tr>
                {sel && (
                  <tr key={`${i}-d`} style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,200,150,.03)" }}>
                    <td colSpan={10} style={{ padding: "0 14px 14px 40px" }}>
                      <div style={{ background: win ? "rgba(0,200,150,.06)" : "rgba(234,57,67,.05)", border: `1px solid ${win ? "rgba(0,200,150,.2)" : "rgba(234,57,67,.2)"}`, borderRadius: 10, padding: "14px 18px" }}>
                        <p style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: win ? "var(--teal)" : "var(--red)", marginBottom: 6 }}>{win ? "✓ Win" : "✗ Loss"}</p>
                        <p style={{ fontSize: 14, lineHeight: 1.7 }}>{t.analysis ?? "—"}</p>
                        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                          {[`SL @ $${t.sl_price?.toFixed(0)}`, `TP @ $${t.tp_price?.toFixed(0)}`, `Hold: ${Math.round((new Date(t.exit_time).getTime() - new Date(t.entry_time).getTime()) / 86_400_000)}d`].map(s => (
                            <span key={s} style={{ fontSize: 13, color: "var(--muted)", padding: "2px 10px", borderRadius: 5, background: "var(--dim)", border: "1px solid var(--border)" }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CANDLE_API: Record<string, string> = {
  SPX:  "/api/candles-yahoo?symbol=%5EGSPC",
  GOLD: "/api/candles-yahoo?symbol=GC%3DF",
};

interface SwingData {
  type: "high" | "low";
  label: "HH" | "LH" | "HL" | "LL";
  price: number;
  time: number;
}

interface StructureEvent {
  time: number;
  price: number;
  brokeLevel: number;
  newTrend: "bullish" | "bearish";
}

interface RegimePoint {
  time: number;
  close: number;
  trend: "bullish" | "bearish" | "neutral";
}

interface EmaPoint {
  time: number;
  value: number;
  direction: "long" | "short";
}

interface HtfPoint {
  time: number;
  close: number;
  weekly: "bullish" | "bearish" | "neutral";
  daily:  "bullish" | "bearish" | "neutral";
  h4:     "bullish" | "bearish" | "neutral";
  allowed: "long" | "short" | "none";
}

interface HtfNow {
  weekly: "bullish" | "bearish" | "neutral";
  daily:  "bullish" | "bearish" | "neutral";
  h4:     "bullish" | "bearish" | "neutral";
  allowed: "long" | "short" | "none";
  h4_available: boolean;
}

interface ScoreBreakdown {
  trend: number; aoi: number; ema: number; round: number;
  structRej: number; engulf: number; hns: number; total: number;
}

interface ScoreNow {
  direction: "long" | "short";
  weekly: ScoreBreakdown;
  daily:  ScoreBreakdown;
  h4:     ScoreBreakdown | null;
}

interface ScorePoint {
  time: number; close: number;
  w: number; d: number; h: number;
  total: number; pass: boolean;
  dir: "long" | "short";
}

interface SetupPoint {
  time: number; close: number;
  dir: "long" | "short";
  c1: boolean; c2: boolean; c3: boolean; c4: boolean;
  valid: boolean;
}

interface EntrySignal {
  time: number; price: number;
  dir: "long" | "short";
  kind: "SoS" | "Engulfing";
  reason: string;
}

export default function BacktestLoopPage() {
  const [result,   setResult]   = useState<BacktestResult | null>(null);
  const [candles,  setCandles]  = useState<Candle[]>([]);
  const [symbol,   setSymbol]   = useState("BTC");
  const [limit,    setLimit]    = useState(365);
  const [loading,  setLoading]  = useState(false);
  const [running,  setRunning]  = useState(false);
  const [runErr,   setRunErr]   = useState<string | null>(null);
  const [tab,      setTab]      = useState<"stats"|"trades">("stats");
  const [selectedTradeIdx, setSelectedTradeIdx] = useState<number | null>(null);
  const [highlightTrade,   setHighlightTrade]   = useState<HighlightTrade | null>(null);

  // Step 1 + 2: swing detection & market structure state
  const [activeStep,   setActiveStep]   = useState<number | null>(1);
  const [swings,       setSwings]       = useState<SwingData[]>([]);
  const [swingLoading, setSwingLoading] = useState(false);
  const [swingStats,   setSwingStats]   = useState<{ highs: number; lows: number } | null>(null);
  const [structEvents, setStructEvents] = useState<StructureEvent[]>([]);
  const [regime,       setRegime]       = useState<RegimePoint[]>([]);
  const [currentTrend, setCurrentTrend] = useState<"bullish" | "bearish" | "neutral">("neutral");
  const [emaData,      setEmaData]      = useState<EmaPoint[]>([]);
  const [allowedDir,   setAllowedDir]   = useState<"long" | "short" | null>(null);
  const [htf,          setHtf]          = useState<HtfPoint[]>([]);
  const [htfNow,       setHtfNow]       = useState<HtfNow | null>(null);
  const [scoreNow,     setScoreNow]     = useState<ScoreNow | null>(null);
  const [scoreHist,    setScoreHist]    = useState<ScorePoint[]>([]);
  const [setupHist,    setSetupHist]    = useState<SetupPoint[]>([]);
  const [setupNow,     setSetupNow]     = useState<SetupPoint | null>(null);
  const [emaWeekly,    setEmaWeekly]    = useState<{ time: number; value: number }[]>([]);
  const [emaH4,        setEmaH4]        = useState<{ time: number; value: number }[]>([]);
  const [hidden,       setHidden]       = useState<Set<string>>(new Set());
  const [entrySigs,    setEntrySigs]    = useState<EntrySignal[]>([]);

  const toggleLine = (label: string) => setHidden(prev => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });

  // Clickable legend chips: click to hide/show the matching line or markers
  const legendChips = (items: { c: string; l: string }[], shape: "dot" | "bar" = "bar") => items.map(x => (
    <div key={x.l} onClick={() => toggleLine(x.l)} title="Click to hide/show"
      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", opacity: hidden.has(x.l) ? 0.3 : 1, transition: "opacity .12s" }}>
      {shape === "dot"
        ? <div style={{ width: 10, height: 10, borderRadius: "50%", background: x.c }} />
        : <div style={{ width: 16, height: 4, borderRadius: 2, background: x.c }} />}
      <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, textDecoration: hidden.has(x.l) ? "line-through" : "none" }}>{x.l}</span>
    </div>
  ));

  const loadCandles = useCallback(async (sym: string, lim: number) => {
    setLoading(true);
    try {
      const url = CANDLE_API[sym]
        ? `${CANDLE_API[sym]}&limit=${lim + 50}`
        : `/api/candles?symbol=${sym}&interval=1d&limit=${lim + 50}&testnet=false`;
      const r = await fetch(url);
      const d = await r.json();
      if (Array.isArray(d)) setCandles(d);
    } catch {}
    setLoading(false);
  }, []);

  const loadSwings = useCallback(async (sym: string, lim: number) => {
    setSwingLoading(true);
    try {
      const r = await fetch("/api/backtestloop/swings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym, limit: lim, interval: "1d" }),
      });
      const d = await r.json();
      if (d.swings) {
        setSwings(d.swings);
        setSwingStats({ highs: d.swing_highs, lows: d.swing_lows });
        setStructEvents(d.structure_events ?? []);
        setRegime(d.regime ?? []);
        setCurrentTrend(d.current_trend ?? "neutral");
        setEmaData(d.ema50 ?? []);
        setAllowedDir(d.allowed_direction ?? null);
        setHtf(d.htf ?? []);
        setHtfNow(d.htf_now ?? null);
        setScoreNow(d.score_now ?? null);
        setScoreHist(d.score_history ?? []);
        setSetupHist(d.setup_history ?? []);
        setSetupNow(d.setup_now ?? null);
        setEmaWeekly(d.ema50_weekly ?? []);
        setEmaH4(d.ema50_h4 ?? []);
        setEntrySigs(d.entry_signals ?? []);
      }
    } catch {}
    setSwingLoading(false);
  }, []);

  useEffect(() => { loadCandles(symbol, limit); loadSwings(symbol, limit); }, []);
  useEffect(() => {
    loadCandles(symbol, limit);
    loadSwings(symbol, limit);
    setResult(null); setRunErr(null);
  }, [symbol, limit]);

  async function runBacktest(keepStep = false) {
    setRunning(true); setRunErr(null);
    try {
      const r = await fetch("/api/backtestloop/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, limit, interval: "1d" }),
      });
      const d = await r.json();
      if (d.error) setRunErr(d.error);
      else { setResult(d); setTab("stats"); if (!keepStep) setActiveStep(null); }
    } catch (e) { setRunErr(String(e)); }
    setRunning(false);
  }

  // Build chart markers depending on the active step
  const swingMarkers: SignalMarker[] = swings
    .filter(s =>
      !(hidden.has("HH / HL (bullish)") && (s.label === "HH" || s.label === "HL")) &&
      !(hidden.has("LH") && s.label === "LH") &&
      !(hidden.has("LL (bearish)") && s.label === "LL"))
    .map(s => ({
      time:      s.time,
      direction: s.type === "low" ? "long" : "short",
      type:      s.label, // "HH" | "LH" | "HL" | "LL"
      price:     s.price,
    }));
  const breakMarkers: SignalMarker[] = structEvents.map(e => ({
    time:      e.time,
    direction: e.newTrend === "bullish" ? "long" : "short",
    type:      e.newTrend === "bullish" ? "Bullish Break" : "Bearish Break",
    price:     e.price,
  }));

  // Step 7: group 4H signals by day and direction for the 1D chart. Printing
  // every full label caused dense clusters to overlap and become unreadable.
  const entryMarkerGroups = new Map<string, { time: number; price: number; dir: "long" | "short"; kinds: Set<"SoS" | "Engulfing"> }>();
  for (const signal of entrySigs) {
    const day = Math.floor(signal.time / 86_400_000);
    const key = `${day}-${signal.dir}`;
    const existing = entryMarkerGroups.get(key);
    if (existing) {
      existing.kinds.add(signal.kind);
    } else {
      entryMarkerGroups.set(key, { time: signal.time, price: signal.price, dir: signal.dir, kinds: new Set([signal.kind]) });
    }
  }
  const entryMarkers: SignalMarker[] = Array.from(entryMarkerGroups.values()).map(group => ({
    time: group.time,
    direction: group.dir,
    type: "Entry",
    text: group.kinds.size === 2 ? "S+E" : group.kinds.has("SoS") ? "S" : "E",
    price: group.price,
  }));

  const markers: SignalMarker[] =
    activeStep === 1 ? swingMarkers
    : activeStep === 2 ? [...swingMarkers, ...breakMarkers]
    : activeStep === 3 || activeStep === 4 || activeStep === 5 || activeStep === 6 ? []
    : activeStep === 7 ? entryMarkers
    : result?.signals?.map((s: { timestamp: string; direction: "long"|"short"; type: string; price: number }) => ({
        time: new Date(s.timestamp).getTime(), direction: s.direction, type: s.type, price: s.price,
      })) ?? [];

  // Step 2: coloured regime line along the closes
  // Step 3: the 50 EMA itself, coloured by allowed direction (green = longs only, red = shorts only)
  // Step 4: line along the closes coloured by ALLOWED trade direction
  //   green = long allowed · red = short allowed · grey = no trade
  const regimeLineRaw =
    activeStep === 2 ? regime.map(p => ({ time: p.time, value: p.close, trend: p.trend }))
    : activeStep === 3 ? emaData.map(p => ({ time: p.time, value: p.value, trend: (p.direction === "long" ? "bullish" : "bearish") as "bullish" | "bearish" }))
    : activeStep === 4 ? htf.map(p => ({ time: p.time, value: p.close, trend: (p.allowed === "long" ? "bullish" : p.allowed === "short" ? "bearish" : "neutral") as "bullish" | "bearish" | "neutral" }))
    // Step 5: line coloured by score pass — green/red when 2 of 3 TFs >= 45 AND total >= 120 (direction from EMA), grey otherwise
    : activeStep === 5 ? scoreHist.map(p => ({ time: p.time, value: p.close, trend: (p.pass ? (p.dir === "long" ? "bullish" : "bearish") : "neutral") as "bullish" | "bearish" | "neutral" }))
    // Step 6 & 7: line coloured on days where ALL requirements 1-4 hold (setup valid)
    : activeStep === 6 || activeStep === 7 ? setupHist.map(p => ({ time: p.time, value: p.close, trend: (p.valid ? (p.dir === "long" ? "bullish" : "bearish") : "neutral") as "bullish" | "bearish" | "neutral" }))
    : undefined;

  // Legend label per trend, per step — used to hide segments via legend clicks
  const trendLabels: Record<number, Record<string, string>> = {
    2: { bullish: "Bullish structure", bearish: "Bearish structure", neutral: "Neutral" },
    3: { bullish: "50 EMA — longs only", bearish: "50 EMA — shorts only" },
    4: { bullish: "Long allowed", bearish: "Short allowed", neutral: "No trade" },
    5: { bullish: "Score pass (long)", bearish: "Score pass (short)", neutral: "Below threshold" },
    6: { bullish: "Setup valid (long)", bearish: "Setup valid (short)", neutral: "No setup" },
    7: { bullish: "Setup valid (long)", bearish: "Setup valid (short)", neutral: "No setup" },
  };
  const regimeLine = regimeLineRaw?.map(p => {
    const label = activeStep != null ? trendLabels[activeStep]?.[p.trend] : undefined;
    return label && hidden.has(label) ? { ...p, trend: "hidden" as const } : p;
  });

  const longs  = result?.trades?.filter((t: { direction: string }) => t.direction === "long").length  ?? 0;
  const shorts = result?.trades?.filter((t: { direction: string }) => t.direction === "short").length ?? 0;
  const months = result ? Object.entries(result.monthly_returns ?? {}).sort() : [];

  const tradeRanges: TradeRange[] = result?.trades?.map((t: { entry_time: string; exit_time: string }) => ({
    entryTime: new Date(t.entry_time).getTime(),
    exitTime:  new Date(t.exit_time).getTime(),
  })) ?? [];

  function selectTrade(idx: number | null) {
    const trade = idx != null ? result?.trades?.[idx] : null;
    setSelectedTradeIdx(idx);
    setHighlightTrade(trade ? { entryTime: new Date(trade.entry_time).getTime(), exitTime: new Date(trade.exit_time).getTime(), direction: trade.direction } : null);
    if (trade) setTab("trades");
  }

  return (
    <div style={{ padding: "24px 28px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div style={{ marginRight: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Market Structure Bot</h1>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 3 }}>
            Steps 1–8 · Structure + HTF + scoring · Entry: SoS/engulf on 4H · 1% risk · SL at HL/LH · TP 1:3
          </p>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05)", flexWrap: "wrap" }}>
          {SYMBOLS.map(s => <SegBtn key={s} active={symbol === s} onClick={() => setSymbol(s)}>{s}</SegBtn>)}
        </div>

        <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
          {LIMITS.map(l => <SegBtn key={l} active={limit === l} onClick={() => setLimit(l)}>{l}d</SegBtn>)}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => void runBacktest()} disabled={running} style={{
            padding: "12px 32px", borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: running ? "not-allowed" : "pointer",
            background: running ? "var(--dim)" : "var(--teal)",
            color: running ? "var(--muted)" : "#fff",
            border: "none", display: "flex", alignItems: "center", gap: 8,
            boxShadow: running ? "none" : "0 4px 16px rgba(0,200,150,.4)",
          }}>
            {running ? (<><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />Analysing…</>) : "▶  Run Backtest"}
          </button>
        </div>
      </div>

      {runErr && (
        <div style={{ background: "rgba(234,57,67,.06)", border: "1px solid rgba(234,57,67,.2)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 14, color: "var(--red)" }}>⚠ {runErr}</div>
      )}

      {/* ── Step Panel ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Build steps:</span>
          {STEPS.map(step => (
            <button key={step.id} onClick={() => {
              if (step.id === 8) {
                setActiveStep(8);
                void runBacktest(true);
              } else {
                setActiveStep(activeStep === step.id ? null : step.id);
              }
            }} style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              background: activeStep === step.id ? "#1e293b" : "#fff",
              color: activeStep === step.id ? "#f1f5f9" : "var(--muted)",
              border: `2px solid ${activeStep === step.id ? "#334155" : "var(--border)"}`,
              boxShadow: activeStep === step.id ? "0 2px 8px rgba(0,0,0,.2)" : "0 1px 2px rgba(0,0,0,.06)",
            }}>
              <span style={{ background: activeStep === step.id ? "#f97316" : "var(--dim)", color: activeStep === step.id ? "#fff" : "var(--muted)", borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{step.id}</span>
              {step.label}
            </button>
          ))}
          {activeStep !== null && (
            <button onClick={() => setActiveStep(null)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--muted)", border: "1px solid var(--border)" }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Step 1 info panel */}
        {activeStep === 1 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 1 — Market Structure Swings (HH · HL · LH · LL)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#10b981", fontWeight: 800, flexShrink: 0 }}>● HH / HL</span>
                  <span>Higher High / Higher Low — price making bullish structure (uptrend)</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#f97316", fontWeight: 800, flexShrink: 0 }}>● LH</span>
                  <span style={{ display: "inline" }}>Lower High · <span style={{ color: "#ef4444", fontWeight: 800 }}>● LL</span> Lower Low — bearish structure (downtrend)</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Swings come from candle colour flips (green→red = high, red→green = low). Only <strong>major</strong> swings are kept: the leg between two swings must move ≥ 5%, so small wiggles are absorbed — exactly like drawing structure by hand.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {swingLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#f97316", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Detecting…
                </div>
              ) : swingStats && (
                <>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Swing Highs</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#f97316" }}>{swingStats.highs}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>HH / LH above bars</p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Swing Lows</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#3b82f6" }}>{swingStats.lows}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>HL / LL below bars</p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Total</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>{swingStats.highs + swingStats.lows}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>pivot points</p>
                  </div>
                </>
              )}
            </div>

          </div>
        )}

        {/* Step 2 info panel */}
        {activeStep === 2 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 2 — Market Structure (close-based state machine)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#10b981", fontWeight: 800, flexShrink: 0 }}>▲ Bullish</span>
                  <span>Candle <strong>closes above</strong> the previous Lower High (LH). Stays bullish until a close below the active Higher Low.</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#ef4444", fontWeight: 800, flexShrink: 0 }}>▼ Bearish</span>
                  <span>Candle <strong>closes below</strong> the active Higher Low (HL). Stays bearish until a close above the active Lower High.</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Pullbacks, lower highs, wicks and candle colour are ignored — <strong>only candle closes matter</strong>. The coloured line on the chart shows the active structure per candle; arrows mark every break.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {swingLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#10b981", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Analysing…
                </div>
              ) : (
                <>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Current Structure</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: currentTrend === "bullish" ? "#10b981" : currentTrend === "bearish" ? "#ef4444" : "#64748b" }}>
                      {currentTrend === "bullish" ? "▲ BULLISH" : currentTrend === "bearish" ? "▼ BEARISH" : "— NEUTRAL"}
                    </p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Bullish Breaks</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#10b981" }}>{structEvents.filter(e => e.newTrend === "bullish").length}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>close &gt; LH</p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Bearish Breaks</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#ef4444" }}>{structEvents.filter(e => e.newTrend === "bearish").length}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>close &lt; HL</p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Last Break</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", marginTop: 6 }}>
                      {structEvents.length ? new Date(structEvents[structEvents.length - 1].time).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3 info panel */}
        {activeStep === 3 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 3 — Daily 50 EMA Filter (direction only)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#10b981", fontWeight: 800, flexShrink: 0 }}>▲ LONG only</span>
                  <span>Daily close <strong>above</strong> the 50 EMA → only long trades are allowed (EMA line green)</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#ef4444", fontWeight: 800, flexShrink: 0 }}>▼ SHORT only</span>
                  <span>Daily close <strong>below</strong> the 50 EMA → only short trades are allowed (EMA line red)</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  The EMA <strong>never creates an entry signal</strong> — it only decides which direction the bot may trade. Entries come from structure (steps 4–7).
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {swingLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#10b981", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Analysing…
                </div>
              ) : (
                <>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Allowed Direction Now</p>
                    <p style={{ fontSize: 22, fontWeight: 800, color: allowedDir === "long" ? "#10b981" : "#ef4444" }}>
                      {allowedDir === "long" ? "▲ LONG ONLY" : allowedDir === "short" ? "▼ SHORT ONLY" : "—"}
                    </p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Days Long Allowed</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#10b981" }}>{emaData.filter(p => p.direction === "long").length}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>close &gt; 50 EMA</p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Days Short Allowed</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#ef4444" }}>{emaData.filter(p => p.direction === "short").length}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>close &lt; 50 EMA</p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>50 EMA Now</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", marginTop: 6 }}>
                      {emaData.length ? `$${emaData[emaData.length - 1].value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 4 info panel */}
        {activeStep === 4 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 4 — Higher Timeframe Confirmation</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#10b981", fontWeight: 800, flexShrink: 0 }}>▲ Long</span>
                  <span>Weekly <strong>AND</strong> Daily bullish — or — Daily <strong>AND</strong> 4H bullish</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#ef4444", fontWeight: 800, flexShrink: 0 }}>▼ Short</span>
                  <span>Weekly <strong>AND</strong> Daily bearish — or — Daily <strong>AND</strong> 4H bearish</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  If neither condition is met → <strong>no trade</strong> (grey on the chart). All three timeframes use the same structure rules from step 2 — Weekly is built from the daily candles, 4H from real 4-hour candles.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {swingLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#10b981", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Analysing…
                </div>
              ) : htfNow && (
                <>
                  {([["Weekly", htfNow.weekly], ["Daily", htfNow.daily], ["4H", htfNow.h4]] as const).map(([tf, trend]) => (
                    <div key={tf} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center", minWidth: 90 }}>
                      <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{tf}</p>
                      <p style={{ fontSize: 17, fontWeight: 800, color: trend === "bullish" ? "#10b981" : trend === "bearish" ? "#ef4444" : "#64748b" }}>
                        {trend === "bullish" ? "▲ BULL" : trend === "bearish" ? "▼ BEAR" : "—"}
                      </p>
                      {tf === "4H" && !htfNow.h4_available && <p style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>no data</p>}
                    </div>
                  ))}
                  <div style={{ background: htfNow.allowed === "none" ? "#1e293b" : htfNow.allowed === "long" ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)", border: `2px solid ${htfNow.allowed === "none" ? "#334155" : htfNow.allowed === "long" ? "#10b981" : "#ef4444"}`, borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Verdict Now</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: htfNow.allowed === "long" ? "#10b981" : htfNow.allowed === "short" ? "#ef4444" : "#64748b" }}>
                      {htfNow.allowed === "long" ? "▲ LONG OK" : htfNow.allowed === "short" ? "▼ SHORT OK" : "✕ NO TRADE"}
                    </p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Tradeable Days</p>
                    <p style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>
                      <span style={{ color: "#10b981" }}>{htf.filter(p => p.allowed === "long").length}↑</span>
                      {" · "}
                      <span style={{ color: "#ef4444" }}>{htf.filter(p => p.allowed === "short").length}↓</span>
                      {" · "}
                      <span style={{ color: "#64748b" }}>{htf.filter(p => p.allowed === "none").length}✕</span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 5 info panel */}
        {activeStep === 5 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 5 — Score Every Timeframe (0–60 points each)</p>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                Weekly, Daily and 4H each get scored on 7 criteria. Direction comes from the step 3 EMA filter
                {scoreNow && <> — currently scoring for <strong style={{ color: scoreNow.direction === "long" ? "#10b981" : "#ef4444" }}>{scoreNow.direction.toUpperCase()}</strong> setups</>}.
                The coloured line on the chart shows days where the scores would pass step 6 (2 of 3 timeframes ≥ 45 <em>and</em> total ≥ 120).
              </div>
              {scoreHist.length > 0 && (
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                  Score passes in this period: <strong style={{ color: "#f1f5f9" }}>{scoreHist.filter(p => p.pass).length}</strong> of {scoreHist.length} days
                </p>
              )}
            </div>

            {swingLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#10b981", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                Scoring…
              </div>
            ) : scoreNow && (
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #334155" }}>
                      <th style={{ padding: "8px 14px", textAlign: "left", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 10 }}>Criterion (max)</th>
                      {["Weekly", "Daily", "4H"].map(tf => (
                        <th key={tf} style={{ padding: "8px 14px", textAlign: "center", color: "#94a3b8", fontWeight: 800 }}>{tf}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ["Trend aligned", "trend", 10],
                      ["AOI + rejection", "aoi", 10],
                      ["Touch of 50 EMA", "ema", 5],
                      ["Round number reject", "round", 5],
                      ["Structure rejection", "structRej", 10],
                      ["Engulfing at structure", "engulf", 10],
                      ["H&S break + retest", "hns", 10],
                    ] as const).map(([label, key, max]) => (
                      <tr key={key} style={{ borderBottom: "1px solid #273449" }}>
                        <td style={{ padding: "6px 14px", color: "#94a3b8" }}>{label} <span style={{ color: "#475569" }}>({max})</span></td>
                        {[scoreNow.weekly, scoreNow.daily, scoreNow.h4].map((tf, i) => (
                          <td key={i} style={{ padding: "6px 14px", textAlign: "center", fontWeight: 800, color: tf == null ? "#475569" : tf[key] > 0 ? "#10b981" : "#475569" }}>
                            {tf == null ? "—" : tf[key] > 0 ? `+${tf[key]}` : "0"}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr style={{ background: "#0f172a" }}>
                      <td style={{ padding: "8px 14px", color: "#f1f5f9", fontWeight: 800 }}>TOTAL / 60</td>
                      {[scoreNow.weekly, scoreNow.daily, scoreNow.h4].map((tf, i) => (
                        <td key={i} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 800, fontSize: 15, color: tf == null ? "#475569" : tf.total >= 45 ? "#10b981" : "#ef4444" }}>
                          {tf == null ? "—" : tf.total}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Step 6 info panel */}
        {activeStep === 6 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 6 — Trade Requirements (ALL must be true)</p>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                A trade may only be taken when every requirement below holds. The chart shows the days where
                requirements 1–4 were all met — those are the days the bot is <strong style={{ color: "#f1f5f9" }}>allowed to look for an entry</strong>.
                Requirement 5 (the entry signal itself) is step 7.
              </div>
              {setupHist.length > 0 && (
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                  Setup-valid days: <strong style={{ color: "#f1f5f9" }}>{setupHist.filter(p => p.valid).length}</strong> of {setupHist.length}
                  {" "}(<span style={{ color: "#10b981" }}>{setupHist.filter(p => p.valid && p.dir === "long").length} long</span>
                  {" · "}
                  <span style={{ color: "#ef4444" }}>{setupHist.filter(p => p.valid && p.dir === "short").length} short</span>)
                </p>
              )}
            </div>

            {swingLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#10b981", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                Checking…
              </div>
            ) : setupNow && (
              <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "14px 18px", minWidth: 320 }}>
                <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                  Checklist today — direction: <span style={{ color: setupNow.dir === "long" ? "#10b981" : "#ef4444", fontWeight: 800 }}>{setupNow.dir.toUpperCase()}</span>
                </p>
                {([
                  ["1. Daily EMA agrees with direction", setupNow.c1],
                  ["2. Higher timeframes aligned", setupNow.c2],
                  ["3. At least 2 of 3 TFs score ≥ 45", setupNow.c3],
                  ["4. Combined score ≥ 120 / 180", setupNow.c4],
                ] as const).map(([label, ok]) => (
                  <div key={label} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #273449" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: ok ? "#10b981" : "#ef4444", width: 18 }}>{ok ? "✓" : "✗"}</span>
                    <span style={{ fontSize: 13, color: ok ? "#e2e8f0" : "#64748b" }}>{label}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#f59e0b", width: 18 }}>⏳</span>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>5. Valid entry signal — step 7</span>
                </div>
                <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, textAlign: "center", fontWeight: 800, fontSize: 14,
                  background: setupNow.valid ? (setupNow.dir === "long" ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)") : "#0f172a",
                  border: `2px solid ${setupNow.valid ? (setupNow.dir === "long" ? "#10b981" : "#ef4444") : "#334155"}`,
                  color: setupNow.valid ? (setupNow.dir === "long" ? "#10b981" : "#ef4444") : "#64748b" }}>
                  {setupNow.valid
                    ? `SETUP VALID — waiting for ${setupNow.dir.toUpperCase()} entry signal`
                    : "NO SETUP — requirements not met"}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 7 info panel */}
        {activeStep === 7 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 7 — Entry Signal (4H chart)</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#3b82f6", fontWeight: 800, flexShrink: 0 }}>SoS</span>
                  <span>Shift of Structure — a 4H close breaks the last confirmed 4H swing high (long) or swing low (short)</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ color: "#d2a8ff", fontWeight: 800, flexShrink: 0 }}>Engulf</span>
                  <span>Bullish/Bearish Engulfing candle in the trade direction</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                  Signals only fire on days where the <strong>step 6 setup is valid</strong> — all previous conditions must be met first. The arrows on the chart are the actual entry moments; the coloured line shows the setup-valid window.
                  Chart labels are shortened to <strong>S</strong> and <strong>E</strong>; signals of both types on the same day are grouped as <strong>S+E</strong>.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {swingLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 14 }}>
                  <span style={{ width: 14, height: 14, border: "2px solid #334155", borderTopColor: "#10b981", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />
                  Scanning…
                </div>
              ) : (
                <>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Entry Signals</p>
                    <p style={{ fontSize: 28, fontWeight: 800, color: "#f1f5f9" }}>{entrySigs.length}</p>
                    <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      <span style={{ color: "#10b981" }}>{entrySigs.filter(s => s.dir === "long").length} long</span>
                      {" · "}
                      <span style={{ color: "#ef4444" }}>{entrySigs.filter(s => s.dir === "short").length} short</span>
                    </p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>SoS / Engulfing</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", marginTop: 6 }}>
                      {entrySigs.filter(s => s.kind === "SoS").length} · {entrySigs.filter(s => s.kind === "Engulfing").length}
                    </p>
                  </div>
                  <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Last Signal</p>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginTop: 6 }}>
                      {entrySigs.length
                        ? `${entrySigs[entrySigs.length - 1].kind} ${entrySigs[entrySigs.length - 1].dir.toUpperCase()} · ${new Date(entrySigs[entrySigs.length - 1].time).toLocaleDateString()}`
                        : "—"}
                    </p>
                  </div>
                  <div style={{ background: setupNow?.valid ? (setupNow.dir === "long" ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)") : "#1e293b", border: `2px solid ${setupNow?.valid ? (setupNow.dir === "long" ? "#10b981" : "#ef4444") : "#334155"}`, borderRadius: 10, padding: "12px 18px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Status Now</p>
                    <p style={{ fontSize: 14, fontWeight: 800, color: setupNow?.valid ? (setupNow.dir === "long" ? "#10b981" : "#ef4444") : "#64748b", marginTop: 6 }}>
                      {setupNow?.valid ? `WATCHING 4H FOR ${setupNow.dir.toUpperCase()} SIGNAL` : "NO SETUP — not watching"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeStep === 7 && !swingLoading && entrySigs.length > 0 && (
          <div style={{ marginTop: 10, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 18px" }}>
            <p style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 800, marginBottom: 9 }}>Entry list — why each entry appeared</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 340, overflowY: "auto", paddingRight: 4 }}>
              {[...entrySigs].reverse().map((signal, i) => {
                const sideColor = signal.dir === "long" ? "#10b981" : "#ef4444";
                return (
                  <div key={`${signal.time}-${signal.kind}-${i}`} style={{ display: "grid", gridTemplateColumns: "175px 135px minmax(300px, 1fr)", gap: 14, alignItems: "center", background: "#1e293b", border: "1px solid #334155", borderLeft: `3px solid ${sideColor}`, borderRadius: 8, padding: "9px 12px" }}>
                    <div>
                      <p style={{ color: "#f1f5f9", fontSize: 12, fontWeight: 800 }}>{new Date(signal.time).toLocaleString()}</p>
                      <p style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>${signal.price.toLocaleString()}</p>
                    </div>
                    <p style={{ color: sideColor, fontSize: 11, fontWeight: 900 }}>{signal.dir.toUpperCase()} · {signal.kind === "SoS" ? "SHIFT OF STRUCTURE" : "ENGULFING"}</p>
                    <p style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.4 }}>{signal.reason}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 8 info panel — selecting this step runs the complete backtest */}
        {activeStep === 8 && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 300 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#f1f5f9", marginBottom: 8 }}>Step 8 — Risk Management & Full Backtest</p>
              <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>
                Clicking Step 8 runs the complete Steps 1–8 strategy for the selected market and period. Trades are opened only after a valid Step 7 signal.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(145px, 1fr))", gap: 8, flex: 2 }}>
              {[
                { label: "Account risk", value: "1% per trade" },
                { label: "Stop loss", value: "Beyond last HL / LH" },
                { label: "Take profit", value: "1:3 risk–reward" },
                { label: "Position size", value: "Automatic from SL" },
              ].map(item => (
                <div key={item.label} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 9, padding: "11px 13px" }}>
                  <p style={{ color: "#64748b", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>{item.label}</p>
                  <p style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 800, marginTop: 5 }}>{item.value}</p>
                </div>
              ))}
            </div>
            <div style={{ minWidth: 150, padding: "13px 16px", borderRadius: 9, textAlign: "center", background: running ? "rgba(59,130,246,.12)" : result ? "rgba(16,185,129,.12)" : "#1e293b", border: `1px solid ${running ? "rgba(59,130,246,.45)" : result ? "rgba(16,185,129,.4)" : "#334155"}` }}>
              <p style={{ color: "#64748b", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em" }}>Backtest</p>
              <p style={{ color: running ? "#60a5fa" : result ? "#10b981" : "#94a3b8", fontSize: 14, fontWeight: 900, marginTop: 5 }}>
                {running ? "RUNNING…" : result ? "COMPLETE ✓" : "READY"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Chart info bar ── */}
      <div style={{ display: "flex", alignItems: "stretch", background: "#fff", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
        <div style={{ padding: "14px 22px", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, background: "rgba(0,200,150,.04)" }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--teal)" }} className="pulse" />
          <span style={{ fontWeight: 800, fontSize: 18 }}>{symbol}</span>
          <span style={{ fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "rgba(0,200,150,.12)", border: "1px solid rgba(0,200,150,.25)", color: "var(--teal)", fontWeight: 700 }}>1D</span>
        </div>

        {activeStep === 1 ? (
          // Step 1 legend in the info bar
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#f97316" }}>Step 1: Swing Detection</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Swing Highs</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#f97316" }}>{swingStats?.highs ?? "—"} <span style={{ fontSize: 13 }}>HH / LH</span></p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Swing Lows</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6" }}>{swingStats?.lows ?? "—"} <span style={{ fontSize: 13 }}>HL / LL</span></p>
            </div>
          </>
        ) : activeStep === 2 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#10b981" }}>Step 2: Market Structure</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Structure Now</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: currentTrend === "bullish" ? "var(--teal)" : currentTrend === "bearish" ? "var(--red)" : "var(--muted)" }}>
                {currentTrend.toUpperCase()}
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Breaks</p>
              <p style={{ fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: "var(--teal)" }}>{structEvents.filter(e => e.newTrend === "bullish").length}↑</span>
                {" · "}
                <span style={{ color: "var(--red)" }}>{structEvents.filter(e => e.newTrend === "bearish").length}↓</span>
              </p>
            </div>
          </>
        ) : activeStep === 3 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>Step 3: Daily EMA Filter</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Allowed Now</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: allowedDir === "long" ? "var(--teal)" : "var(--red)" }}>
                {allowedDir === "long" ? "LONG ONLY ▲" : allowedDir === "short" ? "SHORT ONLY ▼" : "—"}
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Long / Short Days</p>
              <p style={{ fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: "var(--teal)" }}>{emaData.filter(p => p.direction === "long").length}</span>
                {" / "}
                <span style={{ color: "var(--red)" }}>{emaData.filter(p => p.direction === "short").length}</span>
              </p>
            </div>
          </>
        ) : activeStep === 4 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#8b5cf6" }}>Step 4: HTF Confirmation</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>W / D / 4H</p>
              <p style={{ fontSize: 15, fontWeight: 800 }}>
                {([htfNow?.weekly, htfNow?.daily, htfNow?.h4] as const).map((t, i) => (
                  <span key={i} style={{ color: t === "bullish" ? "var(--teal)" : t === "bearish" ? "var(--red)" : "var(--muted)" }}>
                    {t === "bullish" ? "▲" : t === "bearish" ? "▼" : "—"}{i < 2 ? " " : ""}
                  </span>
                ))}
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Verdict</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: htfNow?.allowed === "long" ? "var(--teal)" : htfNow?.allowed === "short" ? "var(--red)" : "var(--muted)" }}>
                {htfNow?.allowed === "long" ? "LONG OK" : htfNow?.allowed === "short" ? "SHORT OK" : "NO TRADE"}
              </p>
            </div>
          </>
        ) : activeStep === 5 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#ec4899" }}>Step 5: TF Scoring</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>W / D / 4H Now</p>
              <p className="num" style={{ fontSize: 16, fontWeight: 800 }}>
                {scoreNow ? (
                  <>
                    <span style={{ color: scoreNow.weekly.total >= 45 ? "var(--teal)" : "var(--muted)" }}>{scoreNow.weekly.total}</span>
                    {" · "}
                    <span style={{ color: scoreNow.daily.total >= 45 ? "var(--teal)" : "var(--muted)" }}>{scoreNow.daily.total}</span>
                    {" · "}
                    <span style={{ color: scoreNow.h4 && scoreNow.h4.total >= 45 ? "var(--teal)" : "var(--muted)" }}>{scoreNow.h4?.total ?? "—"}</span>
                  </>
                ) : "—"}
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Combined</p>
              <p className="num" style={{ fontSize: 16, fontWeight: 800, color: scoreNow && (scoreNow.weekly.total + scoreNow.daily.total + (scoreNow.h4?.total ?? 0)) >= 120 ? "var(--teal)" : "var(--muted)" }}>
                {scoreNow ? `${scoreNow.weekly.total + scoreNow.daily.total + (scoreNow.h4?.total ?? 0)} / 180` : "—"}
              </p>
            </div>
          </>
        ) : activeStep === 6 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>Step 6: Trade Requirements</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Checklist Now</p>
              <p style={{ fontSize: 16, fontWeight: 800 }}>
                {setupNow ? ([setupNow.c1, setupNow.c2, setupNow.c3, setupNow.c4] as const).map((ok, i) => (
                  <span key={i} style={{ color: ok ? "var(--teal)" : "var(--red)" }}>{ok ? "✓" : "✗"}</span>
                )) : "—"}
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Verdict</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: setupNow?.valid ? (setupNow.dir === "long" ? "var(--teal)" : "var(--red)") : "var(--muted)" }}>
                {setupNow?.valid ? `SETUP ${setupNow.dir.toUpperCase()}` : "NO SETUP"}
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Valid Days</p>
              <p style={{ fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: "var(--teal)" }}>{setupHist.filter(p => p.valid && p.dir === "long").length}↑</span>
                {" · "}
                <span style={{ color: "var(--red)" }}>{setupHist.filter(p => p.valid && p.dir === "short").length}↓</span>
              </p>
            </div>
          </>
        ) : activeStep === 7 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#3b82f6" }}>Step 7: Entry Signal</p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Signals</p>
              <p style={{ fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: "var(--teal)" }}>{entrySigs.filter(s => s.dir === "long").length}↑</span>
                {" · "}
                <span style={{ color: "var(--red)" }}>{entrySigs.filter(s => s.dir === "short").length}↓</span>
              </p>
            </div>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Status</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: setupNow?.valid ? (setupNow.dir === "long" ? "var(--teal)" : "var(--red)") : "var(--muted)" }}>
                {setupNow?.valid ? `WATCHING ${setupNow.dir.toUpperCase()}` : "NOT WATCHING"}
              </p>
            </div>
          </>
        ) : activeStep === 8 ? (
          <>
            <div style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>Mode</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#10b981" }}>Step 8: Full Backtest</p>
            </div>
            {[
              { label: "Trades", value: result ? String(result.trades?.length ?? 0) : "—" },
              { label: "Win Rate", value: result ? `${fmt(result.winrate_pct, 1)}%` : "—" },
              { label: "Net P&L", value: result ? `$${fmt(result.net_pnl)}` : "—", color: result ? (result.net_pnl >= 0 ? "var(--teal)" : "var(--red)") : undefined },
            ].map(item => (
              <div key={item.label} style={{ padding: "14px 20px", borderRight: "1px solid var(--border)" }}>
                <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>{item.label}</p>
                <p className="num" style={{ fontSize: 16, fontWeight: 800, color: item.color }}>{item.value}</p>
              </div>
            ))}
          </>
        ) : (
          // Normal backtest stats
          <>
            {[
              { label: "Candles",      value: candles.length > 0 ? candles.length.toLocaleString() : "—" },
              { label: "Signals",      value: markers.filter(m => m.type === "Entry").length > 0 ? String(markers.filter(m => m.type === "Entry").length) : "—" },
              { label: "Long ↑",       value: longs  > 0 ? String(longs)  : "—", color: "var(--teal)" },
              { label: "Short ↓",      value: shorts > 0 ? String(shorts) : "—", color: "var(--red)"  },
              { label: "Win Rate",     value: result ? `${fmt(result.winrate_pct, 1)}%` : "—", color: result ? (result.winrate_pct >= 50 ? "var(--teal)" : "var(--red)") : undefined },
              { label: "Net P&L",      value: result ? `$${fmt(result.net_pnl)}` : "—",         color: result ? (result.net_pnl   >= 0 ? "var(--teal)" : "var(--red)") : undefined },
              { label: "Prof. Factor", value: result ? fmt(result.profit_factor) : "—",         color: result ? (result.profit_factor >= 1 ? "var(--teal)" : "var(--red)") : undefined },
            ].map(item => (
              <div key={item.label} style={{ padding: "14px 20px", borderRight: "1px solid var(--border)", minWidth: 90 }}>
                <p style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 5 }}>{item.label}</p>
                <p className="num" style={{ fontSize: 18, fontWeight: 700, color: item.color ?? "var(--text)" }}>{item.value}</p>
              </div>
            ))}
          </>
        )}

        <div style={{ marginLeft: "auto", padding: "14px 18px", display: "flex", gap: 14, alignItems: "center" }}>
          {activeStep === 1 ? (
            <>{legendChips([{ c: "#10b981", l: "HH / HL (bullish)" }, { c: "#f97316", l: "LH" }, { c: "#ef4444", l: "LL (bearish)" }], "dot")}</>
          ) : activeStep === 2 ? (
            <>{legendChips([{ c: "#10b981", l: "Bullish structure" }, { c: "#ef4444", l: "Bearish structure" }, { c: "#64748b", l: "Neutral" }])}</>
          ) : activeStep === 3 ? (
            <>{legendChips([{ c: "#10b981", l: "50 EMA — longs only" }, { c: "#ef4444", l: "50 EMA — shorts only" }])}</>
          ) : activeStep === 4 ? (
            <>{legendChips([
              { c: "#10b981", l: "Long allowed" }, { c: "#ef4444", l: "Short allowed" }, { c: "#64748b", l: "No trade" },
              { c: "#a855f7", l: "W 50 EMA" }, { c: "#f59e0b", l: "D 50 EMA" }, { c: "#06b6d4", l: "4H 50 EMA" },
            ])}</>
          ) : activeStep === 5 ? (
            <>{legendChips([{ c: "#10b981", l: "Score pass (long)" }, { c: "#ef4444", l: "Score pass (short)" }, { c: "#64748b", l: "Below threshold" }])}</>
          ) : activeStep === 6 ? (
            <>{legendChips([{ c: "#10b981", l: "Setup valid (long)" }, { c: "#ef4444", l: "Setup valid (short)" }, { c: "#64748b", l: "No setup" }])}</>
          ) : activeStep === 7 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
              <span><strong style={{ color: "#3b82f6" }}>S</strong> Shift of Structure</span>
              <span><strong style={{ color: "#a78bfa" }}>E</strong> Engulfing</span>
              <span><strong style={{ color: "#10b981" }}>↑</strong> Long</span>
              <span><strong style={{ color: "#ef4444" }}>↓</strong> Short</span>
            </div>
          ) : (
            <>
              {[{ c: "var(--teal)", l: "Long" }, { c: "var(--red)", l: "Short" }, { c: "var(--blue)", l: "TP" }, { c: "var(--yellow)", l: "SL" }].map(x => (
                <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: x.c }} />
                  <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{x.l}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Chart ── */}
      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "0 0 4px", marginBottom: 18, overflow: "hidden", position: "relative", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
        {loading && (
          <div style={{ position: "absolute", top: 12, left: 16, zIndex: 10, display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--muted)" }}>
            <span style={{ width: 11, height: 11, border: "2px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", display: "inline-block", animation: "spin .7s linear infinite" }} />Loading…
          </div>
        )}
        {candles.length > 0 ? (
          <CandleChart candles={candles} signals={markers} regimeLine={regimeLine}
            regimeTitle={activeStep === 3 ? "50 EMA" : undefined}
            extraLines={activeStep === 4 ? [
              { label: "W 50 EMA",  color: "#a855f7", points: emaWeekly },
              { label: "D 50 EMA",  color: "#f59e0b", points: emaData.map(p => ({ time: p.time, value: p.value })) },
              { label: "4H 50 EMA", color: "#06b6d4", points: emaH4, dashed: true },
            ].filter(l => !hidden.has(l.label)) : undefined}
            height={480}
            highlightTrade={highlightTrade} tradeRanges={tradeRanges} onTradeClick={selectTrade} />
        ) : (
          <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTopColor: "var(--teal)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "var(--muted)", fontSize: 15 }}>Loading chart…</p>
          </div>
        )}
        {activeStep === null && !running && markers.length === 0 && candles.length > 0 && (
          <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,.95)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 20px", fontSize: 15, color: "var(--muted)", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,.1)" }}>
            Hit <strong style={{ color: "var(--teal)" }}>▶ Run Backtest</strong> to see trade signals
          </div>
        )}
      </div>

      {/* ── Backtest results ── */}
      {result && (activeStep === null || activeStep === 8) && (
        <div className="slide-in">
          <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 4, width: "fit-content" }}>
            {(["stats","trades"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 24px", borderRadius: 7, fontSize: 15, fontWeight: 700, cursor: "pointer", background: tab === t ? "var(--teal)" : "transparent", color: tab === t ? "#fff" : "var(--muted)", border: "none", boxShadow: tab === t ? "0 2px 8px rgba(0,200,150,.3)" : "none" }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === "stats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Win Rate"      value={`${fmt(result.winrate_pct, 1)}%`}   color={result.winrate_pct >= 50 ? "green" : "red"} glow />
                <StatCard label="Profit Factor" value={fmt(result.profit_factor)}           color={result.profit_factor >= 1 ? "green" : "red"} />
                <StatCard label="Max Drawdown"  value={`${fmt(result.max_drawdown_pct)}%`} color={result.max_drawdown_pct > 15 ? "red" : "yellow"} />
                <StatCard label="Net P&L"       value={`$${fmt(result.net_pnl)}`}          color={result.net_pnl >= 0 ? "green" : "red"} glow />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <StatCard label="Total Trades"  value={String(result.total_trades)} sub={`${result.wins}W · ${result.losses}L · ${longs}↑ ${shorts}↓`} />
                <StatCard label="Avg Win"       value={`$${fmt(result.avg_win)}`}  color="green" />
                <StatCard label="Avg Loss"      value={`$${fmt(result.avg_loss)}`} color="red" />
                <StatCard label="Worst Streak"  value={String(result.largest_losing_streak)} color="yellow" />
              </div>
              {months.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
                  <p style={{ fontWeight: 700, marginBottom: 14, fontSize: 15 }}>Monthly Returns</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(95px, 1fr))", gap: 8 }}>
                    {months.map(([month, pnl]) => {
                      const pos = (pnl as number) >= 0;
                      return (
                        <div key={month} style={{ borderRadius: 9, padding: "10px 10px", textAlign: "center", background: pos ? "rgba(0,200,150,.07)" : "rgba(234,57,67,.07)", border: `1px solid ${pos ? "rgba(0,200,150,.2)" : "rgba(234,57,67,.2)"}` }}>
                          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4, fontWeight: 700, textTransform: "uppercase" }}>{month}</p>
                          <p className="num" style={{ fontSize: 15, fontWeight: 800, color: pos ? "var(--teal)" : "var(--red)" }}>{pos ? "+" : ""}${fmt(pnl as number, 0)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "trades" && (
            <TradesTable trades={result.trades ?? []} selectedIdx={selectedTradeIdx} onSelect={selectTrade} />
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        tr:hover td { background: rgba(0,200,150,.03); }
      `}</style>
    </div>
  );
}
