import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const maxDuration = 60;

const HL = "https://api.hyperliquid.xyz/info";

interface RawCandle { t: number; o: string; h: string; l: string; c: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; }

async function fetchBars(symbol: string, days: number): Promise<Bar[]> {
  const end   = Date.now();
  const start = end - days * 86_400_000;
  const resp  = await fetch(HL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval: "1d", startTime: start, endTime: end } }),
  });
  const raw: RawCandle[] = await resp.json();
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c }))
            .sort((a, b) => a.time - b.time);
}

// ── 200 SMA (expanding window so line starts from bar 1) ──────────────────────
function sma200(bars: Bar[]): number[] {
  const out: number[] = []; let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= 200) sum -= bars[i - 200].close;
    out.push(sum / Math.min(i + 1, 200));
  }
  return out;
}

// ── Pivot highs / lows (bar must be local extreme over ±N bars) ───────────────
function pivots(bars: Bar[], type: "high" | "low", n = 3): { price: number; idx: number }[] {
  const out: { price: number; idx: number }[] = [];
  for (let i = n; i < bars.length - n; i++) {
    const val = type === "high" ? bars[i].high : bars[i].low;
    let ok = true;
    for (let j = i - n; j <= i + n && ok; j++) {
      if (j === i) continue;
      ok = type === "high" ? bars[j].high < val : bars[j].low > val;
    }
    if (ok) out.push({ price: val, idx: i });
  }
  return out;
}

// ── Pattern detection at bar `i` ─────────────────────────────────────────────
function detectPattern(bars: Bar[], i: number, side: "bullish" | "bearish"): string | null {
  if (i < 20) return null;
  const win    = bars.slice(i - 40, i + 1);  // look-back window
  const offset = i - 40 < 0 ? i : 40;        // index of current bar inside `win`

  const pHigh = pivots(win, "high", 3).filter(p => p.idx < offset);
  const pLow  = pivots(win, "low",  3).filter(p => p.idx < offset);
  const close = bars[i].close;

  if (side === "bearish") {
    // ── Double Top ──────────────────────────────────────────────────────────
    if (pHigh.length >= 2) {
      const [a, b] = pHigh.slice(-2);
      const sim = Math.abs(a.price - b.price) / a.price;
      if (sim < 0.025) {
        const neck = Math.min(...win.slice(a.idx, b.idx + 1).map(w => w.low));
        if (close < neck) return "📉 Double Top — price tested resistance twice and broke down";
      }
    }
    // ── Triple Top ──────────────────────────────────────────────────────────
    if (pHigh.length >= 3) {
      const [a, b, c] = pHigh.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.03 && Math.abs(c.price - avg) / avg < 0.03) {
        const neck = Math.min(...win.slice(a.idx, c.idx + 1).map(w => w.low));
        if (close < neck) return "📉 Triple Top — three failed attempts at resistance, breakdown confirmed";
      }
    }
    // ── Head & Shoulders ────────────────────────────────────────────────────
    if (pHigh.length >= 3) {
      const [ls, head, rs] = pHigh.slice(-3);
      const shoulderSim = Math.abs(ls.price - rs.price) / ls.price;
      if (head.price > ls.price && head.price > rs.price && shoulderSim < 0.04) {
        const neckL = win[ls.idx].low, neckR = win[rs.idx].low;
        const neck  = Math.max(neckL, neckR);
        if (close < neck) return "📉 Head & Shoulders — classic reversal: left shoulder → head → right shoulder, neckline broken";
      }
    }
    // ── Bearish Engulfing ───────────────────────────────────────────────────
    const prev = bars[i - 1];
    if (prev.close > prev.open && close < bars[i].open && close < prev.open && bars[i].open > prev.close)
      return "📉 Bearish Engulfing — red candle fully swallowed the previous green candle";
  }

  if (side === "bullish") {
    // ── Double Bottom ───────────────────────────────────────────────────────
    if (pLow.length >= 2) {
      const [a, b] = pLow.slice(-2);
      const sim = Math.abs(a.price - b.price) / a.price;
      if (sim < 0.025) {
        const neck = Math.max(...win.slice(a.idx, b.idx + 1).map(w => w.high));
        if (close > neck) return "📈 Double Bottom — price found support twice and broke out";
      }
    }
    // ── Triple Bottom ───────────────────────────────────────────────────────
    if (pLow.length >= 3) {
      const [a, b, c] = pLow.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.03 && Math.abs(c.price - avg) / avg < 0.03) {
        const neck = Math.max(...win.slice(a.idx, c.idx + 1).map(w => w.high));
        if (close > neck) return "📈 Triple Bottom — three bounces from support, breakout confirmed";
      }
    }
    // ── Inverted Head & Shoulders ────────────────────────────────────────────
    if (pLow.length >= 3) {
      const [ls, head, rs] = pLow.slice(-3);
      const shoulderSim = Math.abs(ls.price - rs.price) / ls.price;
      if (head.price < ls.price && head.price < rs.price && shoulderSim < 0.04) {
        const neckL = win[ls.idx].high, neckR = win[rs.idx].high;
        const neck  = Math.min(neckL, neckR);
        if (close > neck) return "📈 Inverted Head & Shoulders — reversal: left shoulder → head → right shoulder, neckline broken";
      }
    }
    // ── Bullish Engulfing ───────────────────────────────────────────────────
    const prev = bars[i - 1];
    if (prev.close < prev.open && close > bars[i].open && close > prev.open && bars[i].open < prev.close)
      return "📈 Bullish Engulfing — green candle fully swallowed the previous red candle";
  }

  return null;
}

