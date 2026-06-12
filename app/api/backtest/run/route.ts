import { NextRequest, NextResponse } from "next/server";

export const dynamic  = "force-dynamic";
export const maxDuration = 60;

const HL_MAINNET = "https://api.hyperliquid.xyz/info";
const HL_TESTNET = "https://api.hyperliquid-testnet.xyz/info";

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; }

async function fetchBars(symbol: string, interval: string, days: number, testnet: boolean): Promise<Bar[]> {
  const url     = testnet ? HL_TESTNET : HL_MAINNET;
  const msPerBar: Record<string, number> = { "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000 };
  const ms      = msPerBar[interval] ?? msPerBar["1d"];
  const endMs   = Date.now();
  const startMs = endMs - days * 86_400_000;          // always in wall-clock days
  const resp    = await fetch(url, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval, startTime: startMs, endTime: endMs } }),
  });
  const raw: RawCandle[] = await resp.json();
  return raw
    .map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c }))
    .sort((a, b) => a.time - b.time);
}

// ── 200-period SMA (expanding window so it starts from bar 1) ─────────────────
function sma(bars: Bar[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= period) sum -= bars[i - period].close;
    out.push(sum / Math.min(i + 1, period));
  }
  return out;
}

// ── Bullish engulfing: green bar fully wraps previous red bar ─────────────────
function isBullEngulf(prev: Bar, cur: Bar): boolean {
  return prev.close < prev.open           // prev is red
    && cur.close  > cur.open             // cur is green
    && cur.open   < prev.close           // opens below prev close
    && cur.close  > prev.open;           // closes above prev open
}

// ── Bearish engulfing: red bar fully wraps previous green bar ─────────────────
function isBearEngulf(prev: Bar, cur: Bar): boolean {
  return prev.close > prev.open           // prev is green
    && cur.close  < cur.open             // cur is red
    && cur.open   > prev.close           // opens above prev close
    && cur.close  < prev.open;           // closes below prev open
}

// ── Post-trade analysis ───────────────────────────────────────────────────────
function analyse(pnl: number, holdDays: number, exitReason: string, streakBefore: number): string {
  if (exitReason === "eod") return "Trade open at end of data — no exit yet.";

  if (pnl > 0) {
    if (holdDays <= 1) return `Fast win (${holdDays}d) — strong momentum right after the engulfing candle.`;
    return `Clean move to target in ${holdDays} day${holdDays > 1 ? "s" : ""} — price followed through after the pattern.`;
  }

  if (holdDays <= 1) return `Immediate reversal (${holdDays}d) — engulfing candle was a false signal; price snapped back within a day. The surrounding candles were likely too small (low volatility chop).`;
  if (streakBefore >= 2) return `Part of a ${streakBefore + 1}-loss streak — market was ranging/choppy, engulfing patterns were unreliable. The 200 MA direction was right but momentum was weak.`;
  return `Stop hit after ${holdDays} day${holdDays > 1 ? "s" : ""} — the move started but reversed before reaching the 3% target. Consider a wider TP or trailing stop in trending markets.`;
}

// ── Main engine ───────────────────────────────────────────────────────────────
interface Trade {
  direction:   "long" | "short";
  entryTime:   number; exitTime:  number;
  entryPrice:  number; exitPrice: number;
  slPrice:     number; tpPrice:   number;
  pnl:         number; size:      number;
  exitReason:  "tp" | "sl" | "eod";
  entryReason: string;
  analysis:    string;
}

