import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HL_MAINNET = "https://api.hyperliquid.xyz/info";
const HL_TESTNET = "https://api.hyperliquid-testnet.xyz/info";

const INTERVAL_MS: Record<string, number> = {
  "1h":  3_600_000,
  "4h":  14_400_000,
  "1d":  86_400_000,
  "1w":  604_800_000,
};

interface Candle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface OHLCV   { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchCandles(symbol: string, interval: string, limit: number, testnet: boolean): Promise<OHLCV[]> {
  const url   = testnet ? HL_TESTNET : HL_MAINNET;
  const ms    = INTERVAL_MS[interval] ?? INTERVAL_MS["1d"];
  const endMs = Date.now();
  const startMs = endMs - limit * ms;
  const resp  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval, startTime: startMs, endTime: endMs } }),
  });
  const data: Candle[] = await resp.json();
  return data
    .map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
    .sort((a, b) => a.time - b.time);
}

// ── 200-period SMA ────────────────────────────────────────────────────────────
function sma200(values: number[]): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= 200) sum -= values[i - 200];
    out.push(i >= 199 ? sum / 200 : null);
  }
  return out;
}

// ── Swing detection (color-change method) ────────────────────────────────────
interface Swing { type: "high" | "low"; price: number; time: number; }

function detectSwings(candles: OHLCV[]): Swing[] {
  const swings: Swing[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur  = candles[i];
    const prevBull = prev.close > prev.open;
    const curBull  = cur.close  > cur.open;
    if (prevBull && !curBull)  swings.push({ type: "high", price: prev.high, time: prev.time });
    if (!prevBull && curBull)  swings.push({ type: "low",  price: prev.low,  time: prev.time });
  }
  return swings;
}

// ── Structure state machine ───────────────────────────────────────────────────
type Trend = "bullish" | "bearish" | "neutral";
interface StructureState { trend: Trend; activeHL: number; activeLH: number; }

function computeStructure(candles: OHLCV[]): StructureState[] {
  const swings = detectSwings(candles);
  const states: StructureState[] = [];

  let trend: Trend     = "neutral";
  let activeHL         = 0;
  let activeLH         = Infinity;
  let lastSwingHigh    = 0;
  let lastSwingLow     = Infinity;
  let swingIdx         = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // absorb swings up to this candle — track MOST RECENT, not all-time extreme
    while (swingIdx < swings.length && swings[swingIdx].time <= c.time) {
      const s = swings[swingIdx++];
      if (s.type === "high") lastSwingHigh = s.price;
      else                   lastSwingLow  = s.price;
    }

    // state transitions
    if (trend !== "bullish" && lastSwingHigh > 0 && c.close > lastSwingHigh) {
      trend    = "bullish";
      activeHL = lastSwingLow < Infinity ? lastSwingLow : 0;
    }
    if (trend === "bullish" && activeHL > 0 && c.close < activeHL) {
      trend    = "bearish";
      activeLH = lastSwingHigh > 0 ? lastSwingHigh : Infinity;
    }
    if (trend !== "bearish" && lastSwingLow < Infinity && c.close < lastSwingLow) {
      trend    = "bearish";
      activeLH = lastSwingHigh > 0 ? lastSwingHigh : Infinity;
    }
    if (trend === "bearish" && activeLH < Infinity && c.close > activeLH) {
      trend    = "bullish";
      activeHL = lastSwingLow < Infinity ? lastSwingLow : 0;
    }

    states.push({ trend, activeHL, activeLH });
  }
  return states;
}

// ── MTF alignment check ───────────────────────────────────────────────────────
function isAligned(
  trendD: Trend,
  trendW: Trend,
  trend4h: Trend,
  emaBias: "long" | "short",
): { ok: boolean; combo: string } {
  const dir   = emaBias === "long" ? "bullish" : "bearish";
  const wdOk  = trendW === dir && trendD === dir;
  const d4hOk = trendD === dir && trend4h === dir;
  const dOnly = trendD === dir; // daily alone is enough if 4H is neutral
  if (wdOk && d4hOk) return { ok: true, combo: "Weekly + Daily + 4H" };
  if (wdOk)          return { ok: true, combo: "Weekly + Daily" };
  if (d4hOk)         return { ok: true, combo: "Daily + 4H" };
  if (dOnly)         return { ok: true, combo: "Daily" };
  return { ok: false, combo: "" };
}

