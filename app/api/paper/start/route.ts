import { NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST() {
  const state = {
    startedAt:      Date.now(),
    initialBalance: 10_000,
    balance:        10_000,
    trades:         [],
    lastRun:        0,
  };
  await redis.set(KEYS.paperAccount, JSON.stringify(state));

  // Immediately trigger first run
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  try {
    await fetch(`${base}/api/paper/run`, { method: "POST" });
  } catch {}

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await redis.del(KEYS.paperAccount);
  return NextResponse.json({ ok: true });
}
