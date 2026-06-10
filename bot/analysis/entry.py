"""
Entry signal detection on 1H timeframe.

Long entry conditions (all must be true):
  1. MTF aligned bullish
  2. 1H structure is bullish
  3. Price is retesting the level that caused the bullish shift (old swing high / now support)
  4. Bullish engulfing candle on 1H

Short entry conditions (mirror):
  1. MTF aligned bearish
  2. 1H structure is bearish
  3. Price is retesting the level that caused the bearish shift (old swing low / now resistance)
  4. Bearish engulfing candle on 1H

Retest definition:
  Long:  candle low touched or dipped below the active_hl level, close is above it
  Short: candle high touched or went above the active_lh level, close is below it

Engulfing definition:
  Bullish: current candle is green, previous was red, current close > previous open, current open < previous close
  Bearish: current candle is red, previous was green, current close < previous open, current open > previous close
"""

import pandas as pd
from analysis.structure import StructureState


def is_bullish_engulfing(curr: pd.Series, prev: pd.Series) -> bool:
    curr_green = curr["close"] > curr["open"]
    prev_red   = prev["close"] < prev["open"]
    return (curr_green and prev_red
            and curr["close"] > prev["open"]
            and curr["open"]  < prev["close"])


def is_bearish_engulfing(curr: pd.Series, prev: pd.Series) -> bool:
    curr_red   = curr["close"] < curr["open"]
    prev_green = prev["close"] > prev["open"]
    return (curr_red and prev_green
            and curr["close"] < prev["open"]
            and curr["open"]  > prev["close"])


RETEST_TOLERANCE = 0.002   # 0.2% tolerance around the retest level


def check_retest_long(candle: pd.Series, active_hl: float | None) -> bool:
    """Price dips to or below active_hl then closes above it."""
    if active_hl is None:
        return False
    touched = candle["low"] <= active_hl * (1 + RETEST_TOLERANCE)
    closed_above = candle["close"] > active_hl
    return touched and closed_above


def check_retest_short(candle: pd.Series, active_lh: float | None) -> bool:
    """Price spikes to or above active_lh then closes below it."""
    if active_lh is None:
        return False
    touched = candle["high"] >= active_lh * (1 - RETEST_TOLERANCE)
    closed_below = candle["close"] < active_lh
    return touched and closed_below


def find_entry(
    df_1h: pd.DataFrame,
    state_1h: StructureState,
    direction: str,         # "bullish" | "bearish"
    candle_idx: int,
) -> dict | None:
    """
    Check if candle at candle_idx produces a valid entry signal.
    Returns dict with entry details or None.
    """
    if candle_idx < 1 or candle_idx >= len(df_1h):
        return None

    curr = df_1h.iloc[candle_idx]
    prev = df_1h.iloc[candle_idx - 1]

    if direction == "bullish":
        if (state_1h.trend == "bullish"
                and check_retest_long(curr, state_1h.active_hl)
                and is_bullish_engulfing(curr, prev)):
            return {
                "direction": "long",
                "entry_price": float(curr["close"]),
                "retest_level": state_1h.active_hl,
                "timestamp": df_1h.index[candle_idx],
            }

    elif direction == "bearish":
        if (state_1h.trend == "bearish"
                and check_retest_short(curr, state_1h.active_lh)
                and is_bearish_engulfing(curr, prev)):
            return {
                "direction": "short",
                "entry_price": float(curr["close"]),
                "retest_level": state_1h.active_lh,
                "timestamp": df_1h.index[candle_idx],
            }

    return None
