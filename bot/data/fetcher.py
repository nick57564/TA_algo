"""Fetch OHLCV candles from Hyperliquid (testnet or mainnet)."""

import time
import requests
import pandas as pd
from datetime import datetime, timezone

TESTNET_URL = "https://api.hyperliquid-testnet.xyz"
MAINNET_URL = "https://api.hyperliquid.xyz"

# Hyperliquid interval strings → milliseconds
_INTERVAL_MS = {
    "1H": 60 * 60 * 1000,
    "4H": 4 * 60 * 60 * 1000,
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
}

# Hyperliquid candleSnapshot interval codes
_HL_INTERVAL = {
    "1H": "1h",
    "4H": "4h",
    "1D": "1d",
    "1W": "1w",
}


def fetch_candles(symbol: str, interval: str, limit: int = 500, testnet: bool = True) -> pd.DataFrame:
    """
    Fetch OHLCV from Hyperliquid info endpoint.
    Returns DataFrame with columns: time, open, high, low, close, volume
    Index is UTC datetime.
    """
    base = TESTNET_URL if testnet else MAINNET_URL
    hl_interval = _HL_INTERVAL.get(interval)
    if not hl_interval:
        raise ValueError(f"Unsupported interval: {interval}. Use one of {list(_HL_INTERVAL)}")

    interval_ms = _INTERVAL_MS[interval]
    end_ms   = int(time.time() * 1000)
    start_ms = end_ms - (limit * interval_ms)

    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": symbol,
            "interval": hl_interval,
            "startTime": start_ms,
            "endTime": end_ms,
        }
    }

    resp = requests.post(f"{base}/info", json=payload, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    if not data:
        raise ValueError(f"No candle data returned for {symbol} {interval}")

    rows = []
    for c in data:
        rows.append({
            "time":   pd.Timestamp(c["t"], unit="ms", tz="UTC"),
            "open":   float(c["o"]),
            "high":   float(c["h"]),
            "low":    float(c["l"]),
            "close":  float(c["c"]),
            "volume": float(c["v"]),
        })

    df = pd.DataFrame(rows).set_index("time").sort_index()
    return df


def fetch_all(symbol: str, limit: int = 500, testnet: bool = True) -> dict[str, pd.DataFrame]:
    """Fetch all required timeframes. Returns dict keyed by TF string."""
    from config import TF_WEEKLY, TF_DAILY, TF_4H, TF_1H
    result = {}
    for tf in [TF_WEEKLY, TF_DAILY, TF_4H, TF_1H]:
        result[tf] = fetch_candles(symbol, tf, limit=limit, testnet=testnet)
    return result
