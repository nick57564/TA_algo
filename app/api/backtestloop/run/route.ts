import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const maxDuration = 60;

const HL = "https://api.hyperliquid.xyz/info";

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }

const INTERVAL_MS: Record<string, number> = {
  "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};

const STOOQ_SYMBOLS: Record<string, string> = {
  GOLD: "gc.f", XAUUSD: "gc.f", SPX: "^spx", SP500: "^spx", "S&P500": "^spx",
};
const YAHOO_SYMBOLS: Record<string, string> = {
  GOLD: "GC=F", XAUUSD: "GC=F", SPX: "^GSPC", SP500: "^GSPC", "S&P500": "^GSPC",
};

async function fetchStooq(sym: string, count: number): Promise<Bar[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`stooq ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n").slice(1);
  const bars: Bar[] = [];
  for (const line of lines) {
    const [date, open, high, low, close, volume] = line.split(",");
    if (!date || !close || isNaN(+close)) continue;
    bars.push({ time: new Date(date).getTime(), open: +open, high: +high, low: +low, close: +close, volume: volume ? +volume : 0 });
  }
  bars.sort((a, b) => a.time - b.time);
  return bars.slice(-count - 200);
}

async function fetchYahoo(sym: string, count: number): Promise<Bar[]> {
  const end   = Math.floor(Date.now() / 1000);
  const start = end - (count + 250) * 86400;
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${start}&period2=${end}`;
  const res   = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error("yahoo: no result");
  const timestamps: number[] = result.timestamp;
  const q = result.indicators.quote[0];
  return timestamps.map((t, i) => ({
    time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0,
  })).filter(b => b.close != null && !isNaN(b.close)).sort((a, b) => a.time - b.time);
}

async function fetchBars(symbol: string, interval: string, count: number): Promise<Bar[]> {
  // Use Yahoo Finance directly for traditional assets (stooq uses JS challenge that blocks server-side fetches)
  const yahooSym = YAHOO_SYMBOLS[symbol.toUpperCase()];
  if (yahooSym) return await fetchYahoo(yahooSym, count);
  const ms    = INTERVAL_MS[interval] ?? INTERVAL_MS["1d"];
  const end   = Date.now();
  const start = end - count * ms;
  const resp  = await fetch(HL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval, startTime: start, endTime: end } }),
  });
  const raw: RawCandle[] = await resp.json();
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v })).sort((a, b) => a.time - b.time);
}

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

function volumeRatio(bars: Bar[], idx: number, n = 10): number {
  if (idx < n) return 1;
  const avg = bars.slice(idx - n, idx).reduce((s, b) => s + b.volume, 0) / n;
  return avg > 0 ? bars[idx].volume / avg : 1;
}

function sma200(bars: Bar[]): number[] {
  const out: number[] = []; let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= 200) sum -= bars[i - 200].close;
    out.push(sum / Math.min(i + 1, 200));
  }
  return out;
}

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

