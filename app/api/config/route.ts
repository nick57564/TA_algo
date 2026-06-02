import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { DEFAULT_CONFIG, type BotConfig } from "@/lib/types";

const KEY = "ta_algo:config";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await redis.get(KEY);
  const config: BotConfig = raw
    ? (typeof raw === "string" ? JSON.parse(raw) : raw as BotConfig)
    : DEFAULT_CONFIG;
  return NextResponse.json(config);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Partial<BotConfig>;
  const current = await GET().then((r) => r.json()) as BotConfig;
  const updated: BotConfig = { ...current, ...body };
  await redis.set(KEY, JSON.stringify(updated));
  return NextResponse.json(updated);
}
