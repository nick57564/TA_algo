"""Fetches BTCUSD OHLCV candle data from Binance via ccxt."""

import time
import ccxt
import pandas as pd

from config import SYMBOL, TIMEFRAMES

_exchange = ccxt.binance({"enableRateLimit": True})


def fetch(timeframe: str, limit: int = 500) -> pd.DataFrame:
    """Return OHLCV DataFrame for the given timeframe.

    Columns: time, open, high, low, close, volume
    """
    raw = _exchange.fetch_ohlcv(SYMBOL, timeframe, limit=limit)
    df = pd.DataFrame(raw, columns=["time", "open", "high", "low", "close", "volume"])
    df["time"] = pd.to_datetime(df["time"], unit="ms", utc=True)
    df.set_index("time", inplace=True)
    return df.astype(float)


def fetch_all(limit: int = 500) -> dict[str, pd.DataFrame]:
    """Return a dict of {timeframe: DataFrame} for all configured timeframes."""
    data = {}
    for tf in TIMEFRAMES:
        data[tf] = fetch(tf, limit=limit)
        time.sleep(0.2)  # respect rate limit
    return data
