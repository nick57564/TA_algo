import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════════════
// Market Structure Bot — full strategy backtest (steps 1-8)
//
// 1. Swings from candle colour flips (HH/HL/LH/LL, 5% zigzag filter)
// 2. Structure state machine: close above LH = bullish, below HL = bearish
// 3. Daily 50 EMA decides direction (above = longs only, below = shorts only)
// 4. HTF confirmation: (Weekly AND Daily) OR (Daily AND 4H) aligned
// 5. Score W/D/4H 0-60 on 7 criteria
// 6. Requirements: EMA dir + HTF aligned + 2 of 3 TFs >= 45 + total >= 120
// 7. Entry on 4H: Shift of Structure or engulfing candle
// 8. Risk: 1% per trade · SL just beyond the HL/LH · TP at 1:3
// ═══════════════════════════════════════════════════════════════════════════

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }
type Trend = "bullish" | "bearish" | "neutral";

const HL_API = "https://api.hyperliquid.xyz/info";
const YAHOO_SYMBOLS: Record<string, string> = {
  GOLD: "GC=F", XAUUSD: "GC=F", SPX: "^GSPC", SP500: "^GSPC", "S&P500": "^GSPC",
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchYahoo(sym: string, interval: string, days: number): Promise<Bar[]> {
  const end   = Math.floor(Date.now() / 1000);
  const start = end - days * 86400;
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&period1=${start}&period2=${end}`;
  const res   = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result?.timestamp) throw new Error("yahoo: no result");
  const q = result.indicators.quote[0];
  return result.timestamp
    .map((t: number, i: number) => ({ time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 }))
    .filter((b: Bar) => b.close != null && !isNaN(b.close))
    .sort((a: Bar, b: Bar) => a.time - b.time);
}

async function fetchHL(symbol: string, interval: string, days: number): Promise<Bar[]> {
  const end   = Date.now();
  const start = end - days * 86_400_000;
  const resp  = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval, startTime: start, endTime: end } }),
  });
  const raw: RawCandle[] = await resp.json();
  if (!Array.isArray(raw)) throw new Error("hyperliquid: bad response");
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
            .sort((a, b) => a.time - b.time);
}

async function fetchDaily(symbol: string, days: number): Promise<Bar[]> {
  const y = YAHOO_SYMBOLS[symbol.toUpperCase()];
  return y ? fetchYahoo(y, "1d", days) : fetchHL(symbol, "1d", days);
}

async function fetch4h(symbol: string, days: number): Promise<Bar[]> {
  const y = YAHOO_SYMBOLS[symbol.toUpperCase()];
  if (!y) return fetchHL(symbol, "4h", days);
  // Yahoo: 1h history capped ~730d, aggregate into 4H buckets
  const hourly = await fetchYahoo(y, "60m", Math.min(days, 720));
  const bucket = (t: number) => Math.floor(t / 14_400_000);
  const h4: Bar[] = [];
  for (const b of hourly) {
    const last = h4[h4.length - 1];
    if (last && bucket(last.time) === bucket(b.time)) {
      last.high = Math.max(last.high, b.high);
      last.low  = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else {
      h4.push({ ...b, time: bucket(b.time) * 14_400_000 });
    }
  }
  return h4;
}

// ─── Step 1: swings ───────────────────────────────────────────────────────────

interface Swing { type: "high" | "low"; price: number; barIdx: number; }

function detectSwings(bars: Bar[], minMove = 0.05): Swing[] {
  const isG = (b: Bar) => b.close >= b.open;
  const isR = (b: Bar) => b.close  < b.open;
  const raw: Swing[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (isR(bars[i]) && isG(bars[i - 1])) {
      let p = bars[i - 1].high, j = i - 2;
      while (j >= 0 && isG(bars[j])) { if (bars[j].high > p) p = bars[j].high; j--; }
      raw.push({ type: "high", price: p, barIdx: i - 1 });
    }
    if (isG(bars[i]) && isR(bars[i - 1])) {
      let p = bars[i - 1].low, j = i - 2;
      while (j >= 0 && isR(bars[j])) { if (bars[j].low < p) p = bars[j].low; j--; }
      raw.push({ type: "low", price: p, barIdx: i - 1 });
    }
  }
  const dedup: Swing[] = [];
  for (const s of raw) {
    const l = dedup[dedup.length - 1];
    if (l && l.type === s.type) {
      if (s.type === "high" && s.price > l.price) dedup[dedup.length - 1] = s;
      else if (s.type === "low" && s.price < l.price) dedup[dedup.length - 1] = s;
    } else dedup.push(s);
  }
  const major: Swing[] = [];
  for (const s of dedup) {
    if (!major.length) { major.push(s); continue; }
    const last = major[major.length - 1];
    if (last.type === s.type) {
      if (s.type === "high" && s.price > last.price) major[major.length - 1] = s;
      else if (s.type === "low" && s.price < last.price) major[major.length - 1] = s;
      continue;
    }
    if (Math.abs(s.price - last.price) / last.price >= minMove) major.push(s);
    else {
      const ps = major[major.length - 2];
      if (ps && ps.type === s.type) {
        if (s.type === "high" && s.price > ps.price) major.splice(major.length - 2, 2, s);
        else if (s.type === "low" && s.price < ps.price) major.splice(major.length - 2, 2, s);
      }
    }
  }
  return major;
}

// ─── Step 2: structure state machine (also records active HL/LH per bar) ─────

function computeStructure(bars: Bar[], swings: Swing[]) {
  let trend: Trend = "neutral";
  let activeHigh: number | null = null;   // last confirmed swing high (LH)
  let activeLow:  number | null = null;   // last confirmed swing low  (HL)
  let sw = 0;
  const regime: { time: number; trend: Trend; activeHL: number | null; activeLH: number | null }[] = [];
  for (let i = 0; i < bars.length; i++) {
    while (sw < swings.length && swings[sw].barIdx + 1 <= i) {
      const s = swings[sw];
      if (s.type === "high") activeHigh = s.price; else activeLow = s.price;
      sw++;
    }
    const c = bars[i].close;
    if (trend !== "bullish" && activeHigh !== null && c > activeHigh) trend = "bullish";
    else if (trend !== "bearish" && activeLow !== null && c < activeLow) trend = "bearish";
    regime.push({ time: bars[i].time, trend, activeHL: activeLow, activeLH: activeHigh });
  }
  return regime;
}

// ─── Step 3: 50 EMA ───────────────────────────────────────────────────────────

function ema50(bars: Bar[]): number[] {
  const k = 2 / 51;
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    out.push(i === 0 ? bars[0].close : bars[i].close * k + out[i - 1] * (1 - k));
  }
  return out;
}

function toWeeklyBars(daily: Bar[]): Bar[] {
  const wk = (t: number) => Math.floor((t / 86_400_000 + 3) / 7);
  const weekly: Bar[] = [];
  for (const b of daily) {
    const last = weekly[weekly.length - 1];
    if (last && wk(last.time) === wk(b.time)) {
      last.high = Math.max(last.high, b.high);
      last.low  = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else weekly.push({ ...b });
  }
  return weekly;
}

// ─── Step 5: scoring ─────────────────────────────────────────────────────────

function scoreTimeframe(bars: Bar[], idx: number, dir: "long" | "short", emaArr: number[], swings: Swing[], trendAtIdx: Trend, tol: number): number {
  if (idx < 2 || !bars.length) return 0;
  let total = 0;
  const b = bars[idx], prev = bars[idx - 1], close = b.close;
  const known  = swings.filter(s => s.barIdx + 1 <= idx);
  const levels = known.slice(-10);
  const kH = known.filter(s => s.type === "high");
  const kL = known.filter(s => s.type === "low");

  if ((dir === "long" && trendAtIdx === "bullish") || (dir === "short" && trendAtIdx === "bearish")) total += 10;

  const range = b.high - b.low;
  const rej = range > 0 && (dir === "long" ? (close - b.low) / range >= 0.6 : (b.high - close) / range >= 0.6);
  if (levels.some(s => Math.abs(s.price - close) / close < tol) && rej) total += 10;

  const ev = emaArr[Math.min(idx, emaArr.length - 1)];
  if (b.low <= ev && ev <= b.high) total += 5;

  const step = close >= 50_000 ? 5_000 : close >= 10_000 ? 1_000 : close >= 1_000 ? 100 : close >= 100 ? 10 : 1;
  const rd = Math.round(close / step) * step;
  if (b.low <= rd && rd <= b.high && (dir === "long" ? close > rd : close < rd)) total += 5;

  if (dir === "long"  && kL.some(s => b.low  <= s.price && close > s.price)) total += 10;
  if (dir === "short" && kH.some(s => b.high >= s.price && close < s.price)) total += 10;

  const bE = prev.close < prev.open && b.open <= prev.close && close > prev.open;
  const sE = prev.close > prev.open && b.open >= prev.close && close < prev.open;
  if (levels.some(s => Math.abs(s.price - close) / close < tol * 1.5) && (dir === "long" ? bE : sE)) total += 10;

  if (dir === "short" && kH.length >= 3) {
    const [ls, hd, rs] = kH.slice(-3);
    if (hd.price > ls.price && hd.price > rs.price) {
      const lb = kL.filter(s => s.barIdx > ls.barIdx && s.barIdx < rs.barIdx);
      if (lb.length) {
        const nk = Math.max(...lb.map(s => s.price));
        if (close < nk && b.high >= nk * (1 - tol)) total += 10;
      }
    }
  }
  if (dir === "long" && kL.length >= 3) {
    const [ls, hd, rs] = kL.slice(-3);
    if (hd.price < ls.price && hd.price < rs.price) {
      const hb = kH.filter(s => s.barIdx > ls.barIdx && s.barIdx < rs.barIdx);
      if (hb.length) {
        const nk = Math.min(...hb.map(s => s.price));
        if (close > nk && b.low <= nk * (1 + tol)) total += 10;
      }
    }
  }
  return total;
}

// Lookback: candle criteria count if they occurred recently (trader's reading)
function scoreLB(bars: Bar[], idx: number, dir: "long" | "short", emaArr: number[], swings: Swing[], trendAtIdx: Trend, tol: number, lookback: number): number {
  // take max total over window is wrong (criteria must aggregate); replicate the
  // per-criterion max by scoring each bar and taking the component-wise best.
  // scoreTimeframe returns a total, so aggregate per-criterion here instead:
  let aoi = 0, emaT = 0, round = 0, structRej = 0, engulf = 0, hns = 0;
  for (let j = Math.max(2, idx - lookback + 1); j <= idx; j++) {
    const b = bars[j], prev = bars[j - 1], close = b.close;
    const known  = swings.filter(s => s.barIdx + 1 <= j);
    const levels = known.slice(-10);
    const kH = known.filter(s => s.type === "high");
    const kL = known.filter(s => s.type === "low");
    const range = b.high - b.low;
    const rej = range > 0 && (dir === "long" ? (close - b.low) / range >= 0.6 : (b.high - close) / range >= 0.6);
    if (levels.some(s => Math.abs(s.price - close) / close < tol) && rej) aoi = 10;
    const ev = emaArr[Math.min(j, emaArr.length - 1)];
    if (b.low <= ev && ev <= b.high) emaT = 5;
    const step = close >= 50_000 ? 5_000 : close >= 10_000 ? 1_000 : close >= 1_000 ? 100 : close >= 100 ? 10 : 1;
    const rd = Math.round(close / step) * step;
    if (b.low <= rd && rd <= b.high && (dir === "long" ? close > rd : close < rd)) round = 5;
    if (dir === "long"  && kL.some(s => b.low  <= s.price && close > s.price)) structRej = 10;
    if (dir === "short" && kH.some(s => b.high >= s.price && close < s.price)) structRej = 10;
    const bE = prev.close < prev.open && b.open <= prev.close && close > prev.open;
    const sE = prev.close > prev.open && b.open >= prev.close && close < prev.open;
    if (levels.some(s => Math.abs(s.price - close) / close < tol * 1.5) && (dir === "long" ? bE : sE)) engulf = 10;
    if (dir === "short" && kH.length >= 3) {
      const [ls, hd, rs] = kH.slice(-3);
      if (hd.price > ls.price && hd.price > rs.price) {
        const lb = kL.filter(s => s.barIdx > ls.barIdx && s.barIdx < rs.barIdx);
        if (lb.length) {
          const nk = Math.max(...lb.map(s => s.price));
          if (close < nk && b.high >= nk * (1 - tol)) hns = 10;
        }
      }
    }
    if (dir === "long" && kL.length >= 3) {
      const [ls, hd, rs] = kL.slice(-3);
      if (hd.price < ls.price && hd.price < rs.price) {
        const hb = kH.filter(s => s.barIdx > ls.barIdx && s.barIdx < rs.barIdx);
        if (hb.length) {
          const nk = Math.min(...hb.map(s => s.price));
          if (close > nk && b.low <= nk * (1 + tol)) hns = 10;
        }
      }
    }
  }
  const trendPts = ((dir === "long" && trendAtIdx === "bullish") || (dir === "short" && trendAtIdx === "bearish")) ? 10 : 0;
  return trendPts + aoi + emaT + round + structRej + engulf + hns;
}

// ─── Trade + stats types ─────────────────────────────────────────────────────

interface Trade {
  direction: "long" | "short";
  entryTime: number; exitTime: number;
  entryPrice: number; exitPrice: number;
  slPrice: number; tpPrice: number;
  pnl: number; size: number;
  exitReason: "tp" | "sl" | "eod";
  entryReason: string; analysis: string;
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

// ─── The engine ──────────────────────────────────────────────────────────────

function runEngine(daily: Bar[], h4: Bar[]) {
  const RISK = 0.01;   // step 8: 1% of account per trade
  const RR   = 3;      // step 8: take profit at 1:3
  const CAP  = 10_000;

  // Daily pipeline (steps 1-3)
  const dSwings = detectSwings(daily, 0.05);
  const dRegime = computeStructure(daily, dSwings);
  const dEma    = ema50(daily);

  // Weekly (step 4)
  const weekly  = toWeeklyBars(daily);
  const wSwings = detectSwings(weekly, 0.05);
  const wRegime = computeStructure(weekly, wSwings);
  const wEma    = ema50(weekly);

  // 4H (steps 4, 5, 7)
  const hSwings = h4.length ? detectSwings(h4, 0.02) : [];
  const hRegime = h4.length ? computeStructure(h4, hSwings) : [];
  const hEma    = h4.length ? ema50(h4) : [];

  // Per daily bar: setup validity (steps 4-6) + SL levels
  let wp = 0, hp = 0;
  const setup: { time: number; dir: "long" | "short"; valid: boolean; scores: [number, number, number]; activeHL: number | null; activeLH: number | null }[] = [];
  for (let i = 0; i < daily.length; i++) {
    const b = daily[i];
    while (wp + 1 < wRegime.length && wRegime[wp + 1].time <= b.time) wp++;
    const dayEnd = b.time + 86_399_999;
    if (hRegime.length) { while (hp + 1 < hRegime.length && hRegime[hp + 1].time <= dayEnd) hp++; }

    const W = wRegime[wp]?.trend ?? "neutral";
    const D = dRegime[i].trend;
    const H: Trend = hRegime.length && hRegime[hp].time <= dayEnd ? hRegime[hp].trend : "neutral";

    const dir: "long" | "short" = b.close > dEma[i] ? "long" : "short";

    // step 4
    const htfOk =
      dir === "long"  ? (W === "bullish" && D === "bullish") || (D === "bullish" && H === "bullish")
                      : (W === "bearish" && D === "bearish") || (D === "bearish" && H === "bearish");

    // step 5
    const dS = scoreLB(daily, i, dir, dEma, dSwings, D, 0.02, 5);
    const wS = scoreLB(weekly, wp, dir, wEma, wSwings, W, 0.03, 3);
    const hS = h4.length ? scoreLB(h4, hp, dir, hEma, hSwings, H, 0.01, 18) : 0;
    const total   = wS + dS + hS;
    const passing = [wS, dS, hS].filter(s => s >= 45).length;

    // step 6
    const valid = htfOk && passing >= 2 && total >= 120;

    setup.push({ time: b.time, dir, valid, scores: [wS, dS, hS], activeHL: dRegime[i].activeHL, activeLH: dRegime[i].activeLH });
  }

  // Entry timeframe: 4H if available, otherwise daily (fallback)
  const eBars   = h4.length ? h4 : daily;
  const eSwings = h4.length ? hSwings : dSwings;

  const trades: Trade[]   = [];
  const signals: { timestamp: string; direction: "long" | "short"; type: string; price: number }[] = [];
  let balance = CAP;
  let open: Trade | null = null;

  let dp = 0, swp = 0;
  let lastH: Swing | null = null, lastL: Swing | null = null;

  for (let j = 1; j < eBars.length; j++) {
    const b = eBars[j];

    // ── manage open trade: SL checked first (conservative) ──────────────────
    if (open) {
      let closed = false;
      if (open.direction === "long") {
        if (b.low <= open.slPrice)       { open.exitPrice = open.slPrice; open.exitReason = "sl"; closed = true; }
        else if (b.high >= open.tpPrice) { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      } else {
        if (b.high >= open.slPrice)      { open.exitPrice = open.slPrice; open.exitReason = "sl"; closed = true; }
        else if (b.low <= open.tpPrice)  { open.exitPrice = open.tpPrice; open.exitReason = "tp"; closed = true; }
      }
      if (closed) {
        open.exitTime = b.time;
        open.pnl = (open.exitPrice - open.entryPrice) * (open.direction === "long" ? 1 : -1) * open.size;
        balance += open.pnl;
        const holdD = Math.max(1, Math.round((open.exitTime - open.entryTime) / 86_400_000));
        open.analysis = open.pnl > 0
          ? `✅ TP hit at 1:3 after ${holdD}d — structure played out.`
          : `❌ SL hit after ${holdD}d — stopped just beyond the ${open.direction === "long" ? "Higher Low" : "Lower High"}.`;
        signals.push({ timestamp: new Date(open.exitTime).toISOString(), direction: open.direction, type: open.exitReason === "tp" ? "Exit TP" : "Exit SL", price: open.exitPrice });
        trades.push(open);
        open = null;
      }
      continue;
    }

    // ── setup as of the last COMPLETED daily bar ─────────────────────────────
    while (dp + 1 < setup.length && setup[dp + 1].time + 86_400_000 <= b.time) dp++;
    while (swp < eSwings.length && eSwings[swp].barIdx + 1 <= j) {
      const s = eSwings[swp];
      if (s.type === "high") lastH = s; else lastL = s;
      swp++;
    }
    const st = setup[dp];
    if (!st?.valid) continue;
    const dir = st.dir;

    // ── step 7: entry signal — SoS or engulfing ─────────────────────────────
    const prev = eBars[j - 1];
    const bullEng = prev.close < prev.open && b.open <= prev.close && b.close > prev.open;
    const bearEng = prev.close > prev.open && b.open >= prev.close && b.close < prev.open;
    let kind: "SoS" | "Engulfing" | null = null;
    if (dir === "long") {
      if (lastH && prev.close <= lastH.price && b.close > lastH.price) kind = "SoS";
      else if (bullEng) kind = "Engulfing";
    } else {
      if (lastL && prev.close >= lastL.price && b.close < lastL.price) kind = "SoS";
      else if (bearEng) kind = "Engulfing";
    }
    if (!kind || j + 1 >= eBars.length) continue;

    // ── step 8: risk management ──────────────────────────────────────────────
    const entryBar   = eBars[j + 1];
    const entryPrice = entryBar.open;

    // SL just beyond the daily Higher Low (long) / Lower High (short)
    let slPrice: number;
    if (dir === "long") {
      if (st.activeHL == null) continue;
      slPrice = st.activeHL * 0.999;
      if (slPrice >= entryPrice) continue;
    } else {
      if (st.activeLH == null) continue;
      slPrice = st.activeLH * 1.001;
      if (slPrice <= entryPrice) continue;
    }
    const slDist = Math.abs(entryPrice - slPrice);
    if (slDist <= 0 || slDist / entryPrice > 0.25) continue; // sanity cap

    const tpPrice = dir === "long" ? entryPrice + slDist * RR : entryPrice - slDist * RR;
    const size = (balance * RISK) / slDist;   // position size auto-adjusts to SL distance
    if (size <= 0) continue;

    const [wS, dS2, hS] = st.scores;
    open = {
      direction: dir,
      entryTime: entryBar.time, exitTime: 0,
      entryPrice, exitPrice: 0,
      slPrice, tpPrice,
      pnl: 0, size,
      exitReason: "eod",
      entryReason: `${dir === "long" ? "📈 LONG" : "📉 SHORT"} · ${kind} on ${h4.length ? "4H" : "1D"} · Scores W${wS} D${dS2} 4H${hS} (${wS + dS2 + hS}/180) · SL ${dir === "long" ? "below HL" : "above LH"} (${(slDist / entryPrice * 100).toFixed(1)}%) · TP 1:3`,
      analysis: "",
    };
    signals.push({ timestamp: new Date(entryBar.time).toISOString(), direction: dir, type: "Entry", price: entryPrice });
  }

  if (open) {
    const last = eBars[eBars.length - 1];
    open.exitTime = last.time;
    open.exitPrice = last.close;
    open.exitReason = "eod";
    open.pnl = (open.exitPrice - open.entryPrice) * (open.direction === "long" ? 1 : -1) * open.size;
    open.analysis = "Still open at end of data.";
    balance += open.pnl;
    trades.push(open);
  }

  return { trades, signals };
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 365 } = await req.json();
    const daily = await fetchDaily(symbol, limit);
    let h4: Bar[] = [];
    try { h4 = await fetch4h(symbol, Math.min(limit, 700)); } catch { h4 = []; }

    const { trades, signals } = runEngine(daily, h4);
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
