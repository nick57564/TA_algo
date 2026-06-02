import { NextRequest, NextResponse } from "next/server";
import { redis, EVENTS_KEY, MAX_EVENTS } from "@/lib/redis";
import type { BotEvent } from "@/lib/types";

export async function POST(request: NextRequest) {
  const secret = process.env.BOT_SECRET;
  if (secret) {
    const auth = request.headers.get("x-bot-secret");
    if (auth !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json() as Omit<BotEvent, "id" | "ts">;
  const event: BotEvent = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...body,
  };

  // Prepend to list, trim to MAX_EVENTS
  await redis.lpush(EVENTS_KEY, JSON.stringify(event));
  await redis.ltrim(EVENTS_KEY, 0, MAX_EVENTS - 1);

  return NextResponse.json({ ok: true, id: event.id });
}
