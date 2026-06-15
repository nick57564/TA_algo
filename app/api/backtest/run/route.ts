import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const maxDuration = 60;

const HL = "https://api.hyperliquid.xyz/info";

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchBars(symbol: string, days: number): Promise<Bar[]> {
  const end   = Date.now();
  const start = end - days * 86_400_000;
  const resp  = await fetch(HL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval: "1d", startTime: start, endTime: end } }),
  });
  const raw: RawCandle[] = await resp.json();
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
            .sort((a, b) => a.time - b.time);
}

// ── RSI(14) ───────────────────────────────────────────────────────────────────
function rsi(bars: Bar[], idx: number, period = 14): number {
  if (idx < period) return 50;
  let gains = 0, losses = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

// ── Volume spike (bar volume vs N-bar average) ────────────────────────────────
function volumeRatio(bars: Bar[], idx: number, n = 10): number {
  if (idx < n) return 1;
  const avg = bars.slice(idx - n, idx).reduce((s, b) => s + b.volume, 0) / n;
  return avg > 0 ? bars[idx].volume / avg : 1;
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
// Returns { name, engulfing } where engulfing is a bonus confirmation flag
function detectPattern(bars: Bar[], i: number, side: "bullish" | "bearish"): { name: string; engulfing: boolean } | null {
  if (i < 20) return null;
  const win    = bars.slice(i - 100, i + 1);
  const offset = i - 100 < 0 ? i : 100;

  // n=2: only needs 2 bars on each side to confirm a local high/low
  const pHigh = pivots(win, "high", 2).filter(p => p.idx < offset);
  const pLow  = pivots(win, "low",  2).filter(p => p.idx < offset);
  const close = bars[i].close;

  // Check engulfing on this bar (used as bonus, not standalone trigger)
  const prev = bars[i - 1];
  const bearEngulf = prev.close > prev.open && bars[i].open > prev.close && close < prev.open;
  const bullEngulf = prev.close < prev.open && bars[i].open < prev.close && close > prev.open;

  if (side === "bearish") {
    // ── Double Top (tighter 1.5% tolerance, require 1% neckline break) ──────
    if (pHigh.length >= 2) {
      const [a, b] = pHigh.slice(-2);
      const sim = Math.abs(a.price - b.price) / a.price;
      // Peaks must be at least 5 bars apart to avoid detecting same move twice
      if (sim < 0.02 && Math.abs(a.idx - b.idx) >= 5) {
        const neck = Math.min(...win.slice(a.idx, b.idx + 1).map(w => w.low));
        if (close < neck * 0.995) return { name: "📉 Double Top — two equal peaks, neckline broken", engulfing: bearEngulf };
      }
    }
    // ── Triple Top ──────────────────────────────────────────────────────────
    if (pHigh.length >= 3) {
      const [a, b, c] = pHigh.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.025 && Math.abs(c.price - avg) / avg < 0.025) {
        const neck = Math.min(...win.slice(a.idx, c.idx + 1).map(w => w.low));
        if (close < neck * 0.995) return { name: "📉 Triple Top — three failed attempts at resistance, breakdown confirmed", engulfing: bearEngulf };
      }
    }
    // ── Head & Shoulders — visual approach ──────────────────────────────────
    // Iterate every pivot high as a candidate HEAD, look for LS before and RS after
    {
      let found = false;
      for (let pi = pHigh.length - 1; pi >= 1 && !found; pi--) {
        const head = pHigh[pi];
        // Left shoulder: the highest pivot strictly before head
        // LS = most recent pivot before head that is at least 2% below the head
        const lsCandidates = pHigh.filter(p => p.idx < head.idx && (head.price - p.price) / head.price >= 0.02);
        if (lsCandidates.length === 0) continue;
        const ls = lsCandidates[lsCandidates.length - 1]; // most recent, not highest
        // Right shoulder: find the trough after head, then the highest point after that trough
        // This skips the immediate high right beside the head and finds the visual RS
        const afterHead = win.slice(head.idx + 1);
        if (afterHead.length < 3) continue;
        // Trough = index of the lowest close after the head
        const troughRelIdx = afterHead.reduce((minI, b, i) => b.close < afterHead[minI].close ? i : minI, 0);
        if (troughRelIdx >= afterHead.length - 1) continue;
        // RS = highest high after the trough
        const afterTrough = afterHead.slice(troughRelIdx + 1);
        if (afterTrough.length === 0) continue;
        const rsPrice  = Math.max(...afterTrough.map(b => b.high));
        const rsRelIdx = head.idx + 1 + troughRelIdx + 1 + afterTrough.findIndex(b => b.high === rsPrice);
        const rsIdx    = rsRelIdx;
        // Conditions
        const headLift    = Math.min(head.price - ls.price, head.price - rsPrice) / head.price;
        const shoulderSim = Math.abs(ls.price - rsPrice) / ls.price;
        if (headLift > 0.015 && shoulderSim < 0.06 && rsPrice < head.price) {
          const neckL = Math.min(...win.slice(ls.idx, head.idx + 1).map(b => b.low));
          const neckR = Math.min(...win.slice(head.idx, rsIdx + 1).map(b => b.low));
          const neck  = Math.max(neckL, neckR);
          if (close < neck * 0.995) {
            found = true;
            return { name: "📉 Head & Shoulders — left shoulder, head, right shoulder formed; neckline broken", engulfing: bearEngulf };
          }
        }
      }
    }
  } // end if (side === "bearish")

  if (side === "bullish") {
    // ── Double Bottom (tighter 1.5% tolerance, require 1% neckline break) ───
    if (pLow.length >= 2) {
      const [a, b] = pLow.slice(-2);
      const sim = Math.abs(a.price - b.price) / a.price;
      if (sim < 0.02 && Math.abs(a.idx - b.idx) >= 5) {
        const neck = Math.max(...win.slice(a.idx, b.idx + 1).map(w => w.high));
        if (close > neck * 1.005) return { name: "📈 Double Bottom — two equal lows, neckline broken", engulfing: bullEngulf };
      }
    }
    // ── Triple Bottom ───────────────────────────────────────────────────────
    if (pLow.length >= 3) {
      const [a, b, c] = pLow.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.025 && Math.abs(c.price - avg) / avg < 0.025) {
        const neck = Math.max(...win.slice(a.idx, c.idx + 1).map(w => w.high));
        if (close > neck * 1.005) return { name: "📈 Triple Bottom — three bounces from support, breakout confirmed", engulfing: bullEngulf };
      }
    }
    // ── Inverted H&S (head must be meaningfully lower than shoulders) ────────
    if (pLow.length >= 3) {
      const [ls, head, rs] = pLow.slice(-3);
      const shoulderSim = Math.abs(ls.price - rs.price) / ls.price;
      const headDip = Math.min(ls.price - head.price, rs.price - head.price) / ls.price;
      if (headDip > 0.015 && shoulderSim < 0.04) {
        const neck = Math.min(win[ls.idx].high, win[rs.idx].high);
        if (close > neck * 1.005) return { name: "📈 Inverted H&S — classic reversal, neckline broken", engulfing: bullEngulf };
      }
    }
  }

  // ── Engulfing as primary trigger (requires 1 extra confirmation later) ───────
  if (side === "bearish" && bearEngulf) return { name: "📉 Bearish Engulfing — red candle fully swallowed the previous green candle", engulfing: true };
  if (side === "bullish" && bullEngulf) return { name: "📈 Bullish Engulfing — green candle fully swallowed the previous red candle", engulfing: true };

  // ── Hammer (bullish reversal) — small body at top, long lower wick ───────────
  // Body = |close - open|, lower wick = open/close min - low, upper wick = high - open/close max
  const body      = Math.abs(bars[i].close - bars[i].open);
  const bodyTop   = Math.max(bars[i].close, bars[i].open);
  const bodyBot   = Math.min(bars[i].close, bars[i].open);
  const lowerWick = bodyBot - bars[i].low;
  const upperWick = bars[i].high - bodyTop;
  const bodyPct   = body / bars[i].close;

  if (side === "bullish" && lowerWick >= body * 2 && upperWick < body * 0.5 && bodyPct < 0.025) {
    return { name: "🔨 Hammer — long lower wick shows buyers stepped in and rejected the low", engulfing: bullEngulf };
  }

  // ── Shooting Star (bearish reversal) — small body at bottom, long upper wick ──
  if (side === "bearish" && upperWick >= body * 2 && lowerWick < body * 0.5 && bodyPct < 0.025) {
    return { name: "🌠 Shooting Star — long upper wick shows sellers rejected the high", engulfing: bearEngulf };
  }

  // ── Morning Star (3-candle bullish reversal) ─────────────────────────────────
  if (side === "bullish" && i >= 2) {
    const c1 = bars[i - 2], c2 = bars[i - 1], c3 = bars[i];
    const bigDown  = c1.close < c1.open && (c1.open - c1.close) / c1.open > 0.015;
    const smallMid = Math.abs(c2.close - c2.open) / c2.open < 0.01;
    const bigUp    = c3.close > c3.open && (c3.close - c3.open) / c3.open > 0.015;
    if (bigDown && smallMid && bigUp && c2.low < c1.low)
      return { name: "🌅 Morning Star — three-candle reversal: big down, doji pause, big up", engulfing: false };
  }

  // ── Evening Star (3-candle bearish reversal) ─────────────────────────────────
  if (side === "bearish" && i >= 2) {
    const c1 = bars[i - 2], c2 = bars[i - 1], c3 = bars[i];
    const bigUp    = c1.close > c1.open && (c1.close - c1.open) / c1.open > 0.015;
    const smallMid = Math.abs(c2.close - c2.open) / c2.open < 0.01;
    const bigDown  = c3.close < c3.open && (c3.open - c3.close) / c3.open > 0.015;
    if (bigUp && smallMid && bigDown && c2.high > c1.high)
      return { name: "🌆 Evening Star — three-candle reversal: big up, doji pause, big down", engulfing: false };
  }

  return null;
}