// ── Entry detection (engulfing on retest) ─────────────────────────────────────
function isEngulfing(prev: OHLCV, cur: OHLCV, dir: "bullish" | "bearish"): boolean {
  if (dir === "bullish") {
    const prevRed  = prev.close < prev.open;
    const curGreen = cur.close  > cur.open;
    return prevRed && curGreen && cur.close > prev.open && cur.open < prev.close;
  }
  const prevGreen = prev.close > prev.open;
  const curRed    = cur.close  < cur.open;
  return prevGreen && curRed && cur.close < prev.open && cur.open > prev.close;
}

const RETEST_TOL = 0.005; // 0.5%

function nearLevel(candle: OHLCV, level: number, dir: "bullish" | "bearish"): boolean {
  if (!level || level === 0 || level === Infinity) return false;
  // bullish retest: candle wick touches the level from above (low near HL)
  // bearish retest: candle wick touches the level from below (high near LH)
  const probe = dir === "bullish" ? candle.low : candle.high;
  return Math.abs(probe - level) / level < RETEST_TOL;
}

// ── Risk management ───────────────────────────────────────────────────────────
const RISK        = 0.01;
const SL_PCT      = 0.01;
const TP_PCT      = 0.03;
const SL_BUFFER   = 0.001;
const INITIAL_CAP = 10_000;

interface Trade {
  direction: "long" | "short";
  entryPrice: number; exitPrice: number;
  entryTime: number;  exitTime: number;
  slPrice: number;    tpPrice: number;
  pnl: number;        size: number;
  exitReason: "tp" | "sl" | "eod";
  entryReason: string;
  analysis?: string;
}

interface Signal {
  timestamp: string;
  direction: "long" | "short";
  type: string;
  price: number;
  timeframe: string;
}

// ── Trade failure analysis ────────────────────────────────────────────────────
function analyseFailure(t: Trade, allTrades: Trade[], idx: number): string {
  const holdMs   = t.exitTime - t.entryTime;
  const holdH    = holdMs / 3_600_000;
  const pctMove  = Math.abs(t.exitPrice - t.entryPrice) / t.entryPrice * 100;

  // Consecutive losses before this trade
  let streak = 0;
  for (let j = idx - 1; j >= 0 && allTrades[j].pnl <= 0; j--) streak++;

  if (holdH <= 4)
    return `Immediate reversal (held ${holdH.toFixed(0)}h) — false breakout, price never confirmed the move. Consider waiting for a second candle close before entering.`;

  if (holdH <= 24)
    return `Quick stop-out (held ${holdH.toFixed(0)}h) — entry timing was late in the move. The structural level may have already been absorbed by the market.`;

  if (streak >= 2)
    return `Part of a ${streak + 1}-trade losing streak — market was ranging/choppy. The 200 SMA filter kept direction right but structure levels were unreliable in this phase.`;

  if (pctMove < 0.5)
    return `Stop barely moved (${pctMove.toFixed(2)}%) before hitting SL — very tight range, likely noise around the level. A slightly wider SL buffer could have survived this.`;

  return `Structural level failed to hold — the retest level at $${t.slPrice?.toFixed(0)} was broken with conviction, signalling the higher-timeframe trend overpowered the setup.`;
}

function analyseWin(t: Trade): string {
  const holdH   = (t.exitTime - t.entryTime) / 3_600_000;
  const pctMove = Math.abs(t.exitPrice - t.entryPrice) / t.entryPrice * 100;

  if (holdH <= 8)
    return `Fast TP (${holdH.toFixed(0)}h) — strong momentum, price moved cleanly to target with no pullback.`;
  if (pctMove >= 2.8)
    return `Clean trend continuation — price respected the structural level and followed through ${pctMove.toFixed(1)}% to target.`;
  return `Level held well — price bounced from the retest zone and reached TP in ${holdH.toFixed(0)}h.`;
}