function runEngine(bars: Bar[], sma200: number[]): { trades: Trade[]; signals: object[] } {
  const RISK     = 0.01;   // 1% account risk per trade
  const SL_PCT   = 0.015;  // 1.5% stop loss
  const TP_PCT   = 0.045;  // 4.5% take profit  (3:1 R:R)
  const CAP      = 10_000;

  const trades:  Trade[]   = [];
  const signals: object[]  = [];
  let balance = CAP;
  let open: Trade | null   = null;
  let lossesBefore = 0;

  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1];
    const cur  = bars[i];
    const ma   = sma200[i];

    // ── manage open trade (check SL/TP against this bar's high/low) ──
    if (open) {
      let closed = false;
      if (open.direction === "long") {
        if (cur.low  <= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = "sl"; closed = true; }
        if (cur.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      } else {
        if (cur.high >= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = "sl"; closed = true; }
        if (cur.low  <= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      }
      if (closed) {
        open.exitTime = cur.time;
        const mult    = open.direction === "long" ? 1 : -1;
        open.pnl      = (open.exitPrice - open.entryPrice) * mult * open.size;
        balance      += open.pnl;
        const streak  = lossesBefore;
        const holdD   = Math.round((open.exitTime - open.entryTime) / 86_400_000);
        open.analysis = analyse(open.pnl, holdD, open.exitReason, streak);
        if (open.pnl <= 0) lossesBefore++; else lossesBefore = 0;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : "Exit SL", price: open.exitPrice });
        trades.push(open);
        open = null;
      }
      continue;   // one trade at a time
    }

    // ── check for entry ──
    const longBias  = cur.close > ma;   // above 200 SMA → look for longs
    const shortBias = cur.close < ma;   // below 200 SMA → look for shorts

    let dir: "long" | "short" | null = null;
    if (longBias  && isBullEngulf(prev, cur)) dir = "long";
    if (shortBias && isBearEngulf(prev, cur)) dir = "short";
    if (!dir) continue;

    const slPrice = dir === "long"
      ? cur.close * (1 - SL_PCT)
      : cur.close * (1 + SL_PCT);
    const tpPrice = dir === "long"
      ? cur.close * (1 + TP_PCT)
      : cur.close * (1 - TP_PCT);
    const slDist  = Math.abs(cur.close - slPrice);
    const size    = slDist > 0 ? (balance * RISK) / slDist : 0;
    if (size <= 0) continue;

    const maSide     = dir === "long" ? "above" : "below";
    const candleDesc = dir === "long"
      ? "green candle swallowed the previous red one"
      : "red candle swallowed the previous green one";
    const entryReason = `${dir === "long" ? "BUY" : "SELL"}: A ${candleDesc}. Price is ${maSide} the 200-day moving average (${ma.toFixed(0)}).`;

    open = { direction: dir, entryTime: cur.time, exitTime: 0, entryPrice: cur.close, exitPrice: 0, slPrice, tpPrice, size, pnl: 0, exitReason: "eod", entryReason, analysis: "" };
    signals.push({ timestamp: new Date(cur.time).toISOString(), direction: dir, type: "Entry", price: cur.close });
  }

  // close any still-open trade at last bar
  if (open) {
    open.exitTime   = bars[bars.length - 1].time;
    open.exitPrice  = bars[bars.length - 1].close;
    open.exitReason = "eod";
    const mult      = open.direction === "long" ? 1 : -1;
    open.pnl        = (open.exitPrice - open.entryPrice) * mult * open.size;
    open.analysis   = analyse(open.pnl, Math.round((open.exitTime - open.entryTime) / 86_400_000), "eod", 0);
    balance        += open.pnl;
    trades.push(open);
  }

  return { trades, signals };
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function buildStats(trades: Trade[]) {
  const winners = trades.filter(t => t.pnl > 0);
  const losers  = trades.filter(t => t.pnl <= 0);
  const netPnl  = trades.reduce((s, t) => s + t.pnl, 0);
  const grossW  = winners.reduce((s, t) => s + t.pnl, 0);
  const grossL  = Math.abs(losers.reduce((s, t) => s + t.pnl, 0));

  let peak = 10_000, maxDD = 0, eq = 10_000;
  for (const t of trades) {
    eq += t.pnl; peak = Math.max(peak, eq);
    maxDD = Math.max(maxDD, (peak - eq) / peak * 100);
  }

  let streak = 0, maxStreak = 0;
  for (const t of trades) {
    if (t.pnl <= 0) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  const monthly: Record<string, number> = {};
  for (const t of trades) {
    const k = new Date(t.exitTime || t.entryTime).toISOString().slice(0, 7);
    monthly[k] = (monthly[k] ?? 0) + t.pnl;
  }

  return {
    total_trades: trades.length,
    wins:   winners.length,
    losses: losers.length,
    winrate_pct:   trades.length ? winners.length / trades.length * 100 : 0,
    net_pnl:       +netPnl.toFixed(2),
    profit_factor: grossL > 0 ? +(grossW / grossL).toFixed(2) : grossW > 0 ? 99 : 0,
    avg_win:       winners.length ? +(grossW / winners.length).toFixed(2) : 0,
    avg_loss:      losers.length  ? +(grossL / losers.length).toFixed(2)  : 0,
    max_drawdown_pct: +maxDD.toFixed(2),
    largest_losing_streak: maxStreak,
    monthly_returns: monthly,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 365, testnet = false } = await req.json();

    // fetch limit+200 days so 200 SMA has warmup from day 1
    const bars    = await fetchBars(symbol, "1d", limit + 200, testnet);
    const sma200  = sma(bars, 200);

    const { trades, signals } = runEngine(bars, sma200);
    const stats               = buildStats(trades);

    return NextResponse.json({
      ...stats,
      signals,
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
        size:         +t.size.toFixed(6),
        sl_price:     +t.slPrice.toFixed(2),
        tp_price:     +t.tpPrice.toFixed(2),
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
