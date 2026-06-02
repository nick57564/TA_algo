# TA Algo — BTC Head & Shoulders Trading Bot

Multi-timeframe BTC/USDT trading bot with a live Vercel dashboard.

## Repo structure

```
/               ← Next.js dashboard (auto-deployed to Vercel)
  app/          ← pages & API routes
  lib/          ← Redis client & types
bot/            ← Python trading bot
  main.py       ← run backtest: python main.py --tf 4h
  logger.py     ← send events to the dashboard
  config.py     ← all strategy parameters
  data/         ← OHLCV fetcher (ccxt/Binance)
  analysis/     ← trend filter, market structure, H&S detector
  backtest/     ← backtest engine + report
  risk/         ← position sizing, SL/TP, breakeven
```

## Dashboard (Vercel)

Deployed automatically from this repo. Set env vars in Vercel:
```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
BOT_SECRET=...
```

## Python bot

```bash
cd bot
pip install -r requirements.txt
python main.py --tf 4h --limit 500
```

Send events to the dashboard:
```python
from logger import log_entry, log_exit, log_signal
log_signal("H&S on 4H", "BTC/USDT", "4h", "short")
```

## Strategy

1. Data — BTCUSD OHLCV: Weekly / Daily / 4H / 1H
2. Trend filter — Daily 50 EMA (long above, short below)
3. Market structure — HH/HL = bull, LH/LL = bear (close-confirmed only)
4. MTF confirmation — Weekly+Daily or Daily+4H must agree
5. Pattern — Head & Shoulders (short) / Inverse H&S (long)
6. Neckline break — close through by ≥ 0.2%
7. Retest — within 0.1% of neckline, time-windowed per TF
8. Entry — engulfing candle on retest → enter at close
9. Risk — 1% risk, 1% SL, 3% TP, breakeven at +2%
