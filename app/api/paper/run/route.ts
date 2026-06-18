import { NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";

export const dynamic    = "force-dynamic";
export const maxDuration = 60;

const HL = "https://api.hyperliquid.xyz/info";

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }

async function fetchBars(symbol: string, count: number): Promise<Bar[]> {
  const ms    = 86_400_000;
  const end   = Date.now();
  const start = end - count * ms;
  const resp  = await fetch(HL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval: "1d", startTime: start, endTime: end } }),
  });
  const raw: RawCandle[] = await resp.json();
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
            .sort((a, b) => a.time - b.time);
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

function atr(bars: Bar[], idx: number, n = 10): number {
  let sum = 0, count = 0;
  for (let i = Math.max(1, idx - n + 1); i <= idx; i++) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i-1].close), Math.abs(bars[i].low - bars[i-1].close));
    sum += tr; count++;
  }
  return count > 0 ? sum / count : bars[idx].high - bars[idx].low;
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

function detectPattern(bars: Bar[], i: number, side: "bullish" | "bearish"): { name: string; engulfing: boolean; stop?: number; target?: number } | null {
  if (i < 20) return null;
  const win    = bars.slice(i - 100, i + 1);
  const offset = i - 100 < 0 ? i : 100;
  const pHigh  = pivots(win, "high", 2).filter(p => p.idx < offset);
  const pLow   = pivots(win, "low",  2).filter(p => p.idx < offset);
  const close  = bars[i].close;
  const prev   = bars[i - 1];
  const bearEngulf = prev.close > prev.open && bars[i].open > prev.close && close < prev.open;
  const bullEngulf = prev.close < prev.open && bars[i].open < prev.close && close > prev.open;

  if (side === "bearish") {
    if (pHigh.length >= 2) {
      const [a, b] = pHigh.slice(-2);
      if (Math.abs(a.price - b.price) / a.price < 0.02 && Math.abs(a.idx - b.idx) >= 5) {
        const neck = Math.min(...win.slice(a.idx, b.idx + 1).map(w => w.low));
        if (close < neck * 0.995) return { name: "Double Top", engulfing: bearEngulf };
      }
    }
    if (pHigh.length >= 3) {
      const [a, b, c] = pHigh.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.025 && Math.abs(c.price - avg) / avg < 0.025) {
        const neck = Math.min(...win.slice(a.idx, c.idx + 1).map(w => w.low));
        if (close < neck * 0.995) return { name: "Triple Top", engulfing: bearEngulf };
      }
    }
    for (let pi = pHigh.length - 1; pi >= 1; pi--) {
      const head = pHigh[pi];
      const lsCandidates = pHigh.filter(p => p.idx < head.idx && (head.price - p.price) / head.price >= 0.02);
      if (!lsCandidates.length) continue;
      const ls = lsCandidates[lsCandidates.length - 1];
      const rsCand = pHigh.filter(p => p.idx > head.idx && p.price < head.price);
      if (!rsCand.length) continue;
      const rs = rsCand[rsCand.length - 1];
      const headLift = Math.min(head.price - ls.price, head.price - rs.price) / head.price;
      const shoulderSim = Math.abs(ls.price - rs.price) / ls.price;
      if (headLift > 0.015 && shoulderSim < 0.06) {
        const neckL = Math.min(...win.slice(ls.idx, head.idx + 1).map(b => b.low));
        const neckR = Math.min(...win.slice(head.idx, rs.idx + 1).map(b => b.low));
        const neck  = Math.max(neckL, neckR);
        if (close < neck * 0.995) {
          return { name: "Head & Shoulders", engulfing: bearEngulf, stop: rs.price, target: neck - (head.price - neck) };
        }
      }
    }
    if (bearEngulf) return { name: "Bearish Engulfing", engulfing: true };
    const body = Math.abs(bars[i].close - bars[i].open);
    const bodyTop = Math.max(bars[i].close, bars[i].open);
    const upperWick = bars[i].high - bodyTop;
    const lowerWick2 = bodyTop - Math.min(bars[i].close, bars[i].open);
    const bodyPct = body / bars[i].close;
    if (upperWick >= body * 2 && lowerWick2 < body * 0.5 && bodyPct < 0.025) return { name: "Shooting Star", engulfing: bearEngulf };
  }

  if (side === "bullish") {
    if (pLow.length >= 2) {
      const [a, b] = pLow.slice(-2);
      if (Math.abs(a.price - b.price) / a.price < 0.02 && Math.abs(a.idx - b.idx) >= 5) {
        const neck = Math.max(...win.slice(a.idx, b.idx + 1).map(w => w.high));
        if (close > neck * 1.005) return { name: "Double Bottom", engulfing: bullEngulf };
      }
    }
    if (pLow.length >= 3) {
      const [a, b, c] = pLow.slice(-3);
      const avg = (a.price + b.price + c.price) / 3;
      if (Math.abs(a.price - avg) / avg < 0.025 && Math.abs(c.price - avg) / avg < 0.025) {
        const neck = Math.max(...win.slice(a.idx, c.idx + 1).map(w => w.high));
        if (close > neck * 1.005) return { name: "Triple Bottom", engulfing: bullEngulf };
      }
    }
    if (pLow.length >= 3) {
      const [ls, head, rs] = pLow.slice(-3);
      const sim = Math.abs(ls.price - rs.price) / ls.price;
      const dip = Math.min(ls.price - head.price, rs.price - head.price) / ls.price;
      if (dip > 0.015 && sim < 0.04) {
        const neck = Math.min(win[ls.idx]?.high ?? Infinity, win[rs.idx]?.high ?? Infinity);
        if (close > neck * 1.005) return { name: "Inv. Head & Shoulders", engulfing: bullEngulf };
      }
    }
    if (bullEngulf) return { name: "Bullish Engulfing", engulfing: true };
    const body = Math.abs(bars[i].close - bars[i].open);
    const bodyBot = Math.min(bars[i].close, bars[i].open);
    const lowerWick = bodyBot - bars[i].low;
    const upperWick2 = bars[i].high - Math.max(bars[i].close, bars[i].open);
    const bodyPct = body / bars[i].close;
    if (lowerWick >= body * 2 && upperWick2 < body * 0.5 && bodyPct < 0.025) return { name: "Hammer", engulfing: bullEngulf };
  }
  return null;
}