function detectPattern(bars: Bar[], i: number, side: "bullish" | "bearish"): { name: string; engulfing: boolean; stop?: number; target?: number; isInvertedHaS?: boolean } | null {
  if (i < 20) return null;
  const win    = bars.slice(Math.max(0, i - 160), i + 1);
  const offset = Math.min(i, 160);
  const pHigh = pivots(win, "high", 2).filter(p => p.idx < offset);
  const pLow  = pivots(win, "low",  2).filter(p => p.idx < offset);
  const close = bars[i].close;
  const prev = bars[i - 1];
  const bearEngulf = prev.close > prev.open && bars[i].open > prev.close && close < prev.open;
  const bullEngulf = prev.close < prev.open && bars[i].open < prev.close && close > prev.open;

  if (side === "bearish") {
    if (pHigh.length >= 2) {
      const [a, b] = pHigh.slice(-2);
      if (Math.abs(a.price - b.price) / a.price < 0.02 && Math.abs(a.idx - b.idx) >= 5) {
        const neck = Math.min(...win.slice(a.idx, b.idx + 1).map(w => w.low));
        if (close < neck * 0.99) return { name: "📉 Double Top — two equal peaks, neckline broken", engulfing: bearEngulf };
      }
    }
    if (pHigh.length >= 3) {
      const [a, b, c] = pHigh.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.025 && Math.abs(c.price - avg) / avg < 0.025) {
        const neck = Math.min(...win.slice(a.idx, c.idx + 1).map(w => w.low));
        if (close < neck * 0.99) return { name: "📉 Triple Top — three failed attempts at resistance, breakdown confirmed", engulfing: bearEngulf };
      }
    }
    {
      // H&S: 3 peaks, middle highest, WITH clear troughs between them (the neckline)
      // The head must sit well above the neckline — if not, it's just a flat range, not H&S
      let found = false;
      for (let pi = pHigh.length - 1; pi >= 1 && !found; pi--) {
        const head = pHigh[pi];
        // Left shoulder: any prior peak lower than head, at least 5 bars away
        const lsCandidates = pHigh.filter(p => p.idx < head.idx - 5 && p.price < head.price);
        if (lsCandidates.length === 0) continue;
        const ls = lsCandidates[lsCandidates.length - 1];
        // Right shoulder: any later peak lower than head, at least 5 bars after head
        const rsCand = pHigh.filter(p => p.idx > head.idx + 5 && p.price < head.price);
        if (rsCand.length === 0) continue;
        const rs = rsCand[0];
        // Must span at least 30 bars — a real pattern takes weeks to form
        if (rs.idx - ls.idx < 30) continue;
        // Neckline = top of the two troughs between the peaks
        const neckL = Math.min(...win.slice(ls.idx, head.idx + 1).map(b => b.low));
        const neckR = Math.min(...win.slice(head.idx, rs.idx + 1).map(b => b.low));
        const neck  = Math.max(neckL, neckR);
        // The head must be meaningfully above the neckline — proves there were real pullbacks
        // (if head ≈ neckline the "pattern" is just a flat range with tiny wiggles, not H&S)
        if (head.price - neck < neck * 0.04) continue; // head at least 4% above neckline
        if (close < neck * 0.995) {
          found = true;
          return { name: "📉 Head & Shoulders — left shoulder, head, right shoulder formed; neckline broken", engulfing: bearEngulf, stop: rs.price, target: neck - (head.price - neck) };
        }
      }
    }
  }

  if (side === "bullish") {
    if (pLow.length >= 2) {
      const [a, b] = pLow.slice(-2);
      if (Math.abs(a.price - b.price) / a.price < 0.02 && Math.abs(a.idx - b.idx) >= 5) {
        const neck = Math.max(...win.slice(a.idx, b.idx + 1).map(w => w.high));
        if (close > neck * 1.01) return { name: "📈 Double Bottom — two equal lows, neckline broken", engulfing: bullEngulf };
      }
    }
    if (pLow.length >= 3) {
      const [a, b, c] = pLow.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.025 && Math.abs(c.price - avg) / avg < 0.025) {
        const neck = Math.max(...win.slice(a.idx, c.idx + 1).map(w => w.high));
        if (close > neck * 1.01) return { name: "📈 Triple Bottom — three bounces from support, breakout confirmed", engulfing: bullEngulf };
      }
    }
    if (pLow.length >= 3) {
      const [ls, head, rs] = pLow.slice(-3);
      const shoulderSim = Math.abs(ls.price - rs.price) / ls.price;
      const headDip = Math.min(ls.price - head.price, rs.price - head.price) / ls.price;
      if (headDip > 0.015 && shoulderSim < 0.04) {
        const neck = Math.min(win[ls.idx].high, win[rs.idx].high);
        if (close > neck * 1.005) return { name: "📈 Inverted H&S — classic reversal, neckline broken", engulfing: bullEngulf, isInvertedHaS: true };
      }
    }
  }

  if (side === "bearish" && bearEngulf) return { name: "📉 Bearish Engulfing — red candle fully swallowed the previous green candle", engulfing: true };
  if (side === "bullish" && bullEngulf) return { name: "📈 Bullish Engulfing — green candle fully swallowed the previous red candle", engulfing: true };

  const body      = Math.abs(bars[i].close - bars[i].open);
  const bodyTop   = Math.max(bars[i].close, bars[i].open);
  const bodyBot   = Math.min(bars[i].close, bars[i].open);
  const lowerWick = bodyBot - bars[i].low;
  const upperWick = bars[i].high - bodyTop;
  const bodyPct   = body / bars[i].close;

  if (side === "bullish" && lowerWick >= body * 2 && upperWick < body * 0.5 && bodyPct < 0.025)
    return { name: "🔨 Hammer — long lower wick shows buyers stepped in and rejected the low", engulfing: bullEngulf };
  if (side === "bearish" && upperWick >= body * 2 && lowerWick < body * 0.5 && bodyPct < 0.025)
    return { name: "🌠 Shooting Star — long upper wick shows sellers rejected the high", engulfing: bearEngulf };

  if (side === "bullish" && i >= 2) {
    const c1 = bars[i - 2], c2 = bars[i - 1], c3 = bars[i];
    if (c1.close < c1.open && (c1.open - c1.close) / c1.open > 0.015 && Math.abs(c2.close - c2.open) / c2.open < 0.01 && c3.close > c3.open && (c3.close - c3.open) / c3.open > 0.015 && c2.low < c1.low)
      return { name: "🌅 Morning Star — three-candle reversal: big down, doji pause, big up", engulfing: false };
  }
  if (side === "bearish" && i >= 2) {
    const c1 = bars[i - 2], c2 = bars[i - 1], c3 = bars[i];
    if (c1.close > c1.open && (c1.close - c1.open) / c1.open > 0.015 && Math.abs(c2.close - c2.open) / c2.open < 0.01 && c3.close < c3.open && (c3.open - c3.close) / c3.open > 0.015 && c2.high > c1.high)
      return { name: "🌆 Evening Star — three-candle reversal: big up, doji pause, big down", engulfing: false };
  }

  return null;
}

