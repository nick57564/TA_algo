import { NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await redis.lrange(KEYS.events, 0, 199);
  const events = raw.map(e => typeof e === "string" ? JSON.parse(e) : e);
  return NextResponse.json(events);
}

export async function DELETE() {
  await redis.del(KEYS.events);
  return NextResponse.json({ ok: true });
}
