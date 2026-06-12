import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HL_TESTNET = "https://api.hyperliquid-testnet.xyz/info";
const HL_MAINNET = "https://api.hyperliquid.xyz/info";

const INTERVAL_MS: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol   = searchParams.get("symbol")   ?? "BTC";
  const interval = searchParams.get("interval") ?? "1d";
  const limit    = parseInt(searchParams.get("limit") ?? "365");
  const testnet  = searchParams.get("testnet") !== "false";

  const url = testnet ? HL_TESTNET : HL_MAINNET;
  const ms  = INTERVAL_MS[interval] ?? INTERVAL_MS["1d"];

  const endMs   = Date.now();
  const startMs = endMs - limit * ms;

  const body = {
    type: "candleSnapshot",
    req: { coin: symbol, interval, startTime: startMs, endTime: endMs },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 60 },
    });
    const data = await resp.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
