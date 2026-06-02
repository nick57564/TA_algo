import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { BacktestResult } from "@/lib/types";

const KEY = "ta_algo:backtest:latest";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await redis.get(KEY);
  if (!raw) return NextResponse.json(null);
  const result: BacktestResult = typeof raw === "string" ? JSON.parse(raw) : raw as BacktestResult;
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as BacktestResult;
  await redis.set(KEY, JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
