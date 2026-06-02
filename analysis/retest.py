"""Retest logic: after neckline break, price must retest within the time window.

Windows (number of candles after the break candle):
  1H  → 6 candles  (6 hours)
  4H  → 6 candles  (24 hours)
  1D  → 6 candles  (144 hours)
  1W  → 2 candles

Retest valid if: distance from close to neckline ≤ 0.1%.
"""

import pandas as pd

from config import RETEST_DISTANCE, RETEST_WINDOWS
from analysis.patterns.head_shoulders import HSPattern
from analysis.neckline import neckline_price_at


def find_retest(
    df: pd.DataFrame,
    pattern: HSPattern,
    break_ts: pd.Timestamp,
    timeframe: str,
) -> pd.Timestamp | None:
    """Return timestamp of valid retest candle, or None if no retest within window."""
    max_candles = RETEST_WINDOWS.get(timeframe, 6)
    after_break = df[df.index > break_ts].head(max_candles)

    for ts, row in after_break.iterrows():
        nl = neckline_price_at(pattern, ts)
        distance = abs(row["close"] - nl) / nl
        if distance <= RETEST_DISTANCE:
            return ts

    return None
