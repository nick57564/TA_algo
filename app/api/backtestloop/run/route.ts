import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }

interface Swing { type: "high" | "low"; price: number; idx: number; }

interface StructureState {
  trend: "bullish" | "bearish" | "neutral";
  activeHL: number;  // most recent swing low  → SL for longs
  activeLH: number;  // most recent swing high → SL for shorts
}

interface Trade {
  direction: "long" | "short";
  entryTime: number; exitTime: number;
  entryPrice: number; exitPrice: number;
  slPrice: number; tpPrice: number;
  pnl: number; size: number; slDist: number;
  trailedToBreakeven: boolean; extremePrice: number;
  exitReason: "tp" | "sl" | "be" | "eod";
  entryReason: string; analysis: string;
  entryIdx: number;
}

// ─── Bar Fetching ─────────────────────────────────────────────────────────────

const HL = "https://api.hyperliquid.xyz/info";
const INTERVAL_MS: Record<string, number> = { "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
const YAHOO_SYMBOLS: Record<string, string> = {
  GOLD: "GC=F", XAUUSD: "GC=F", SPX: "^GSPC", SP500: "^GSPC", "S&P500": "^GSPC",
};

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
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
            .sort((a, b) => a.time - b.time);
}

// ─── Indicators ───────────────────────────────────────────────────────────────

function ema(bars: Bar[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    out.push(i === 0 ? bars[0].close : bars[i].close * k + out[i - 1] * (1 - k));
  }
  return out;
}

function atr(bars: Bar[], idx: number, n = 14): number {
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

// ─── Weekly bars (group daily → 1 bar per ISO week) ──────────────────────────

function toWeeklyBars(daily: Bar[]): Bar[] {
  const weekly: Bar[] = [];
  let i = 0;
  while (i < daily.length) {
    const chunk: Bar[] = [];
    // Consume bars until the day-of-week wraps back to Monday (UTCDay=1)
    // or we run out of bars.
    const startDow = new Date(daily[i].time).getUTCDay();
    chunk.push(daily[i++]);
    while (i < daily.length) {
      const dow = new Date(daily[i].time).getUTCDay();
      if (dow === 1 && chunk.length >= 2) break; // new week starts on Monday
      chunk.push(daily[i++]);
    }
    weekly.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)),
      low:  Math.min(...chunk.map(b => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + b.volume, 0),
    });
    void startDow;
  }
  return weekly;
}

// ─── Swing Detection ─────────────────────────────────────────────────────────
// Swing High: ≥1 green candles then a red candle → peak before the red = SH
// Swing Low : ≥1 red   candles then a green candle → trough before green = SL
// Swings are confirmed on the bar AFTER the swing bar (1-bar lag — no look-ahead).

function detectSwings(bars: Bar[]): Swing[] {
  const isGreen = (b: Bar) => b.close >= b.open;
  const isRed   = (b: Bar) => b.close  < b.open;
  const raw: Swing[] = [];

  for (let i = 1; i < bars.length; i++) {
    // Swing High
    if (isRed(bars[i]) && isGreen(bars[i - 1])) {
      let peak = bars[i - 1].high;
      let j = i - 2;
      while (j >= 0 && isGreen(bars[j])) { if (bars[j].high > peak) peak = bars[j].high; j--; }
      raw.push({ type: "high", price: peak, idx: i - 1 });
    }
    // Swing Low
    if (isGreen(bars[i]) && isRed(bars[i - 1])) {
      let trough = bars[i - 1].low;
      let j = i - 2;
      while (j >= 0 && isRed(bars[j])) { if (bars[j].low < trough) trough = bars[j].low; j--; }
      raw.push({ type: "low", price: trough, idx: i - 1 });
    }
  }

  // Merge consecutive same-type swings: keep most extreme
  const out: Swing[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && last.type === s.type) {
      if (s.type === "high" && s.price > last.price) out[out.length - 1] = s;
      else if (s.type === "low" && s.price < last.price) out[out.length - 1] = s;
    } else {
      out.push(s);
    }
  }
  return out;
}

// ─── Market Structure State Machine ──────────────────────────────────────────
// Bullish  = making Higher Highs + Higher Lows (HH + HL)
// Bearish  = making Lower  Highs + Lower  Lows (LH + LL)
// Override: close above last swing high = bullish break; below last swing low = bearish break

