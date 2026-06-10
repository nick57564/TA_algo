"""All strategy and broker configuration."""

# ── Broker ────────────────────────────────────────────────────────────────────
HYPERLIQUID_TESTNET = True          # False = live mainnet
WALLET_ADDRESS      = ""            # your Hyperliquid wallet address
PRIVATE_KEY         = ""            # your wallet private key (agent key)

# ── Instrument ────────────────────────────────────────────────────────────────
SYMBOL      = "BTC"                 # Hyperliquid symbol (no /USD suffix)
LEVERAGE    = 5                     # 5x leverage
INITIAL_CAPITAL = 10_000            # paper starting balance (USD)

# ── Timeframes ─────────────────────────────────────────────────────────────────
# Used for multi-timeframe structure analysis
TF_WEEKLY  = "1W"
TF_DAILY   = "1D"
TF_4H      = "4H"
TF_1H      = "1H"

CANDLE_LIMIT = 500                  # how many candles to fetch per timeframe

# ── Trend filter ──────────────────────────────────────────────────────────────
EMA_PERIOD = 50                     # daily 50 EMA — above = long only, below = short only

# ── Risk management ───────────────────────────────────────────────────────────
RISK_PER_TRADE  = 0.01              # 1% of account per trade
STOP_LOSS_PCT   = 0.01              # 1% SL (also used as fallback)
TAKE_PROFIT_PCT = 0.03              # 3% TP

# ── MTF sync rules ────────────────────────────────────────────────────────────
# At least one of these pairs must agree on direction before taking a trade:
#   Weekly + Daily  OR  Daily + 4H
MTF_PAIRS = [
    (TF_WEEKLY, TF_DAILY),
    (TF_DAILY,  TF_4H),
]

# ── Dashboard ─────────────────────────────────────────────────────────────────
DASHBOARD_URL = "http://localhost:3000"   # set to your Vercel URL in production
BOT_SECRET    = ""                        # match BOT_SECRET env var on dashboard
