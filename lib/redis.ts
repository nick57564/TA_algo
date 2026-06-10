import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// Keep backward-compat alias used by route files
export const redis = new Proxy({} as Redis, {
  get(_, prop) {
    return (getRedis() as unknown as Record<string, unknown>)[prop as string];
  },
});

export const KEYS = {
  events:          "ta:events",
  backtest:        "ta:backtest",
  backtestSignals: "ta:backtest:signals",
  paperAccount:    "ta:paper:account",
  paperEvents:     "ta:paper:events",
  liveAccount:     "ta:live:account",
  liveEvents:      "ta:live:events",
};

export const MAX_EVENTS = 200;
