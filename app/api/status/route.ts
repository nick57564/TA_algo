import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { BotStatus } from "@/lib/types";

const KEY = "ta_algo:status";

export const dynamic = "force-dynamic";

const IDLE: BotStatus = {
  running: false, mode: "idle", symbol: "—", timeframe: "—",
  broker_connected: false, broker: "none", open_position: null, last_heartbeat: null,
};

export async function GET() {
  const raw = await redis.get(KEY);
  if (!raw) return NextResponse.json(IDLE);
  const status: BotStatus = typeof raw === "string" ? JSON.parse(raw) : raw as BotStatus;
  // Consider stale if no heartbeat in 60s
  if (status.last_heartbeat) {
    const age = Date.now() - new Date(status.last_heartbeat).getTime();
    if (age > 60_000) status.running = false;
  }
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Partial<BotStatus>;
  const current = await GET().then((r) => r.json()) as BotStatus;
  const updated: BotStatus = { ...current, ...body, last_heartbeat: new Date().toISOString() };
  await redis.set(KEY, JSON.stringify(updated));
  await redis.expire(KEY, 120);
  return NextResponse.json({ ok: true });
}