interface PaperTrade {
  direction: "long" | "short";
  entryTime: number; entryPrice: number;
  slPrice: number; tpPrice: number; slDist: number;
  size: number;
  exitTime?: number; exitPrice?: number; exitReason?: "tp" | "sl" | "be" | "eod";
  pnl?: number;
  entryReason: string;
  trailedToBreakeven: boolean;
  extremePrice: number;
}

interface PaperState {
  startedAt: number;
  initialBalance: number;
  balance: number;
  trades: PaperTrade[];
  lastRun: number;
}

export async function POST() {
  const SYMBOL  = "BTC";
  const BARS    = 420;
  const RISK    = 0.01;
  const ATR_SL  = 1.5;
  const RR      = 2;
  const MAX_DIST_MA = 0.10;
  const MAX_DIST_MA_STRUCT = 0.18;

  try {
    // Load paper state from Redis
    const raw = await redis.get(KEYS.paperAccount);
    if (!raw) return NextResponse.json({ error: "not_started" }, { status: 404 });
    const state: PaperState = typeof raw === "string" ? JSON.parse(raw) : raw as PaperState;

    const bars = await fetchBars(SYMBOL, BARS);
    const ma   = sma200(bars);

    // Re-run the engine from startedAt forward
    let balance    = state.initialBalance;
    const newTrades: PaperTrade[] = [];
    let open: PaperTrade | null   = null;

    // Resume from state: rebuild open position if any
    const prevOpen = state.trades.find(t => !t.exitReason);
    if (prevOpen) {
      open = { ...prevOpen };
      balance = state.balance;
    } else {
      // Recalculate balance from closed trades
      balance = state.initialBalance + state.trades.filter(t => t.pnl != null).reduce((s, t) => s + (t.pnl ?? 0), 0);
    }

    // Walk bars from startedAt
    const startIdx = bars.findIndex(b => b.time >= state.startedAt);
    if (startIdx < 205) {
      await redis.set(KEYS.paperAccount, JSON.stringify({ ...state, lastRun: Date.now() }));
      return NextResponse.json({ message: "warming up" });
    }

    for (let i = Math.max(startIdx, 205); i < bars.length - 1; i++) {
      const bar = bars[i];

      if (open) {
        // Already tracked this bar?
        const alreadyTracked = state.trades.some(t => t.entryTime === open!.entryTime);
        if (alreadyTracked && state.trades.find(t => t.entryTime === open!.entryTime && !t.exitReason)) {
          // Update trailing
          open.extremePrice = open.direction === "long" ? Math.max(open.extremePrice, bar.high) : Math.min(open.extremePrice, bar.low);
          const favMove = open.direction === "long" ? open.extremePrice - open.entryPrice : open.entryPrice - open.extremePrice;
          if (favMove >= open.slDist) {
            const trailStop = open.direction === "long" ? open.extremePrice - open.slDist : open.extremePrice + open.slDist;
            open.slPrice = open.direction === "long" ? Math.max(open.slPrice, trailStop) : Math.min(open.slPrice, trailStop);
            open.trailedToBreakeven = true;
          }
          let closed = false;
          if (open.direction === "long") {
            if (bar.low <= open.slPrice)  { open.exitPrice = open.slPrice; open.exitReason = open.trailedToBreakeven ? "be" : "sl"; closed = true; }
            if (bar.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
          } else {
            if (bar.high >= open.slPrice) { open.exitPrice = open.slPrice; open.exitReason = open.trailedToBreakeven ? "be" : "sl"; closed = true; }
            if (bar.low <= open.tpPrice)  { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
          }
          if (closed) {
            open.exitTime = bar.time;
            const mult = open.direction === "long" ? 1 : -1;
            open.pnl   = (open.exitPrice! - open.entryPrice) * mult * open.size;
            balance   += open.pnl;
            newTrades.push({ ...open });
            open = null;
          }
        }
        continue;
      }

      // Check for entry
      const aboveMA = bar.close > ma[i];
      const side    = aboveMA ? "bullish" : "bearish";
      const dir: "long" | "short" = aboveMA ? "long" : "short";
      const maSlope = ma[i] - ma[Math.max(0, i - 10)];
      const pat     = detectPattern(bars, i, side);
      if (!pat) continue;

      const isStruct = pat.stop != null;
      const distFromMA = Math.abs(bar.close - ma[i]) / ma[i];
      if (distFromMA > (isStruct ? MAX_DIST_MA_STRUCT : MAX_DIST_MA)) continue;

      const barRsi   = rsi(bars, i);
      const volRatio = volumeRatio(bars, i);
      const slopePct = Math.abs(maSlope) / ma[Math.max(0, i - 10)] * 100;
      const slopeAligned = (dir === "long" && maSlope > 0) || (dir === "short" && maSlope < 0);
      const confirmations: string[] = [];
      if (dir === "long"  && barRsi < 65) confirmations.push(`RSI ${barRsi.toFixed(0)}`);
      if (dir === "short" && barRsi > 35) confirmations.push(`RSI ${barRsi.toFixed(0)}`);
      if (volRatio >= 1.1)                confirmations.push(`vol ${volRatio.toFixed(1)}×`);
      if (slopeAligned && slopePct > 0.3) confirmations.push(`MA slope`);
      if (pat.engulfing)                  confirmations.push("engulf confirm");
      if (confirmations.length < 2) continue;

      if (i + 1 >= bars.length) continue;
      const entryBar   = bars[i + 1];
      const entryPrice = entryBar.open;
      const entryTime  = entryBar.time;

      // Skip if we already have this trade in state
      if (state.trades.some(t => t.entryTime === entryTime)) continue;

      const barAtr = atr(bars, i);
      let slPrice: number, tpPrice: number, slDist: number;
      if (pat.stop != null && pat.target != null) {
        slPrice = dir === "short" ? pat.stop * 1.005 : pat.stop * 0.995;
        tpPrice = pat.target;
        const valid = (dir === "short" && slPrice > entryPrice && tpPrice < entryPrice) ||
                      (dir === "long"  && slPrice < entryPrice && tpPrice > entryPrice);
        if (!valid) continue;
        slDist = Math.abs(slPrice - entryPrice);
      } else {
        slDist  = barAtr * ATR_SL;
        slPrice = dir === "long" ? entryPrice - slDist : entryPrice + slDist;
        tpPrice = dir === "long" ? entryPrice + slDist * RR : entryPrice - slDist * RR;
      }
      const size = slDist > 0 ? (balance * RISK) / slDist : 0;
      if (size <= 0) continue;

      open = {
        direction: dir, entryTime, entryPrice, slPrice, tpPrice, slDist, size,
        trailedToBreakeven: false, extremePrice: entryPrice,
        entryReason: `${pat.name} · ${confirmations.join(" · ")} · ${dir === "long" ? "Above" : "Below"} 200 MA`,
      };
      newTrades.push({ ...open });
    }

    // Calculate unrealized PnL on open position vs last bar
    const lastBar = bars[bars.length - 1];
    let unrealizedPnl = 0;
    const openTrade = newTrades.find(t => !t.exitReason) ?? (open ? { ...open } : null);
    if (openTrade) {
      const mult = openTrade.direction === "long" ? 1 : -1;
      unrealizedPnl = (lastBar.close - openTrade.entryPrice) * mult * openTrade.size;
    }

    // Build account state — merge old closed trades with new ones
    const allTrades = [
      ...state.trades.filter(t => t.exitReason),  // keep old closed trades
      ...newTrades,                                 // new from this run
    ];

    const closedTrades = allTrades.filter(t => t.exitReason && t.exitReason !== "eod");
    const wins   = closedTrades.filter(t => (t.pnl ?? 0) > 0).length;
    const losses = closedTrades.filter(t => (t.pnl ?? 0) <= 0).length;
    const netPnl = closedTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
    const finalBalance = state.initialBalance + netPnl;
    const equity = finalBalance + unrealizedPnl;

    const equityCurve: number[] = [state.initialBalance];
    let runningEq = state.initialBalance;
    for (const t of closedTrades) { runningEq += t.pnl ?? 0; equityCurve.push(+runningEq.toFixed(2)); }

    const newState: PaperState = {
      ...state,
      balance: finalBalance,
      trades: allTrades,
      lastRun: Date.now(),
    };
    await redis.set(KEYS.paperAccount, JSON.stringify(newState));

    const accountPayload = {
      balance:         +finalBalance.toFixed(2),
      equity:          +equity.toFixed(2),
      unrealized_pnl:  +unrealizedPnl.toFixed(2),
      total_trades:    closedTrades.length,
      wins, losses,
      net_pnl:         +netPnl.toFixed(2),
      equity_curve:    equityCurve,
      last_run:        new Date(Date.now()).toISOString(),
      started_at:      new Date(state.startedAt).toISOString(),
      position: openTrade && !openTrade.exitReason ? {
        direction:      openTrade.direction,
        size:           +openTrade.size.toFixed(6),
        entry_price:    +openTrade.entryPrice.toFixed(2),
        sl_price:       +openTrade.slPrice.toFixed(2),
        tp_price:       +openTrade.tpPrice.toFixed(2),
        unrealized_pnl: +unrealizedPnl.toFixed(2),
        entry_reason:   openTrade.entryReason,
      } : null,
    };

    return NextResponse.json(accountPayload);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
