import { NextRequest, NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const maxDuration = 30;

interface RawCandle { t: number; o: string; h: string; l: string; c: string; v: string; }
interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }

const HL = "https://api.hyperliquid.xyz/info";
const INTERVAL_MS: Record<string, number> = { "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };
const YAHOO_SYMBOLS: Record<string, string> = {
  GOLD: "GC=F", XAUUSD: "GC=F", SPX: "^GSPC", SP500: "^GSPC", "S&P500": "^GSPC",
};

async function fetchYahoo(sym: string, count: number): Promise<Bar[]> {
  const end   = Math.floor(Date.now() / 1000);
  const start = end - (count + 50) * 86400;
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${start}&period2=${end}`;
  const res   = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json();
  const result = j?.chart?.result?.[0];
  if (!result) throw new Error("yahoo: no result");
  const timestamps: number[] = result.timestamp;
  const q = result.indicators.quote[0];
  return timestamps
    .map((t, i) => ({ time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 }))
    .filter(b => b.close != null && !isNaN(b.close))
    .sort((a, b) => a.time - b.time);
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
  return raw
    .map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
    .sort((a, b) => a.time - b.time);
}

// ─── Swing Detection ─────────────────────────────────────────────────────────
// Swing High: one or more green candles → red candle → highest point before red = SH
// Swing Low : one or more red candles  → green candle → lowest point before green = SL

function detectSwings(bars: Bar[], minMove = 0.05) {
  const isGreen = (b: Bar) => b.close >= b.open;
  const isRed   = (b: Bar) => b.close  < b.open;

  const raw: { type: "high" | "low"; price: number; time: number; barIdx: number }[] = [];

  for (let i = 1; i < bars.length; i++) {
    // Swing High: current bar is RED, previous bar was GREEN
    if (isRed(bars[i]) && isGreen(bars[i - 1])) {
      // Walk back through consecutive green candles to find the peak
      let peakPrice = bars[i - 1].high;
      let j = i - 2;
      while (j >= 0 && isGreen(bars[j])) {
        if (bars[j].high > peakPrice) peakPrice = bars[j].high;
        j--;
      }
      raw.push({ type: "high", price: peakPrice, time: bars[i - 1].time, barIdx: i - 1 });
    }

    // Swing Low: current bar is GREEN, previous bar was RED
    if (isGreen(bars[i]) && isRed(bars[i - 1])) {
      // Walk back through consecutive red candles to find the trough
      let troughPrice = bars[i - 1].low;
      let j = i - 2;
      while (j >= 0 && isRed(bars[j])) {
        if (bars[j].low < troughPrice) troughPrice = bars[j].low;
        j--;
      }
      raw.push({ type: "low", price: troughPrice, time: bars[i - 1].time, barIdx: i - 1 });
    }
  }

  // Deduplicate: consecutive same-type swings → keep the most extreme
  const dedup: typeof raw = [];
  for (const s of raw) {
    const last = dedup[dedup.length - 1];
    if (last && last.type === s.type) {
      if (s.type === "high" && s.price > last.price) dedup[dedup.length - 1] = s;
      else if (s.type === "low" && s.price < last.price) dedup[dedup.length - 1] = s;
    } else {
      dedup.push(s);
    }
  }

  // ── Significance filter (zigzag) ──────────────────────────────────────────
  // Only keep MAJOR swings like a human draws them: the move between two
  // opposite swings must be at least MIN_MOVE %. Small wiggles are absorbed
  // into the bigger swing (keep the most extreme point of the leg).
  const MIN_MOVE = minMove; // minimum leg size (5% daily/weekly, smaller intraday)
  const major: typeof raw = [];
  for (const s of dedup) {
    if (major.length === 0) { major.push(s); continue; }
    const last = major[major.length - 1];

    if (last.type === s.type) {
      // same type: keep the more extreme one
      if (s.type === "high" && s.price > last.price) major[major.length - 1] = s;
      else if (s.type === "low" && s.price < last.price) major[major.length - 1] = s;
      continue;
    }

    const movePct = Math.abs(s.price - last.price) / last.price;
    if (movePct >= MIN_MOVE) {
      major.push(s); // significant leg → new swing confirmed
    } else {
      // insignificant wiggle: check if it extends the PREVIOUS same-type swing
      const prevSame = major[major.length - 2];
      if (prevSame && prevSame.type === s.type) {
        if (s.type === "high" && s.price > prevSame.price) {
          // this high is higher than the last kept high → replace it and drop the low between
          major.splice(major.length - 2, 2, s);
        } else if (s.type === "low" && s.price < prevSame.price) {
          major.splice(major.length - 2, 2, s);
        }
        // otherwise: ignore the wiggle entirely
      }
    }
  }

  // ── Label each swing: HH / LH (highs) and HL / LL (lows) ──────────────────
  // Compare to the PREVIOUS swing of the same type.
  let prevHigh: number | null = null;
  let prevLow:  number | null = null;
  const labeled = major.map(s => {
    let label: "HH" | "LH" | "HL" | "LL";
    if (s.type === "high") {
      label = prevHigh === null || s.price > prevHigh ? "HH" : "LH";
      prevHigh = s.price;
    } else {
      label = prevLow === null || s.price > prevLow ? "HL" : "LL";
      prevLow = s.price;
    }
    return { ...s, label };
  });

  return labeled;
}

// ─── Step 4 helpers: Weekly aggregation + 4H bars ────────────────────────────

// Group daily bars into weekly bars (weeks start Monday, epoch-aligned)
function toWeeklyBars(daily: Bar[]): Bar[] {
  const weekIdx = (t: number) => Math.floor((t / 86_400_000 + 3) / 7); // Jan 1 1970 = Thursday
  const weekly: Bar[] = [];
  for (const b of daily) {
    const last = weekly[weekly.length - 1];
    if (last && weekIdx(last.time) === weekIdx(b.time)) {
      last.high  = Math.max(last.high, b.high);
      last.low   = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else {
      weekly.push({ ...b });
    }
  }
  return weekly;
}

// Fetch 4H bars: native on Hyperliquid; Yahoo 1h aggregated into 4H buckets
async function fetch4hBars(symbol: string, days: number): Promise<Bar[]> {
  const yahooSym = YAHOO_SYMBOLS[symbol.toUpperCase()];
  if (yahooSym) {
    const end   = Math.floor(Date.now() / 1000);
    const start = end - Math.min(days, 720) * 86400; // Yahoo 1h history is capped at ~730d
    const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=60m&period1=${start}&period2=${end}`;
    const res   = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`yahoo 1h ${res.status}`);
    const j = await res.json();
    const result = j?.chart?.result?.[0];
    if (!result?.timestamp) throw new Error("yahoo 1h: no result");
    const q = result.indicators.quote[0];
    const hourly: Bar[] = result.timestamp
      .map((t: number, i: number) => ({ time: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 }))
      .filter((b: Bar) => b.close != null && !isNaN(b.close))
      .sort((a: Bar, b: Bar) => a.time - b.time);
    // Aggregate into 4-hour buckets
    const bucket = (t: number) => Math.floor(t / 14_400_000);
    const h4: Bar[] = [];
    for (const b of hourly) {
      const last = h4[h4.length - 1];
      if (last && bucket(last.time) === bucket(b.time)) {
        last.high  = Math.max(last.high, b.high);
        last.low   = Math.min(last.low, b.low);
        last.close = b.close;
        last.volume += b.volume;
      } else {
        h4.push({ ...b, time: bucket(b.time) * 14_400_000 });
      }
    }
    return h4;
  }
  // Hyperliquid: native 4h candles
  const end   = Date.now();
  const start = end - days * 86_400_000;
  const resp  = await fetch(HL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "candleSnapshot", req: { coin: symbol, interval: "4h", startTime: start, endTime: end } }),
  });
  const raw: RawCandle[] = await resp.json();
  if (!Array.isArray(raw)) throw new Error("hyperliquid 4h: bad response");
  return raw.map(c => ({ time: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v }))
            .sort((a, b) => a.time - b.time);
}

