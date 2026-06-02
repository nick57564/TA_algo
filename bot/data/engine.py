"""Fetches OHLCV candle data from Binance via ccxt.

Supports any ccxt-compatible symbol (BTC/USDT, ETH/USDT, SOL/USDT, etc.).
For stocks/forex, swap the exchange to a supported ccxt provider.
"""

import time
import ccxt
import pandas as pd

from config import TIMEFRAMES

_exchange = ccxt.binance({"enableRateLimit": True})


def fetch(symbol: str, timeframe: str, limit: int = 500) -> pd.DataFrame:
    """Return OHLCV DataFrame for the given symbol and timeframe."""
    raw = _exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
    df = pd.DataFrame(raw, columns=["time", "open", "high", "low", "close", "volume"])
    df["time"] = pd.to_datetime(df["time"], unit="ms", utc=True)
    df.set_index("time", inplace=True)
    return df.astype(float)


def fetch_all(symbol: str = "BTC/USDT", limit: int = 500) -> dict[str, pd.DataFrame]:
    """Return {timeframe: DataFrame} for all configured timeframes."""
    data = {}
    for tf in TIMEFRAMES:
        data[tf] = fetch(symbol, tf, limit=limit)
        time.sleep(0.2)
    return data
