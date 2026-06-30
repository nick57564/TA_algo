import { NextResponse } from "next/server";
import { redis, KEYS } from "@/lib/redis";

export const dynamic = "force-dynamic";

interface PaperState {
  startedAt: number;
  initialBalance: number;
  balance: number;
  trades: unknown[];
  lastRun: number;
  // display fields written by /api/paper/run
  equity?: number;
  unrealized_pnl?: number;
  total_trades?: number;
  wins?: number;
  losses?: number;
  net_pnl?: number;
  equity_curve?: number[];
  position?: unknown;
  last_run?: string;
  started_at?: string;
}

export async function GET() {
  const raw = await redis.get(KEYS.paperAccount);
  if (!raw) return NextResponse.json(null);
  const state: PaperState = typeof raw === "string" ? JSON.parse(raw) : raw as PaperState;

  // If started but never run, or last run > 2h ago, trigger a run in background
  const stale = !state.lastRun || Date.now() - state.lastRun > 2 * 3600_000;
  if (stale && state.startedAt) {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    fetch(`${base}/api/paper/run`, { method: "POST" }).catch(() => {});
  }

  // Return display state (written by /api/paper/run)
  if (state.equity != null) {
    return NextResponse.json({
      balance:        state.balance,
      equity:         state.equity,
      unrealized_pnl: state.unrealized_pnl ?? 0,
      total_trades:   state.total_trades ?? 0,
      wins:           state.wins ?? 0,
      losses:         state.losses ?? 0,
      net_pnl:        state.net_pnl ?? 0,
      equity_curve:   state.equity_curve ?? [],
      position:       state.position ?? null,
      last_run:       state.last_run,
      started_at:     state.started_at,
      signal_log:     (state as PaperState & { signal_log?: unknown[] }).signal_log ?? [],
    });
  }

  // Started but first run hasn't completed yet
  return NextResponse.json({ initializing: true });
}

export async function DELETE() {
  await redis.del(KEYS.paperAccount);
  return NextResponse.json({ ok: true });
}