function computeStructure(swings: Swing[], currentClose: number): StructureState {
  const highs = swings.filter(s => s.type === "high");
  const lows  = swings.filter(s => s.type === "low");

  if (highs.length < 2 || lows.length < 2) {
    return { trend: "neutral", activeHL: 0, activeLH: Infinity };
  }

  const h1 = highs[highs.length - 2], h2 = highs[highs.length - 1];
  const l1 = lows[lows.length - 2],   l2 = lows[lows.length - 1];

  let trend: "bullish" | "bearish" | "neutral" = "neutral";
  if (h2.price > h1.price && l2.price > l1.price) trend = "bullish"; // HH + HL
  else if (h2.price < h1.price && l2.price < l1.price) trend = "bearish"; // LH + LL
  // State-machine override: close breaks last key level
  else if (currentClose > h2.price) trend = "bullish";
  else if (currentClose < l2.price) trend = "bearish";

  return {
    trend,
    activeHL: l2.price,  // most recent swing low (long SL below this)
    activeLH: h2.price,  // most recent swing high (short SL above this)
  };
}

// ─── Score a Timeframe (0–60 pts) ────────────────────────────────────────────
// 1. Trend aligned           10
// 2. AOI + rejection         10
// 3. Touch of 50 EMA          5
// 4. Psychological round #    5
// 5. Rejection from structure 10
// 6. Engulfing at structure   10
// 7. H&S break               10

function scoreTimeframe(
  bars: Bar[],
  idx: number,
  direction: "long" | "short",
  ema50arr: number[],
  swings: Swing[],
  structure: StructureState,
): number {
  if (idx < 5) return 0;
  let score = 0;

  const b     = bars[idx];
  const close = b.close;
  const open  = b.open;
  const ema50 = ema50arr[Math.min(idx, ema50arr.length - 1)];
  const recentSw = swings.filter(s => s.idx < idx && s.idx >= idx - 80);
  const prevH    = recentSw.filter(s => s.type === "high");
  const prevL    = recentSw.filter(s => s.type === "low");

  // 1. Trend aligned
  if ((direction === "long"  && structure.trend === "bullish") ||
      (direction === "short" && structure.trend === "bearish")) score += 10;

  // 2. AOI + rejection candle (body pointing trade direction, near key level)
  const nearAOI = recentSw.some(s => Math.abs(s.price - close) / close < 0.025);
  const bodyDir = direction === "long" ? close > open : close < open;
  if (nearAOI && bodyDir) score += 10;

  // 3. Touch of 50 EMA
  if (Math.abs(close - ema50) / ema50 < 0.015) score += 5;

  // 4. Psychological round number
  const step = close > 50_000 ? 5_000 : close > 10_000 ? 1_000 : close > 1_000 ? 100 : 50;
  const round = Math.round(close / step) * step;
  if (Math.abs(close - round) / close < 0.005) score += 5;

  // 5. Rejection from previous structure level
  const strRejL = prevL.some(s => Math.abs(s.price - close) / close < 0.025);
  const strRejH = prevH.some(s => Math.abs(s.price - close) / close < 0.025);
  const strRej  = direction === "long" ? strRejL : strRejH;
  if (strRej) score += 10;

  // 6. Engulfing candle at structure
  if (idx > 0) {
    const prev = bars[idx - 1];
    const bullEng = prev.close < prev.open && b.open < prev.close && close > prev.open;
    const bearEng = prev.close > prev.open && b.open > prev.close && close < prev.open;
    if (strRej && (direction === "long" ? bullEng : bearEng)) score += 10;
  }

  // 7. H&S break (bearish) or Inverted H&S break (bullish)
  if (direction === "short" && prevH.length >= 3) {
    const [ls, head, rs] = prevH.slice(-3);
    if (head.price > ls.price && head.price > rs.price && rs.idx > ls.idx) {
      const neck = Math.max(
        Math.min(...bars.slice(ls.idx, head.idx + 1).map(x => x.low)),
        Math.min(...bars.slice(head.idx, rs.idx + 1).map(x => x.low)),
      );
      if (close < neck * 1.005 && head.price - neck >= neck * 0.03) score += 10;
    }
  }
  if (direction === "long" && prevL.length >= 3) {
    const [ls, head, rs] = prevL.slice(-3);
    if (head.price < ls.price && head.price < rs.price && rs.idx > ls.idx) {
      const neck = Math.min(
        Math.max(...bars.slice(ls.idx, head.idx + 1).map(x => x.high)),
        Math.max(...bars.slice(head.idx, rs.idx + 1).map(x => x.high)),
      );
      if (close > neck * 0.995 && neck - head.price >= head.price * 0.03) score += 10;
    }
  }

  return Math.min(score, 60);
}

// ─── Entry Signal: Bullish/Bearish Engulfing OR Shift of Structure ────────────