function analyse(pnl: number, holdDays: number, exitReason: string, streak: number, direction: "long" | "short", entryPrice: number, entryIdx: number, ma: number[], bars: Bar[], targetReached = false): string {
  if (exitReason === "eod") return "Still open at end of data.";
  if (exitReason === "be") return targetReached ? "✅ Trailing stop exit — price ran past target." : "✅ Trailing stop exit — locked profit after 1R move.";
  const maAtEntry = ma[entryIdx];
  const maSlope5  = maAtEntry - ma[Math.max(0, entryIdx - 5)];
  const distPct   = Math.abs(entryPrice - maAtEntry) / maAtEntry * 100;
  const isMAligned = (direction === "long" && maSlope5 > 0) || (direction === "short" && maSlope5 < 0);
  const recentBars = bars.slice(Math.max(0, entryIdx - 5), entryIdx);
  const avgDayRange = recentBars.reduce((s, b) => s + (b.high - b.low) / b.close * 100, 0) / (recentBars.length || 1);
  if (pnl > 0) return `✅ ${holdDays <= 2 ? "Fast" : "Clean"} win in ${holdDays}d${isMAligned ? " — MA trend aligned." : "."}`;
  const reasons: string[] = [];
  if (!isMAligned) reasons.push(`MA working against ${direction} trade`);
  if (distPct > 8) reasons.push(`${distPct.toFixed(1)}% from 200 MA — very extended`);
  if (avgDayRange > 0.02 * 100 * 1.5) reasons.push(`tight stop vs ${avgDayRange.toFixed(1)}% avg daily range`);
  if (streak >= 2) reasons.push(`loss #${streak + 1} in a row`);
  if (holdDays <= 1) reasons.push(`reversed same day`);
  return reasons.length === 0 ? `❌ Stop hit after ${holdDays}d — stronger opposing move.` : `❌ Stop hit after ${holdDays}d. Why: ${reasons.join("; ")}.`;
}

interface Trade {
  direction: "long" | "short";
  entryTime: number; exitTime: number;
  entryPrice: number; exitPrice: number;
  slPrice: number; tpPrice: number;
  pnl: number; size: number;
  slDist: number;
  trailedToBreakeven: boolean;
  extremePrice: number;
  isStructure: boolean;
  targetReached: boolean;
  exitReason: "tp" | "sl" | "be" | "eod";
  entryReason: string; analysis: string;
  entryIdx: number;
}

function atr(bars: Bar[], idx: number, n = 10): number {
  let sum = 0, count = 0;
  for (let i = Math.max(1, idx - n + 1); i <= idx; i++) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    sum += tr; count++;
  }
  return count > 0 ? sum / count : bars[idx].high - bars[idx].low;
}

// Pending H&S retest: wait for price to pull back to neckline, then enter on engulfing
interface PendingHaS {
  dir: "long" | "short";
  neck: number;       // neckline price to retest
  stop: number;       // SL beyond right shoulder
  target: number;     // measured-move TP
  expiresBar: number; // cancel if no retest by this bar
}

