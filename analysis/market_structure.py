"""Market structure engine: detects swing highs/lows and structure shifts.

Rules (close-confirmed only, no wick breaks):
  Bullish: confirmed Higher Highs and Higher Lows
  Bearish: confirmed Lower Lows and Lower Highs
  Bullish→bearish shift: close below last confirmed Higher Low
  Bearish→bullish shift: close above last confirmed Lower High
"""

from dataclasses import dataclass, field

import pandas as pd

from config import SWING_LOOKBACK


@dataclass
class SwingPoint:
    index: pd.Timestamp
    price: float
    kind: str  # 'high' or 'low'


@dataclass
class StructureState:
    bias: str = "neutral"          # 'bull', 'bear', 'neutral'
    swing_highs: list = field(default_factory=list)
    swing_lows: list = field(default_factory=list)
    last_hh: float | None = None
    last_hl: float | None = None
    last_ll: float | None = None
    last_lh: float | None = None


def _is_swing_high(df: pd.DataFrame, i: int, n: int) -> bool:
    if i < n or i >= len(df) - n:
        return False
    pivot_close = df["close"].iloc[i]
    left = df["close"].iloc[i - n : i]
    right = df["close"].iloc[i + 1 : i + n + 1]
    return bool((pivot_close > left).all() and (pivot_close > right).all())


def _is_swing_low(df: pd.DataFrame, i: int, n: int) -> bool:
    if i < n or i >= len(df) - n:
        return False
    pivot_close = df["close"].iloc[i]
    left = df["close"].iloc[i - n : i]
    right = df["close"].iloc[i + 1 : i + n + 1]
    return bool((pivot_close < left).all() and (pivot_close < right).all())


def detect_swing_points(df: pd.DataFrame, n: int = SWING_LOOKBACK) -> pd.DataFrame:
    """Add 'swing_high' and 'swing_low' boolean columns to df."""
    df = df.copy()
    df["swing_high"] = False
    df["swing_low"] = False
    for i in range(len(df)):
        if _is_swing_high(df, i, n):
            df.at[df.index[i], "swing_high"] = True
        if _is_swing_low(df, i, n):
            df.at[df.index[i], "swing_low"] = True
    return df


def compute_structure(df: pd.DataFrame) -> pd.DataFrame:
    """Add 'structure' column ('bull'/'bear'/'neutral') based on swing sequence."""
    df = detect_swing_points(df)
    structure = ["neutral"] * len(df)
    state = StructureState()

    highs = df.index[df["swing_high"]].tolist()
    lows = df.index[df["swing_low"]].tolist()

    all_points = (
        [(t, df.at[t, "close"], "high") for t in highs]
        + [(t, df.at[t, "close"], "low") for t in lows]
    )
    all_points.sort(key=lambda x: x[0])

    bias_at: dict[pd.Timestamp, str] = {}
    current_bias = "neutral"

    for ts, price, kind in all_points:
        if kind == "high":
            if state.last_hh is None or price > state.last_hh:
                state.last_hh = price
                if state.last_hl is not None:
                    current_bias = "bull"
            else:
                state.last_lh = price
                # bearish→bullish shift check happens on lows
        else:  # low
            if state.last_ll is None or price < state.last_ll:
                state.last_ll = price
                if state.last_lh is not None:
                    current_bias = "bear"
            else:
                state.last_hl = price
                if state.last_hh is not None:
                    current_bias = "bull"

            # structure break: close below last HL in bull
            if current_bias == "bull" and state.last_hl and price < state.last_hl:
                current_bias = "bear"
        bias_at[ts] = current_bias

    # Forward-fill bias across all candles
    last = "neutral"
    for i, ts in enumerate(df.index):
        if ts in bias_at:
            last = bias_at[ts]
        structure[i] = last

    df["structure"] = structure
    return df


def get_structure_at(df: pd.DataFrame, timestamp: pd.Timestamp) -> str:
    past = df[df.index <= timestamp]
    if past.empty or "structure" not in past.columns:
        return "neutral"
    return past.iloc[-1]["structure"]