// ── Post-trade analysis ───────────────────────────────────────────────────────
function analyse(
  pnl: number, holdDays: number, exitReason: string, streak: number,
  direction: "long" | "short", entryPrice: number, entryIdx: number,
  ma: number[], bars: Bar[]
): string {
  if (exitReason === "eod") return "Still open at end of data.";
  if (exitReason === "be")  return "✅ Breakeven exit — stop was trailed to entry after price moved 1R in our favour. Protected capital, no loss.";

  // ── Context signals ──────────────────────────────────────────────────────
  const maAtEntry  = ma[entryIdx];
  const maSlope    = maAtEntry - ma[Math.max(0, entryIdx - 5)];          // 5-day MA slope
  const distPct    = Math.abs(entryPrice - maAtEntry) / maAtEntry * 100; // % from MA
  const isMAligned = (direction === "long" && maSlope > 0) || (direction === "short" && maSlope < 0);

  // Recent daily range (avg high-low of last 5 bars) vs SL distance
  const recentBars  = bars.slice(Math.max(0, entryIdx - 5), entryIdx);
  const avgDayRange = recentBars.reduce((s, b) => s + (b.high - b.low) / b.close * 100, 0) / (recentBars.length || 1);
  const SL_PCT      = 0.015;
  const slTooTight  = avgDayRange > SL_PCT * 100 * 1.5; // daily noise > 1.5× SL

  if (pnl > 0) {
    const extra = isMAligned ? " MA trend was in your favour." : "";
    if (holdDays <= 2) return `✅ Fast win in ${holdDays}d — strong immediate follow-through after the pattern.${extra}`;
    return `✅ Clean win in ${holdDays} days — price respected the signal and hit the target.${extra}`;
  }

  // ── Build specific failure reasons ───────────────────────────────────────
  const reasons: string[] = [];

  if (!isMAligned) {
    const slopeDir = maSlope > 0 ? "rising" : "falling";
    reasons.push(`the 200 MA was ${slopeDir} (${slopeDir === "rising" ? "bullish" : "bearish"} slope) which worked AGAINST this ${direction} trade`);
  }
  if (distPct > 8) {
    reasons.push(`price was ${distPct.toFixed(1)}% above/below the 200 MA at entry — highly extended and prone to reversal`);
  } else if (distPct > 5) {
    reasons.push(`price was ${distPct.toFixed(1)}% from the 200 MA — stretched, increasing reversal risk`);
  }
  if (slTooTight) {
    reasons.push(`stop-loss was tight relative to BTC's ${avgDayRange.toFixed(1)}% average daily range — normal noise hit the stop`);
  }
  if (streak >= 2) {
    reasons.push(`this was loss #${streak + 1} in a row — market was choppy with no sustained trend`);
  }
  if (holdDays <= 1) {
    reasons.push(`price reversed the same day — the pattern fired but had zero follow-through momentum`);
  }

  if (reasons.length === 0) {
    return `❌ Stop hit after ${holdDays}d — the setup looked valid but a stronger opposing move took over. Can happen even in good trades.`;
  }

  return `❌ Stop hit after ${holdDays}d. Why it failed: ${reasons.join("; ")}.`;
}