// ─── Step 3: Daily 50 EMA Filter ─────────────────────────────────────────────
// The EMA only decides the ALLOWED trade direction — it never creates a signal.
// Daily close above the 50 EMA → only LONG trades allowed.
// Daily close below the 50 EMA → only SHORT trades allowed.

function ema50(bars: Bar[]): number[] {
  const k = 2 / (50 + 1);
  const out: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    out.push(i === 0 ? bars[0].close : bars[i].close * k + out[i - 1] * (1 - k));
  }
  return out;
}

// ─── Step 2: Market Structure State Machine ──────────────────────────────────
// Bullish : a candle CLOSES above the previous Lower High (LH).
//           Stays bullish until a candle CLOSES below the active Higher Low (HL).
// Bearish : a candle CLOSES below the previous Higher Low (HL).
//           Stays bearish until a candle CLOSES above the active Lower High (LH).
// Pullbacks, lower highs, wicks and candle colour are ignored — only closes matter.

type Trend = "bullish" | "bearish" | "neutral";

interface StructureEvent {
  time: number;
  price: number;                        // close that broke the level
  brokeLevel: number;                   // the LH/HL price that was broken
  newTrend: "bullish" | "bearish";
}

function computeStructure(
  bars: Bar[],
  swings: ReturnType<typeof detectSwings>,
) {
  let trend: Trend = "neutral";
  let activeHigh: { price: number; label: string } | null = null; // last confirmed swing high (LH in downtrend)
  let activeLow:  { price: number; label: string } | null = null; // last confirmed swing low  (HL in uptrend)

  const regime: { time: number; close: number; trend: Trend }[] = [];
  const events: StructureEvent[] = [];

  // A swing at barIdx j is only KNOWN one bar later (the colour-flip bar j+1).
  let sw = 0;

  for (let i = 0; i < bars.length; i++) {
    // Confirm all swings whose flip bar has printed (barIdx + 1 <= i)
    while (sw < swings.length && swings[sw].barIdx + 1 <= i) {
      const s = swings[sw];
      if (s.type === "high") activeHigh = { price: s.price, label: s.label };
      else                   activeLow  = { price: s.price, label: s.label };
      sw++;
    }

    const close = bars[i].close;

    // Break UP: close above the active swing high (the previous LH) → bullish
    if (trend !== "bullish" && activeHigh && close > activeHigh.price) {
      trend = "bullish";
      events.push({ time: bars[i].time, price: close, brokeLevel: activeHigh.price, newTrend: "bullish" });
    }
    // Break DOWN: close below the active swing low (the active HL) → bearish
    else if (trend !== "bearish" && activeLow && close < activeLow.price) {
      trend = "bearish";
      events.push({ time: bars[i].time, price: close, brokeLevel: activeLow.price, newTrend: "bearish" });
    }

    regime.push({ time: bars[i].time, close, trend });
  }

  return { regime, events, finalTrend: trend };
}

