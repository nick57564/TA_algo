import { NextResponse } from "next/server";
import { redis, EVENTS_KEY } from "@/lib/redis";
import type { BotEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await redis.lrange(EVENTS_KEY, 0, 199);
  const events: BotEvent[] = raw.map((item) =>
    typeof item === "string" ? JSON.parse(item) : item
  );
  return NextResponse.json(events);
}

export async function DELETE() {
  await redis.del(EVENTS_KEY);
  return NextResponse.json({ ok: true });
}