function runEngine(bars: Bar[], ma: number[]) {
  const RISK        = 0.01;
  const ATR_SL_MULT = 2.0;
  const RR          = 1.5;
  const CAP         = 10_000;
  const MAX_DIST_MA = 0.08;
  const MAX_DIST_MA_STRUCTURE = 0.15;

  const trades: Trade[]   = [];
  const signals: object[] = [];
  let balance    = CAP;
  let open: Trade | null  = null;
  let lossStreak = 0;
  let slCooldown = 0;
  let pendingHaS: PendingHaS | null = null; // waiting for neckline retest

  for (let i = 205; i < bars.length; i++) {
    const bar = bars[i];
    if (slCooldown > 0) slCooldown--;

    if (open) {
      open.extremePrice = open.direction === "long" ? Math.max(open.extremePrice, bar.high) : Math.min(open.extremePrice, bar.low);
      const favMove = open.direction === "long" ? open.extremePrice - open.entryPrice : open.entryPrice - open.extremePrice;
      if (open.isStructure && !open.targetReached) {
        if ((open.direction === "long" ? bar.high >= open.tpPrice : bar.low <= open.tpPrice)) open.targetReached = true;
      }
      const trailDist = open.targetReached ? atr(bars, i, 10) * 3 : open.slDist;
      if (favMove >= open.slDist || open.targetReached) {
        const trailStop = open.direction === "long" ? open.extremePrice - trailDist : open.extremePrice + trailDist;
        open.slPrice = open.direction === "long" ? Math.max(open.slPrice, trailStop) : Math.min(open.slPrice, trailStop);
        open.trailedToBreakeven = true;
      }
      let closed = false;
      if (open.direction === "long") {
        if (bar.low  <= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = open.trailedToBreakeven ? "be" : "sl"; closed = true; }
        if (!open.isStructure && bar.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      } else {
        if (bar.high >= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = open.trailedToBreakeven ? "be" : "sl"; closed = true; }
        if (!open.isStructure && bar.low <= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      }
      if (closed) {
        open.exitTime = bar.time;
        const mult = open.direction === "long" ? 1 : -1;
        open.pnl   = (open.exitPrice - open.entryPrice) * mult * open.size;
        balance   += open.pnl;
        const holdD = Math.round((open.exitTime - open.entryTime) / 86_400_000);
        open.analysis = analyse(open.pnl, holdD, open.exitReason, lossStreak, open.direction, open.entryPrice, open.entryIdx, ma, bars, open.targetReached);
        if (open.pnl < 0) { lossStreak++; if (open.exitReason === "sl") slCooldown = 10; } else lossStreak = 0;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : open.exitReason === "be" ? "Exit BE" : "Exit SL", price: open.exitPrice });
        trades.push(open);
        open = null;
      }
      continue;
    }

    if (slCooldown > 0) continue;

    // ── Pending H&S retest check ──────────────────────────────────────────────
    // After neckline break, wait for price to pull back to the neckline and
    // form a confirmation engulfing candle before entering.
    if (pendingHaS && !open) {
      if (i > pendingHaS.expiresBar) {
        pendingHaS = null; // retest never came — cancel
      } else {
        const prev = bars[i - 1];
        const bearEngulf = prev.close > prev.open && bar.open > prev.close && bar.close < prev.open;
        const bullEngulf = prev.close < prev.open && bar.open < prev.close && bar.close > prev.open;

        if (pendingHaS.dir === "short") {
          // Price must retest neckline from below — touch within 1.5% but close must stay BELOW neckline
          const retested = bar.high >= pendingHaS.neck * 0.985 && bar.close < pendingHaS.neck;
          if (retested && bearEngulf && i + 1 < bars.length) {
            const entryBar   = bars[i + 1];
            const entryPrice = entryBar.open;
            const slDist     = Math.abs(pendingHaS.stop - entryPrice);
            if (slDist > 0 && pendingHaS.stop > entryPrice && pendingHaS.target < entryPrice) {
              const size = (balance * RISK) / slDist;
              open = {
                direction: "short", entryTime: entryBar.time, exitTime: 0,
                entryPrice, exitPrice: 0,
                slPrice: pendingHaS.stop, tpPrice: pendingHaS.target,
                slDist, trailedToBreakeven: false, extremePrice: entryPrice,
                isStructure: true, targetReached: false, size, pnl: 0, exitReason: "eod",
                entryIdx: i + 1,
                entryReason: `📉 H&S retest short · Neckline @ $${pendingHaS.neck.toFixed(0)} · Bearish engulf on retest · SL ${(slDist / entryPrice * 100).toFixed(1)}%`,
                analysis: "",
              };
              signals.push({ timestamp: new Date(entryBar.time).toISOString(), direction: "short", type: "Entry", price: entryPrice });
              pendingHaS = null;
            }
          }
        } else {
          // Inverted H&S: price must retest neckline from above (pull back to within 2%)
          const retested = bar.low <= pendingHaS.neck * 1.02;
          if (retested && bullEngulf && i + 1 < bars.length) {
            const entryBar   = bars[i + 1];
            const entryPrice = entryBar.open;
            const slDist     = Math.abs(entryPrice - pendingHaS.stop);
            if (slDist > 0 && pendingHaS.stop < entryPrice && pendingHaS.target > entryPrice) {
              const size = (balance * RISK) / slDist;
              open = {
                direction: "long", entryTime: entryBar.time, exitTime: 0,
                entryPrice, exitPrice: 0,
                slPrice: pendingHaS.stop, tpPrice: pendingHaS.target,
                slDist, trailedToBreakeven: false, extremePrice: entryPrice,
                isStructure: true, targetReached: false, size, pnl: 0, exitReason: "eod",
                entryIdx: i + 1,
                entryReason: `📈 Inv H&S retest long · Neckline @ $${pendingHaS.neck.toFixed(0)} · Bullish engulf on retest · SL ${(slDist / entryPrice * 100).toFixed(1)}%`,
                analysis: "",
              };
              signals.push({ timestamp: new Date(entryBar.time).toISOString(), direction: "long", type: "Entry", price: entryPrice });
              pendingHaS = null;
            }
          }
        }
      }
      if (open) continue; // just entered via retest
    }

    const aboveMA = bar.close > ma[i];
    const side    = aboveMA ? "bullish" : "bearish";
    const dir: "long" | "short" = aboveMA ? "long" : "short";

    const patternResult = detectPattern(bars, i, side);
    if (!patternResult) continue;

    const isStructurePattern = patternResult.name.includes("Head") || patternResult.name.includes("Double") || patternResult.name.includes("Triple");
    const isCandlePattern    = !isStructurePattern;
    const isInvertedHaS      = !!patternResult.isInvertedHaS;
    const isPureEngulfing     = patternResult.engulfing && isCandlePattern && !patternResult.name.includes("Morning") && !patternResult.name.includes("Evening") && !patternResult.name.includes("Hammer") && !patternResult.name.includes("Shooting");

    const distFromMA = Math.abs(bar.close - ma[i]) / ma[i];
    if (distFromMA > (isStructurePattern ? MAX_DIST_MA_STRUCTURE : MAX_DIST_MA)) continue;

    const barRsi   = rsi(bars, i);
    const volRatio = volumeRatio(bars, i);
    const slope5   = ma[i] - ma[Math.max(0, i - 5)];
    const slope15  = ma[i] - ma[Math.max(0, i - 15)];
    const slope5Pct = Math.abs(slope5) / ma[Math.max(0, i - 5)] * 100;

    // trendAcc: both slopes must align (Inverted H&S exempt)
    if (!isCandlePattern && !isInvertedHaS) {
      const s5ok  = dir === "long" ? slope5 > 0 : slope5 < 0;
      const s15ok = dir === "long" ? slope15 > 0 : slope15 < 0;
      if (!s5ok || !s15ok) continue;
    }

    // Structure vol gate
    if (isStructurePattern && !isInvertedHaS && volRatio < 1.15) continue;

    // Long structure: vol >= 1.45× OR RSI < 40
    if (isStructurePattern && !isInvertedHaS && dir === "long" && volRatio < 1.45 && barRsi >= 40) continue;

    // Pure engulfing gate: RSI < 35 OR vol >= 1.5×
    if (isPureEngulfing) {
      const engulfRsiOk = dir === "long" ? barRsi < 35 : barRsi > 65;
      if (!engulfRsiOk && volRatio < 1.5) continue;
    }

    const slopeAligned = (dir === "long" && slope5 > 0) || (dir === "short" && slope5 < 0);
    const confirmations: string[] = [];
    if (dir === "long"  && barRsi < 40)  confirmations.push(`RSI ${barRsi.toFixed(0)}`);
    if (dir === "short" && barRsi > 60)  confirmations.push(`RSI ${barRsi.toFixed(0)}`);
    if (volRatio >= 1.3)                 confirmations.push(`vol ${volRatio.toFixed(1)}×`);
    if (isCandlePattern && slopeAligned && slope5Pct > 0.5) confirmations.push(`slope ${slope5Pct.toFixed(1)}%`);
    if (patternResult.engulfing)         confirmations.push("engulf");

    // Short structure requires minConf=2; long structure minConf=1
    const minConf = (isCandlePattern || (isStructurePattern && !isInvertedHaS && dir === "short")) ? 2 : 1;
    if (confirmations.length < minConf) continue;

    if (i + 1 >= bars.length) continue;
    const entryBar   = bars[i + 1];
    const entryPrice = entryBar.open;
    const entryTime  = entryBar.time;

    const barAtr = atr(bars, i);
    let slPrice: number, tpPrice: number, slDist: number;
    const isHaS = patternResult.name.includes("Head & Shoulders") || patternResult.name.includes("Inv H&S") || patternResult.name.includes("Inverted H&S");

    if (patternResult.stop != null && patternResult.target != null) {
      const rawSl = dir === "short" ? patternResult.stop * 1.005 : patternResult.stop * 0.995;
      const rawTp = patternResult.target;

      // H&S: don't enter on neckline break — set pending retest instead
      if (isHaS && !pendingHaS) {
        const neck = bars[i].close; // approximate neckline as current close (already broke it)
        const validShort = dir === "short" && rawSl > bars[i].close && rawTp < bars[i].close;
        const validLong  = dir === "long"  && rawSl < bars[i].close && rawTp > bars[i].close;
        if (validShort || validLong) {
          pendingHaS = { dir, neck: rawSl > bars[i].close ? bars[i].close * 1.01 : bars[i].close * 0.99, stop: rawSl, target: rawTp, expiresBar: i + 15 };
          signals.push({ timestamp: new Date(bars[i].time).toISOString(), direction: dir, type: "Pending H&S retest", price: bars[i].close });
        }
        continue; // do not enter now
      }

      slPrice = rawSl;
      tpPrice = rawTp;
      const validShort = dir === "short" && slPrice > entryPrice && tpPrice < entryPrice;
      const validLong  = dir === "long"  && slPrice < entryPrice && tpPrice > entryPrice;
      if (!validShort && !validLong) continue;
      slDist = Math.abs(slPrice - entryPrice);
    } else {
      slDist  = barAtr * ATR_SL_MULT;
      slPrice = dir === "long"  ? entryPrice - slDist : entryPrice + slDist;
      tpPrice = dir === "long"  ? entryPrice + slDist * RR : entryPrice - slDist * RR;
    }
    const size = slDist > 0 ? (balance * RISK) / slDist : 0;
    if (size <= 0) continue;

    open = {
      direction: dir, entryTime, exitTime: 0,
      entryPrice, exitPrice: 0, slPrice, tpPrice,
      slDist, trailedToBreakeven: false, extremePrice: entryPrice,
      isStructure: patternResult.stop != null && patternResult.target != null,
      targetReached: false, size, pnl: 0, exitReason: "eod", entryIdx: i + 1,
      entryReason: `${patternResult.name} · ${dir === "long" ? "Above" : "Below"} 200MA · ${confirmations.join(" · ")} · SL ${(slDist / entryPrice * 100).toFixed(1)}%`,
      analysis: "",
    };
    signals.push({ timestamp: new Date(entryTime).toISOString(), direction: dir, type: "Entry", price: entryPrice });
  }

  if (open) {
    const last = bars[bars.length - 1];
    open.exitTime = last.time; open.exitPrice = last.close; open.exitReason = "eod";
    open.pnl = (open.exitPrice - open.entryPrice) * (open.direction === "long" ? 1 : -1) * open.size;
    open.analysis = "Still open at end of data.";
    balance += open.pnl;
    trades.push(open);
  }

  return { trades, signals };
}

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

export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 730, interval = "1d" } = await req.json();
    const bars  = await fetchBars(symbol, interval, limit + 200);
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
