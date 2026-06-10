import { NextRequest, NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await redis.get(KEYS.backtest);
  if (!raw) return NextResponse.json(null);
  return NextResponse.json(typeof raw === "string" ? JSON.parse(raw) : raw);
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-bot-secret");
  if (process.env.BOT_SECRET && secret !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  await redis.set(KEYS.backtest, JSON.stringify(body));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await redis.del(KEYS.backtest);
  return NextResponse.json({ ok: true });
}
