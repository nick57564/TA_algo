SYMBOL = "BTC/USDT"
TIMEFRAMES = ["1w", "1d", "4h", "1h"]

# Trend filter
TREND_EMA_PERIOD = 50

# Market structure
SWING_LOOKBACK = 5  # candles each side to confirm swing high/low

# Head & shoulders
HEAD_MIN_PREMIUM = 0.01        # head must be at least 1% above shoulders
SHOULDER_TOLERANCE = 0.01      # right shoulder within ±1% of left shoulder

# Neckline
NECKLINE_BREAK_THRESHOLD = 0.002  # 0.2% close beyond neckline

# Retest
RETEST_DISTANCE = 0.001        # price within 0.1% of neckline
RETEST_WINDOWS = {             # max candles after break to expect retest
    "1h": 6,
    "4h": 6,    # 4h × 6 = 24h
    "1d": 6,    # 1d × 6 = 144h
    "1w": 2,
}

# Risk management
RISK_PER_TRADE = 0.01          # 1% of account per trade
STOP_LOSS_PCT = 0.01           # 1% from entry
TAKE_PROFIT_PCT = 0.03         # 3% from entry
BREAKEVEN_TRIGGER_PCT = 0.02   # move SL to breakeven at +2%

# Filters
ALLOW_WEEKENDS = False
MAX_OPEN_TRADES = 1

# Backtest
INITIAL_CAPITAL = 10_000.0