export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 365, interval = "1d" } = await req.json();
    const bars   = await fetchBars(symbol, interval, limit);
    const swings = detectSwings(bars);
    const { regime, events, finalTrend } = computeStructure(bars, swings);
    const emaArr = ema50(bars);
    const lastBar = bars[bars.length - 1];

    // ── Step 4: higher timeframe structures ──────────────────────────────────
    // Weekly: aggregate the daily bars, run the SAME swing + structure logic
    const weeklyBars   = toWeeklyBars(bars);
    const weeklySwings = detectSwings(weeklyBars, 0.05);
    const weeklyRegime = computeStructure(weeklyBars, weeklySwings).regime;

    // 4H: native candles (crypto) or aggregated Yahoo 1h (GOLD/SPX);
    // smaller minimum leg because 4H swings are smaller than daily ones
    let h4Regime: { time: number; close: number; trend: Trend }[] | null = null;
    try {
      const h4Bars   = await fetch4hBars(symbol, Math.min(limit, 700));
      const h4Swings = detectSwings(h4Bars, 0.02);
      h4Regime = computeStructure(h4Bars, h4Swings).regime;
    } catch { h4Regime = null; }

    // Per daily bar: look up the weekly and 4H trend as of that day,
    // then apply the confirmation rule:
    //   LONG  allowed: (Weekly AND Daily bullish) OR (Daily AND 4H bullish)
    //   SHORT allowed: (Weekly AND Daily bearish) OR (Daily AND 4H bearish)
    let wp = 0, hp = 0;
    const htf = bars.map((b, i) => {
      while (wp + 1 < weeklyRegime.length && weeklyRegime[wp + 1].time <= b.time) wp++;
      const weekly = weeklyRegime.length ? weeklyRegime[wp].trend : "neutral";
      let h4: Trend = "neutral";
      if (h4Regime && h4Regime.length) {
        const dayEnd = b.time + 86_399_999;
        while (hp + 1 < h4Regime.length && h4Regime[hp + 1].time <= dayEnd) hp++;
        h4 = h4Regime[hp].time <= dayEnd ? h4Regime[hp].trend : "neutral";
      }
      const daily = regime[i].trend;
      const allowed: "long" | "short" | "none" =
        (weekly === "bullish" && daily === "bullish") || (daily === "bullish" && h4 === "bullish") ? "long"
        : (weekly === "bearish" && daily === "bearish") || (daily === "bearish" && h4 === "bearish") ? "short"
        : "none";
      return { time: b.time, close: b.close, weekly, daily, h4, allowed };
    });
    const htfNow = htf[htf.length - 1];

    return NextResponse.json({
      symbol,
      total_bars: bars.length,
      swing_highs: swings.filter(s => s.type === "high").length,
      swing_lows:  swings.filter(s => s.type === "low").length,
      swings: swings.map(s => ({
        type:  s.type,          // "high" | "low"
        label: s.label,         // "HH" | "LH" | "HL" | "LL"
        price: s.price,
        time:  s.time,          // unix ms — same format as candle times
      })),
      // Step 2: market structure
      current_trend: finalTrend,
      structure_events: events,           // every bullish/bearish flip (close-based break)
      regime,                             // per-bar trend for the coloured trend line
      // Step 3: daily 50 EMA direction filter
      ema50: bars.map((b, i) => ({
        time: b.time,
        value: emaArr[i],
        direction: b.close > emaArr[i] ? "long" : "short", // allowed trade direction
      })),
      allowed_direction: lastBar.close > emaArr[emaArr.length - 1] ? "long" : "short",
      // Step 4: higher timeframe confirmation
      htf,                                // per daily bar: weekly/daily/4H trend + allowed
      htf_now: {
        weekly:  htfNow?.weekly ?? "neutral",
        daily:   htfNow?.daily ?? "neutral",
        h4:      htfNow?.h4 ?? "neutral",
        allowed: htfNow?.allowed ?? "none",
        h4_available: h4Regime !== null,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