// ── Post-trade analysis ───────────────────────────────────────────────────────
function analyse(pnl: number, holdDays: number, exitReason: string, streak: number): string {
  if (exitReason === "eod") return "Still open at end of data.";
  if (pnl > 0) {
    if (holdDays <= 2) return `Fast win in ${holdDays}d — the pattern had strong immediate follow-through.`;
    return `Pattern played out in ${holdDays} days — price respected the signal and hit the target.`;
  }
  if (holdDays <= 1) return `False signal — price reversed within a day. The pattern formed but lacked momentum. This often happens in low-volume or news-driven sessions.`;
  if (streak >= 2) return `${streak + 1} losses in a row — market was ranging with no clear momentum. Patterns formed but the trend wasn't strong enough to follow through.`;
  return `Stop hit after ${holdDays} days — the pattern was valid but a stronger opposing move took over. Could indicate a larger structure shift.`;
}

// ── Trade interface ───────────────────────────────────────────────────────────
interface Trade {
  direction: "long" | "short";
  entryTime: number; exitTime: number;
  entryPrice: number; exitPrice: number;
  slPrice: number; tpPrice: number;
  pnl: number; size: number;
  exitReason: "tp" | "sl" | "eod";
  entryReason: string; analysis: string;
}

// ── Engine ────────────────────────────────────────────────────────────────────
function runEngine(bars: Bar[], ma: number[]) {
  const RISK   = 0.01;   // 1% risk per trade
  const SL_PCT = 0.015;  // 1.5% stop-loss
  const TP_PCT = 0.045;  // 4.5% take-profit (3:1 R:R)
  const CAP    = 10_000;

  const trades: Trade[]  = [];
  const signals: object[] = [];
  let balance = CAP;
  let open: Trade | null  = null;
  let lossStreak = 0;

  for (let i = 5; i < bars.length; i++) {
    const bar = bars[i];

    // ── manage open trade ──
    if (open) {
      let closed = false;
      if (open.direction === "long") {
        if (bar.low  <= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = "sl"; closed = true; }
        if (bar.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      } else {
        if (bar.high >= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = "sl"; closed = true; }
        if (bar.low  <= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      }
      if (closed) {
        open.exitTime = bar.time;
        const mult  = open.direction === "long" ? 1 : -1;
        open.pnl    = (open.exitPrice - open.entryPrice) * mult * open.size;
        balance    += open.pnl;
        const holdD = Math.round((open.exitTime - open.entryTime) / 86_400_000);
        open.analysis = analyse(open.pnl, holdD, open.exitReason, lossStreak);
        if (open.pnl <= 0) lossStreak++; else lossStreak = 0;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : "Exit SL", price: open.exitPrice });
        trades.push(open);
        open = null;
      }
      continue;
    }

    // ── check entry ──
    const aboveMA = bar.close > ma[i];
    const side    = aboveMA ? "bullish" : "bearish";
    const dir     = aboveMA ? "long"    : "short";

    const pattern = detectPattern(bars, i, side);
    if (!pattern) continue;

    const slPrice = dir === "long"  ? bar.close * (1 - SL_PCT) : bar.close * (1 + SL_PCT);
    const tpPrice = dir === "long"  ? bar.close * (1 + TP_PCT) : bar.close * (1 - TP_PCT);
    const slDist  = Math.abs(bar.close - slPrice);
    const size    = slDist > 0 ? (balance * RISK) / slDist : 0;
    if (size <= 0) continue;

    const maLabel = `200 MA @ $${ma[i].toFixed(0)}`;
    open = {
      direction: dir, entryTime: bar.time, exitTime: 0,
      entryPrice: bar.close, exitPrice: 0, slPrice, tpPrice, size,
      pnl: 0, exitReason: "eod",
      entryReason: `${pattern} · ${dir === "long" ? "Above" : "Below"} ${maLabel}`,
      analysis: "",
    };
    signals.push({ timestamp: new Date(bar.time).toISOString(), direction: dir, type: "Entry", price: bar.close });
  }

  if (open) {
    const last    = bars[bars.length - 1];
    open.exitTime = last.time; open.exitPrice = last.close; open.exitReason = "eod";
    const mult    = open.direction === "long" ? 1 : -1;
    open.pnl      = (open.exitPrice - open.entryPrice) * mult * open.size;
    open.analysis = "Still open at end of data.";
    balance      += open.pnl;
    trades.push(open);
  }

  return { trades, signals };
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function stats(trades: Trade[]) {
  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const net    = trades.reduce((s, t) => s + t.pnl, 0);
  const gW     = wins.reduce((s, t) => s + t.pnl, 0);
  const gL     = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  let peak = 10_000, maxDD = 0, eq = 10_000;
  for (const t of trades) { eq += t.pnl; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, (peak - eq) / peak * 100); }

  let streak = 0, maxS = 0;
  for (const t of trades) { if (t.pnl <= 0) { streak++; maxS = Math.max(maxS, streak); } else streak = 0; }

  const monthly: Record<string, number> = {};
  for (const t of trades) {
    const k = new Date(t.exitTime || t.entryTime).toISOString().slice(0, 7);
    monthly[k] = (monthly[k] ?? 0) + t.pnl;
  }

  return {
    total_trades: trades.length, wins: wins.length, losses: losses.length,
    winrate_pct: trades.length ? +(wins.length / trades.length * 100).toFixed(1) : 0,
    net_pnl: +net.toFixed(2),
    profit_factor: gL > 0 ? +(gW / gL).toFixed(2) : gW > 0 ? 99 : 0,
    avg_win:  wins.length   ? +(gW / wins.length).toFixed(2)   : 0,
    avg_loss: losses.length ? +(gL / losses.length).toFixed(2) : 0,
    max_drawdown_pct: +maxDD.toFixed(2),
    largest_losing_streak: maxS,
    monthly_returns: monthly,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 365 } = await req.json();
    const bars  = await fetchBars(symbol, limit + 200);
    const ma    = sma200(bars);
    const { trades, signals } = runEngine(bars, ma);
    return NextResponse.json({
      ...stats(trades), signals,
      trades: trades.map(t => ({
        direction:    t.direction,
        entry_price:  +t.entryPrice.toFixed(2),
        exit_price:   +t.exitPrice.toFixed(2),
        entry_time:   new Date(t.entryTime).toISOString(),
        exit_time:    new Date(t.exitTime || t.entryTime).toISOString(),
        exit_reason:  t.exitReason,
        entry_reason: t.entryReason,
        analysis:     t.analysis,
        pnl:          +t.pnl.toFixed(2),
        sl_price:     +t.slPrice.toFixed(2),
        tp_price:     +t.tpPrice.toFixed(2),
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
