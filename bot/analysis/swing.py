"""
Swing detection based on candle color change.

Rule (from strategy spec):
  Green → Red transition  = swing HIGH  (top = high of last green candle)
  Red   → Green transition = swing LOW   (bottom = low of last red candle)

"Green" = close > open
"Red"   = close < open (or close == open treated as red/neutral)
"""

import pandas as pd


def _is_green(row) -> bool:
    return row["close"] > row["open"]


def _is_red(row) -> bool:
    return row["close"] <= row["open"]


def add_swings(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add columns to df:
      swing_high  — price of swing top (NaN if not a swing)
      swing_low   — price of swing bottom (NaN if not a swing)
    """
    df = df.copy()
    df["swing_high"] = float("nan")
    df["swing_low"]  = float("nan")

    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        curr = df.iloc[i]

        # Green → Red = swing high at high of the previous (green) candle
        if _is_green(prev) and _is_red(curr):
            df.at[df.index[i - 1], "swing_high"] = prev["high"]

        # Red → Green = swing low at low of the previous (red) candle
        if _is_red(prev) and _is_green(curr):
            df.at[df.index[i - 1], "swing_low"] = prev["low"]

    return df


def get_last_swing_high(df: pd.DataFrame, before_idx: int = -1) -> float | None:
    """Return the most recent swing_high before position before_idx."""
    col = df["swing_high"].iloc[:before_idx]
    valid = col.dropna()
    return float(valid.iloc[-1]) if len(valid) > 0 else None


def get_last_swing_low(df: pd.DataFrame, before_idx: int = -1) -> float | None:
    """Return the most recent swing_low before position before_idx."""
    col = df["swing_low"].iloc[:before_idx]
    valid = col.dropna()
    return float(valid.iloc[-1]) if len(valid) > 0 else None
