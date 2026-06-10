# BTCUSD Structure Bot — Hyperliquid

Multi-timeframe market structure trading bot for BTC perpetuals on Hyperliquid.

## Strategy

- **EMA filter**: Daily close above 50 EMA = long only. Below = short only.
- **Structure**: Color-change swing detection (green→red = top, red→green = bottom)
- **State machine**: Bullish until close below HL. Bearish until close above LH.
- **MTF sync**: Weekly+Daily OR Daily+4H must agree before entry
- **Entry**: 1H bullish/bearish engulfing candle on retest of structural level
- **Risk**: 1% account risk, SL below last HL / above last LH, 3% TP

## Setup

```bash
cd bot
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your keys.

## Testnet (fake €10,000)

1. Create a wallet at [app.hyperliquid-testnet.xyz](https://app.hyperliquid-testnet.xyz)
2. Get testnet USDC from the faucet on the site
3. Set `HYPERLIQUID_TESTNET=True` in `config.py`
4. Run backtest:

```bash
cd bot
python main.py --mode backtest
```

## Repo structure

```
bot/
  main.py            ← entry point
  config.py          ← all parameters
  data/fetcher.py    ← OHLCV from Hyperliquid API
  analysis/
    swing.py         ← color-change swing detection
    structure.py     ← state machine (bullish/bearish)
    trend.py         ← daily 50 EMA filter
    mtf.py           ← multi-timeframe sync check
    entry.py         ← 1H engulfing entry signal
  risk/manager.py    ← position sizing, SL/TP
  backtest/
    engine.py        ← full strategy pipeline
    report.py        ← P&L stats
  broker/
    hyperliquid.py   ← Hyperliquid API connector
```