// ── Trade interface ───────────────────────────────────────────────────────────
interface Trade {
  direction: "long" | "short";
  entryTime: number; exitTime: number;
  entryPrice: number; exitPrice: number;
  slPrice: number; tpPrice: number;
  pnl: number; size: number;
  slDist: number;          // original SL distance (used for trailing)
  trailedToBreakeven: boolean;
  exitReason: "tp" | "sl" | "be" | "eod";
  entryReason: string; analysis: string;
  entryIdx: number;
}

// ── ATR (average true range over last N bars) ─────────────────────────────────
function atr(bars: Bar[], idx: number, n = 10): number {
  let sum = 0, count = 0;
  for (let i = Math.max(1, idx - n + 1); i <= idx; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low  - bars[i - 1].close),
    );
    sum += tr; count++;
  }
  return count > 0 ? sum / count : bars[idx].high - bars[idx].low;
}

// ── Engine ────────────────────────────────────────────────────────────────────
function runEngine(bars: Bar[], ma: number[]) {
  const RISK        = 0.01;   // 1% risk per trade
  const ATR_SL_MULT = 1.5;    // SL = 1.5× ATR
  const RR          = 3;      // 3:1 reward-to-risk
  const CAP         = 10_000;
  const MAX_DIST_MA = 0.10;   // skip if price >10% from 200 MA
  const MA_SLOPE_N  = 10;

  const trades: Trade[]   = [];
  const signals: object[] = [];
  let balance    = CAP;
  let open: Trade | null  = null;
  let lossStreak = 0;

  // Start after full 200-bar warmup
  for (let i = 205; i < bars.length; i++) {
    const bar = bars[i];

    // ── manage open trade ──
    if (open) {
      // Trail SL to breakeven once price moves 1R in our favour
      if (!open.trailedToBreakeven) {
        const favMove = open.direction === "long"
          ? bar.high - open.entryPrice
          : open.entryPrice - bar.low;
        if (favMove >= open.slDist) {
          // Lock in breakeven (+tiny buffer so spread doesn't stop us)
          const buf = open.entryPrice * 0.001;
          open.slPrice = open.direction === "long"
            ? open.entryPrice + buf
            : open.entryPrice - buf;
          open.trailedToBreakeven = true;
        }
      }

      let closed = false;
      if (open.direction === "long") {
        if (bar.low  <= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = open.trailedToBreakeven ? "be" : "sl"; closed = true; }
        if (bar.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      } else {
        if (bar.high >= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = open.trailedToBreakeven ? "be" : "sl"; closed = true; }
        if (bar.low  <= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      }
      if (closed) {
        open.exitTime = bar.time;
        const mult  = open.direction === "long" ? 1 : -1;
        open.pnl    = (open.exitPrice - open.entryPrice) * mult * open.size;
        balance    += open.pnl;
        const holdD = Math.round((open.exitTime - open.entryTime) / 86_400_000);
        open.analysis = analyse(open.pnl, holdD, open.exitReason, lossStreak, open.direction, open.entryPrice, open.entryIdx, ma, bars);
        if (open.pnl < 0) lossStreak++; else lossStreak = 0;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : open.exitReason === "be" ? "Exit BE" : "Exit SL", price: open.exitPrice });
        trades.push(open);
        open = null;
      }
      continue;
    }

    // ── check entry ──
    const aboveMA = bar.close > ma[i];
    const side    = aboveMA ? "bullish" : "bearish";
    const dir     = aboveMA ? "long"    : "short";

    const maSlope    = ma[i] - ma[Math.max(0, i - MA_SLOPE_N)];
    const distFromMA = Math.abs(bar.close - ma[i]) / ma[i];
    if (distFromMA > MAX_DIST_MA) continue;

    const patternResult = detectPattern(bars, i, side);
    if (!patternResult) continue;

    // ── Confluence: at least 1 confirmation ──────────────────────────────────
    const barRsi   = rsi(bars, i);
    const volRatio = volumeRatio(bars, i);
    const slopePct = Math.abs(maSlope) / ma[Math.max(0, i - MA_SLOPE_N)] * 100;

    const confirmations: string[] = [];
    if (dir === "long"  && barRsi < 65)  confirmations.push(`RSI ${barRsi.toFixed(0)}`);
    if (dir === "short" && barRsi > 35)  confirmations.push(`RSI ${barRsi.toFixed(0)}`);
    if (volRatio >= 1.1)                 confirmations.push(`vol ${volRatio.toFixed(1)}×`);
    if (slopePct > 0.3)                  confirmations.push(`MA slope ${slopePct.toFixed(1)}%`);
    if (patternResult.engulfing)         confirmations.push("engulf confirm");

    if (confirmations.length < 1) continue;

    const barAtr  = atr(bars, i);
    const slDist  = barAtr * ATR_SL_MULT;
    const slPrice = dir === "long"  ? bar.close - slDist : bar.close + slDist;
    const tpPrice = dir === "long"  ? bar.close + slDist * RR : bar.close - slDist * RR;
    const size    = slDist > 0 ? (balance * RISK) / slDist : 0;
    if (size <= 0) continue;

    const slPct   = (slDist / bar.close * 100).toFixed(1);
    const maLabel = `200 MA @ $${ma[i].toFixed(0)} (${maSlope > 0 ? "↑" : "↓"})`;
    open = {
      direction: dir, entryTime: bar.time, exitTime: 0,
      entryPrice: bar.close, exitPrice: 0, slPrice, tpPrice,
      slDist, trailedToBreakeven: false,
      size, pnl: 0, exitReason: "eod", entryIdx: i,
      entryReason: `${patternResult.name} · ${dir === "long" ? "Above" : "Below"} ${maLabel} · ${confirmations.join(" · ")} · SL ${slPct}% (trail to BE)`,
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
        exit_reason:  t.exitReason as string,
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
