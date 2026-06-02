# BTC Head & Shoulders Algo

Multi-timeframe BTC/USDT trading bot based on Head & Shoulders pattern detection with market structure, trend filter, neckline break, and retest entry logic.

**Status:** Backtest engine complete. Paper trading is next.

## Strategy

1. **Data** — BTCUSD OHLCV on Weekly, Daily, 4H, 1H
2. **Trend filter** — Daily 50 EMA: long only above, short only below
3. **Market structure** — HH/HL = bullish, LH/LL = bearish (close-confirmed, no wick breaks)
4. **MTF confirmation** — Weekly+Daily or Daily+4H must agree on direction
5. **Pattern** — Head & Shoulders (short) or Inverse H&S (long)
6. **Neckline break** — candle closes through neckline by ≥ 0.2%
7. **Retest** — price returns to neckline within 0.1%, within time window
8. **Entry** — bearish/bullish engulfing candle on retest → enter at close
9. **Risk** — 1% risk/trade, 1% SL, 3% TP, breakeven at +2%, one trade at a time

## Quickstart

```bash
pip install -r requirements.txt
python main.py --tf 4h --limit 500
```

## Build Order

1. Backtest ← **you are here**
2. Paper trading bot
3. Alert bot
4. Small-size live bot
5. Full automation