// ── Main backtest engine ──────────────────────────────────────────────────────
function runBacktest(data: { w: OHLCV[]; d: OHLCV[]; h4: OHLCV[]; h1: OHLCV[]; userLimit: number }) {
  const { w, d, h4, h1, userLimit } = data;
  // Only scan 1H candles inside the user's requested window (skip the 200-day SMA warmup period)
  const scanFrom = Date.now() - userLimit * 86_400_000;

  const statesW  = computeStructure(w);
  const statesD  = computeStructure(d);
  const statesH4 = computeStructure(h4);
  const statesH1 = computeStructure(h1);
  const smaD     = sma200(d.map(c => c.close));

  const trades:  Trade[]  = [];
  const signals: Signal[] = [];

  let balance = INITIAL_CAP;
  let open: Trade | null  = null;

  function nearestIdx(arr: OHLCV[], ts: number): number {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid].time <= ts) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  for (let i = 2; i < h1.length; i++) {
    const candle  = h1[i];
    if (candle.time < scanFrom) continue;   // skip warmup period
    const prevH1  = h1[i - 1];
    const state1h = statesH1[i];

    // ── Manage open trade ──
    if (open) {
      if (open.direction === "long") {
        if (candle.low  <= open.slPrice) { open.exitPrice = open.slPrice; open.exitTime = candle.time; open.exitReason = "sl"; }
        if (candle.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitTime = candle.time; open.exitReason = "tp"; }
      } else {
        if (candle.high >= open.slPrice) { open.exitPrice = open.slPrice; open.exitTime = candle.time; open.exitReason = "sl"; }
        if (candle.low  <= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitTime = candle.time; open.exitReason = "tp"; }
      }
      if (open.exitReason !== "eod") {
        const mult = open.direction === "long" ? 1 : -1;
        open.pnl   = (open.exitPrice - open.entryPrice) * mult * open.size;
        balance   += open.pnl;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : "Exit SL", price: open.exitPrice, timeframe: "1H" });
        trades.push(open);
        open = null;
      }
      continue;
    }

    // ── 200 SMA bias: above = long only, below = short only ──
    const dIdx   = nearestIdx(d, candle.time);
    const smaVal = smaD[dIdx];
    if (smaVal === null) continue;   // need 200 daily candles of warmup
    const emaBias: "long" | "short" = d[dIdx].close > smaVal ? "long" : "short";

    // ── MTF alignment ──
    const wIdx  = nearestIdx(w,  candle.time);
    const h4Idx = nearestIdx(h4, candle.time);
    const trendW  = statesW[wIdx]?.trend  ?? "neutral";
    const trendD  = statesD[dIdx]?.trend  ?? "neutral";
    const trendH4 = statesH4[h4Idx]?.trend ?? "neutral";

    const dir = emaBias === "long" ? "bullish" : "bearish";

    // ── Entry: engulfing candle (200 SMA sets the side, that's the only filter) ──
    if (!isEngulfing(prevH1, candle, dir)) continue;

    const side       = dir === "bullish" ? "BUY" : "SELL";
    const candleType = dir === "bullish" ? "green candle swallowed the previous red one" : "red candle swallowed the previous green one";
    const maSide     = dir === "bullish" ? "above" : "below";
    const entryReason = `${side} signal: A ${candleType}. Price is ${maSide} the 200-day moving average.`;

    // ── Size & levels ──
    const slPrice = dir === "bullish"
      ? candle.close * (1 - SL_PCT - SL_BUFFER)
      : candle.close * (1 + SL_PCT + SL_BUFFER);
    const tpPrice = dir === "bullish"
      ? candle.close * (1 + TP_PCT)
      : candle.close * (1 - TP_PCT);
    const riskAmt = balance * RISK;
    const slDist  = Math.abs(candle.close - slPrice);
    const size    = slDist > 0 ? riskAmt / slDist : 0;
    if (size <= 0) continue;

    const trade: Trade = {
      direction: dir === "bullish" ? "long" : "short",
      entryPrice: candle.close, exitPrice: 0,
      entryTime: candle.time, exitTime: 0,
      slPrice, tpPrice, size,
      pnl: 0, exitReason: "eod",
      entryReason,
    };
    open = trade;

    signals.push({ timestamp: new Date(candle.time).toISOString(), direction: trade.direction, type: "Entry", price: candle.close, timeframe: "1H" });
  }

  // Close any open at last candle
  if (open) {
    open.exitPrice  = h1[h1.length - 1].close;
    open.exitTime   = h1[h1.length - 1].time;
    open.exitReason = "eod";
    const mult = open.direction === "long" ? 1 : -1;
    open.pnl   = (open.exitPrice - open.entryPrice) * mult * open.size;
    balance   += open.pnl;
    trades.push(open);
  }

  // ── Post-trade analysis ──
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (t.exitReason === "eod") {
      t.analysis = "Trade still open at end of data — no exit signal triggered yet.";
    } else if (t.pnl > 0) {
      t.analysis = analyseWin(t);
    } else {
      t.analysis = analyseFailure(t, trades, i);
    }
  }

  // ── Stats ──
  const winners = trades.filter(t => t.pnl > 0);
  const losers  = trades.filter(t => t.pnl <= 0);
  const netPnl  = trades.reduce((s, t) => s + t.pnl, 0);
  const grossW  = winners.reduce((s, t) => s + t.pnl, 0);
  const grossL  = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  // Max drawdown
  let peak = INITIAL_CAP, maxDD = 0, eq = INITIAL_CAP;
  for (const t of trades) {
    eq   += t.pnl;
    peak  = Math.max(peak, eq);
    maxDD = Math.max(maxDD, (peak - eq) / peak * 100);
  }

  // Worst losing streak
  let streak = 0, maxStreak = 0;
  for (const t of trades) {
    if (t.pnl <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else            { streak = 0; }
  }

  // Monthly returns
  const monthly: Record<string, number> = {};
  for (const t of trades) {
    const k = new Date(t.exitTime).toISOString().slice(0, 7);
    monthly[k] = (monthly[k] ?? 0) + t.pnl;
  }

  return {
    total_trades:          trades.length,
    wins:                  winners.length,
    losses:                losers.length,
    winrate_pct:           trades.length ? winners.length / trades.length * 100 : 0,
    net_pnl:               netPnl,
    profit_factor:         grossL > 0 ? grossW / grossL : grossW > 0 ? 99 : 0,
    avg_win:               winners.length ? grossW / winners.length : 0,
    avg_loss:              losers.length  ? grossL / losers.length  : 0,
    max_drawdown_pct:      maxDD,
    largest_losing_streak: maxStreak,
    final_balance:         balance,
    monthly_returns:       monthly,
    signals,
    trades: trades.map(t => ({
      direction:   t.direction,
      entry_price: t.entryPrice,
      exit_price:  t.exitPrice,
      entry_time:  new Date(t.entryTime).toISOString(),
      exit_time:   new Date(t.exitTime).toISOString(),
      exit_reason:  t.exitReason,
      entry_reason: t.entryReason,
      analysis:     t.analysis,
      pnl:          +t.pnl.toFixed(2),
      size:        +t.size.toFixed(6),
      sl_price:    t.slPrice,
      tp_price:    t.tpPrice,
    })),
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 500, testnet = false } = await req.json();

    // Fetch limit+200 extra days so the 200 SMA has warmup across the FULL selected period
    const warmup = limit + 200;
    const [w, d, h4, h1] = await Promise.all([
      fetchCandles(symbol, "1w",  Math.min(warmup, 400), testnet),
      fetchCandles(symbol, "1d",  warmup,                testnet),
      fetchCandles(symbol, "4h",  warmup * 4,            testnet),
      fetchCandles(symbol, "1h",  warmup * 24,           testnet),
    ]);

    const result = runBacktest({ w, d, h4, h1, userLimit: limit });
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
