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

function detectSwings(bars: Bar[]) {
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
  const MIN_MOVE = 0.05; // 5% minimum leg
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

export async function POST(req: NextRequest) {
  try {
    const { symbol = "BTC", limit = 365, interval = "1d" } = await req.json();
    const bars   = await fetchBars(symbol, interval, limit);
    const swings = detectSwings(bars);

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
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
