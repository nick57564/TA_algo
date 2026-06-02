"""Entry trigger: engulfing candle on the retest candle confirms entry.

Short entry: bearish engulfing at neckline retest → enter after candle close.
Long entry:  bullish engulfing at neckline retest → enter after candle close.

Engulfing definition:
  Bearish: current open >= prev close AND current close < prev open (body engulfs prev body)
  Bullish: current open <= prev close AND current close > prev open
"""

import pandas as pd

from analysis.patterns.head_shoulders import HSPattern


def _is_bearish_engulfing(prev: pd.Series, curr: pd.Series) -> bool:
    return curr["open"] >= prev["close"] and curr["close"] < prev["open"]


def _is_bullish_engulfing(prev: pd.Series, curr: pd.Series) -> bool:
    return curr["open"] <= prev["close"] and curr["close"] > prev["open"]


def find_entry(
    df: pd.DataFrame,
    pattern: HSPattern,
    retest_ts: pd.Timestamp,
) -> tuple[pd.Timestamp, float] | None:
    """Return (entry_timestamp, entry_price) or None if no engulfing candle.

    Scans from the retest candle onward (up to 3 candles) for a confirming engulfing.
    Entry is at the close of the engulfing candle.
    """
    window = df[df.index >= retest_ts].head(4)
    rows = list(window.iterrows())

    for i in range(1, len(rows)):
        prev_ts, prev = rows[i - 1]
        curr_ts, curr = rows[i]

        if pattern.kind == "hs" and _is_bearish_engulfing(prev, curr):
            return curr_ts, curr["close"]
        if pattern.kind == "ihs" and _is_bullish_engulfing(prev, curr):
            return curr_ts, curr["close"]

    return None
