"""Neckline logic: compute neckline level and detect valid breaks.

Neckline = line/level between the two swing lows (H&S) or two swing highs (IHS).
Valid break (short): candle closes below neckline by at least 0.2%.
Valid break (long):  candle closes above neckline by at least 0.2%.
"""

import pandas as pd
import numpy as np

from config import NECKLINE_BREAK_THRESHOLD
from analysis.patterns.head_shoulders import HSPattern


def neckline_price_at(pattern: HSPattern, timestamp: pd.Timestamp) -> float:
    """Interpolate neckline price at the given timestamp (linear between two neckline points)."""
    t1 = pattern.neckline_left.timestamp()
    t2 = pattern.neckline_right.timestamp()
    p1 = pattern.neckline_left_price
    p2 = pattern.neckline_right_price
    t = timestamp.timestamp()

    if t2 == t1:
        return p1
    slope = (p2 - p1) / (t2 - t1)
    return p1 + slope * (t - t1)


def find_neckline_break(
    df: pd.DataFrame, pattern: HSPattern
) -> pd.Timestamp | None:
    """Return the timestamp of the first candle that closes through the neckline after the right shoulder."""
    after_rs = df[df.index > pattern.right_shoulder]

    for ts, row in after_rs.iterrows():
        nl = neckline_price_at(pattern, ts)
        close = row["close"]

        if pattern.kind == "hs":
            # Short: close must be below neckline by at least threshold
            if close < nl * (1 - NECKLINE_BREAK_THRESHOLD):
                return ts
        else:
            # Long: close must be above neckline by at least threshold
            if close > nl * (1 + NECKLINE_BREAK_THRESHOLD):
                return ts

    return None