function detectEntrySignal(bars: Bar[], idx: number, direction: "long" | "short", swings: Swing[]): boolean {
  if (idx < 3) return false;
  const prev = bars[idx - 1], curr = bars[idx];

  // Engulfing
  const bullEng = prev.close < prev.open && curr.open < prev.close && curr.close > prev.open;
  const bearEng = prev.close > prev.open && curr.open > prev.close && curr.close < prev.open;
  if (direction === "long"  && bullEng) return true;
  if (direction === "short" && bearEng) return true;

  // Shift of Structure: close breaks the most recent local swing in trade direction
  // (after a pullback, first close above the last pullback swing high = SoS long)
  const recent = swings.filter(s => s.idx >= idx - 10 && s.idx < idx);
  if (direction === "long") {
    const lastSH = recent.filter(s => s.type === "high").at(-1);
    if (lastSH && curr.close > lastSH.price) return true;
  } else {
    const lastSL = recent.filter(s => s.type === "low").at(-1);
    if (lastSL && curr.close < lastSL.price) return true;
  }

  return false;
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

function runEngine(bars: Bar[]) {
  const RISK = 0.01;   // 1% risk per trade
  const RR   = 3.0;    // 1:3 risk-reward
  const CAP  = 10_000;

  // Pre-compute daily indicators
  const dailyEma50 = ema(bars, 50);
  const dailySwings = detectSwings(bars);

  // Pre-compute weekly bars + indicators
  const weeklyBars   = toWeeklyBars(bars);
  const weeklyEma50  = ema(weeklyBars, 50);
  const weeklySwings = detectSwings(weeklyBars);

  // Map each daily bar index → weekly bar index (which week does this day belong to)
  const dailyToWeeklyIdx: number[] = bars.map(b => {
    let wi = weeklyBars.findIndex((w, i) => {
      const nextW = weeklyBars[i + 1];
      return b.time >= w.time && (!nextW || b.time < nextW.time);
    });
    return Math.max(0, wi);
  });

  const trades: Trade[]   = [];
  const signals: object[] = [];
  let balance    = CAP;
  let open: Trade | null  = null;
  let slCooldown = 0;

  for (let i = 60; i < bars.length - 1; i++) {
    const bar = bars[i];
    if (slCooldown > 0) slCooldown--;

    // ── Exit management ─────────────────────────────────────────────────────
    if (open) {
      open.extremePrice = open.direction === "long"
        ? Math.max(open.extremePrice, bar.high)
        : Math.min(open.extremePrice, bar.low);
      const favMove = open.direction === "long"
        ? open.extremePrice - open.entryPrice
        : open.entryPrice - open.extremePrice;

      // Active trailing: once 1R in profit, trail at extremePrice ± 1.5×ATR14
      if (favMove >= open.slDist) {
        const barAtr = atr(bars, i, 14);
        const trail  = open.direction === "long"
          ? open.extremePrice - barAtr * 1.5
          : open.extremePrice + barAtr * 1.5;
        open.slPrice = open.direction === "long"
          ? Math.max(open.slPrice, trail)
          : Math.min(open.slPrice, trail);
        open.trailedToBreakeven = true;
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
        open.pnl = (open.exitPrice - open.entryPrice) * (open.direction === "long" ? 1 : -1) * open.size;
        balance += open.pnl;
        const holdD = Math.round((open.exitTime - open.entryTime) / 86_400_000);
        open.analysis = open.pnl > 0
          ? `✅ ${holdD}d hold — ${open.exitReason === "tp" ? "TP hit (1:3)" : "trailing stop exit"}.`
          : `❌ SL hit after ${holdD}d.`;
        if (open.pnl < 0 && open.exitReason === "sl") slCooldown = 5;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : open.exitReason === "be" ? "Exit BE" : "Exit SL", price: open.exitPrice });
        trades.push(open);
        open = null;
      }
      continue;
    }

    if (slCooldown > 0) continue;

    // ── Step 3: Daily EMA 50 determines allowed direction ───────────────────
    const closeAboveEma50 = bar.close > dailyEma50[i];
    const dir: "long" | "short" = closeAboveEma50 ? "long" : "short";

    // ── Compute Daily structure ──────────────────────────────────────────────
    const dailySw   = dailySwings.filter(s => s.idx < i);
    const dailySt   = computeStructure(dailySw, bar.close);

    // ── Compute Weekly structure ─────────────────────────────────────────────
    const wi        = dailyToWeeklyIdx[i];
    const weeklySw  = weeklySwings.filter(s => s.idx <= wi);
    const weeklySt  = computeStructure(weeklySw, weeklyBars[wi]?.close ?? bar.close);

    // ── Compute 4H-proxy structure (last 30 daily bars) ──────────────────────
    const startIdx4H = Math.max(0, i - 30);
    const proxy4H    = bars.slice(startIdx4H, i + 1);
    const swings4H   = detectSwings(proxy4H);
    const ema4H      = ema(proxy4H, Math.min(20, proxy4H.length - 1));
    const struct4H   = computeStructure(swings4H, bar.close);

    // ── Step 4: Higher timeframe confirmation ────────────────────────────────
    const weeklyAligned = dir === "long" ? weeklySt.trend === "bullish" : weeklySt.trend === "bearish";
    const dailyAligned  = dir === "long" ? dailySt.trend === "bullish"  : dailySt.trend === "bearish";
    const proxy4HAligned = dir === "long" ? struct4H.trend === "bullish" : struct4H.trend === "bearish";

    // Accept: (Weekly + Daily aligned) OR (Daily + 4H aligned)
    const htfOk = (weeklyAligned && dailyAligned) || (dailyAligned && proxy4HAligned);
    if (!htfOk) continue;

    // ── Step 5: Score each timeframe ─────────────────────────────────────────
    const weeklyScore = scoreTimeframe(weeklyBars, wi, dir, weeklyEma50, weeklySw, weeklySt);
    const dailyScore  = scoreTimeframe(bars, i, dir, dailyEma50, dailySw, dailySt);
    const score4H     = scoreTimeframe(proxy4H, proxy4H.length - 1, dir, ema4H, swings4H, struct4H);

    // ── Step 6: Trade requirements ────────────────────────────────────────────
    const scores   = [weeklyScore, dailyScore, score4H];
    const passing  = scores.filter(s => s >= 45).length;
    const total    = scores.reduce((a, b) => a + b, 0);

    if (passing < 2 || total < 120) continue;

    // ── Step 7: Entry signal on current bar ───────────────────────────────────
    if (!detectEntrySignal(bars, i, dir, dailySw)) continue;

    // ── Build trade ──────────────────────────────────────────────────────────
    const entryBar   = bars[i + 1];
    const entryPrice = entryBar.open;
    const entryTime  = entryBar.time;

    // SL: just beyond the active HL (long) or LH (short)
    let slPrice: number;
    if (dir === "long") {
      slPrice = dailySt.activeHL > 0 ? dailySt.activeHL * 0.995 : entryPrice - atr(bars, i) * 2;
    } else {
      slPrice = dailySt.activeLH < Infinity ? dailySt.activeLH * 1.005 : entryPrice + atr(bars, i) * 2;
    }

    const slDist = Math.abs(entryPrice - slPrice);
    if (slDist <= 0 || slDist / entryPrice > 0.20) continue; // sanity check

    const tpPrice = dir === "long"
      ? entryPrice + slDist * RR
      : entryPrice - slDist * RR;

    const size = (balance * RISK) / slDist;
    if (size <= 0) continue;

    const scoreStr = `W:${weeklyScore} D:${dailyScore} 4H:${score4H} total:${total}`;
    const stateStr = `W:${weeklySt.trend} D:${dailySt.trend}`;

    open = {
      direction: dir,
      entryTime, exitTime: 0,
      entryPrice, exitPrice: 0,
      slPrice, tpPrice,
      slDist, trailedToBreakeven: false, extremePrice: entryPrice,
      exitReason: "eod",
      entryReason: `${dir === "long" ? "📈 LONG" : "📉 SHORT"} · Scores ${scoreStr} · Structure ${stateStr} · SL @ $${slPrice.toFixed(0)} (${(slDist / entryPrice * 100).toFixed(1)}%) · TP 1:3`,
      analysis: "",
      entryIdx: i + 1,
      pnl: 0, size,
    };
    signals.push({ timestamp: new Date(entryTime).toISOString(), direction: dir, type: "Entry", price: entryPrice });
  }

  // Close any open trade at end of data
  if (open) {
    const last = bars[bars.length - 1];
    open.exitTime  = last.time;
    open.exitPrice = last.close;
    open.exitReason = "eod";
    open.pnl = (open.exitPrice - open.entryPrice) * (open.direction === "long" ? 1 : -1) * open.size;
    open.analysis = "Still open at end of data.";
    balance += open.pnl;
    trades.push(open);
  }

  return { trades, signals };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

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

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 730, interval = "1d" } = await req.json();
    const bars = await fetchBars(symbol, interval, limit + 200);
    const { trades, signals } = runEngine(bars);
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
