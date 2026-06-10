import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS, MAX_EVENTS } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-bot-secret");
  if (process.env.BOT_SECRET && secret !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const event = { ...body, ts: body.ts ?? new Date().toISOString() };
  await redis.lpush(KEYS.events, JSON.stringify(event));
  await redis.ltrim(KEYS.events, 0, MAX_EVENTS - 1);
  return NextResponse.json({ ok: true });
}
