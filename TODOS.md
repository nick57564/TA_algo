# Trading Bot — TODO

## Phase 0: Strategy Validation (before live trading)
- [ ] Run backtest and review report stats
- [ ] Verify win rate > 50% and profit factor > 1.5
- [ ] Verify max drawdown < 15%
- [ ] Tune SWING_LOOKBACK, SHOULDER_TOLERANCE if too few signals

## Phase 1: Backtest (DONE — see main.py)
- [x] Data engine — BTCUSD OHLCV (Weekly, Daily, 4H, 1H) via ccxt/Binance
- [x] Trend filter — Daily 50 EMA (long above, short below)
- [x] Market structure engine — swing highs/lows, HH/HL/LH/LL, close-confirmed only
- [x] Multi-timeframe confirmation — Weekly+Daily or Daily+4H must agree
- [x] Head & shoulders detector — H&S (short) and inverse H&S (long)
- [x] Neckline logic — interpolated line, 0.2% close break threshold
- [x] Retest logic — within 6h/24h/144h depending on timeframe, within 0.1% of neckline
- [x] Entry trigger — bearish/bullish engulfing on retest candle
- [x] Risk management — 1% risk, 1% SL, 3% TP, breakeven at +2%
- [x] Filters — no weekends, one trade at a time
- [x] Backtest report — all required stats

## Phase 2: Paper Trading Bot
- [ ] FastAPI webhook receiver (TradingView alerts → local server)
- [ ] Real-time candle feed (ccxt websocket or polling)
- [ ] Paper order simulator (in-memory, tracks positions and P&L)
- [ ] Trade log (SQLite — entry, exit, P&L, reason)
- [ ] Run for 3+ months, track Sharpe ratio and drawdown

## Phase 3: Alert Bot
- [ ] Telegram or Discord bot — notify when signal fires
- [ ] Show: direction, entry price, SL, TP, timeframe, pattern
- [ ] Manual execution from alert (no auto-trade yet)

## Phase 4: Live Bot (after Phase 2 validation)
- [ ] Interactive Brokers paper account setup
- [ ] ib_insync connector — replace paper simulator with IB paper orders
- [ ] Kill switch — emergency close all positions
- [ ] Daily loss limit — halt bot if daily drawdown > 3%
- [ ] Validate IB paper matches backtest behavior
- [ ] Only then: enable IB live account with small position sizes

## Open Questions
- [ ] Which exchange for live trading? IB (stocks/futures) or crypto exchange?
- [ ] VPS or local machine? (local requires machine on during market hours)
- [ ] Add volume filter? (avoid low-liquidity candles)
- [ ] Add ATR-based dynamic SL instead of fixed 1%?
