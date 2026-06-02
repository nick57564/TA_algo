"""Head & Shoulders and Inverse Head & Shoulders detector.

H&S (bearish, for shorts):
  Left shoulder  = swing high
  Head           = higher swing high, at least 1% above left shoulder
  Right shoulder = swing high within ±1% of left shoulder, lower than head

Inverse H&S (bullish, for longs):
  Mirror of the above using swing lows.
"""

from dataclasses import dataclass

import pandas as pd

from config import HEAD_MIN_PREMIUM, SHOULDER_TOLERANCE
from analysis.market_structure import detect_swing_points


@dataclass
class HSPattern:
    kind: str                  # 'hs' or 'ihs'
    left_shoulder: pd.Timestamp
    head: pd.Timestamp
    right_shoulder: pd.Timestamp
    left_price: float
    head_price: float
    right_price: float
    neckline_left: pd.Timestamp   # swing low between LS and Head
    neckline_right: pd.Timestamp  # swing low between Head and RS
    neckline_left_price: float
    neckline_right_price: float


def _find_hs(df: pd.DataFrame) -> list[HSPattern]:
    """Detect standard H&S patterns (bearish)."""
    highs = df.index[df["swing_high"]].tolist()
    lows = df.index[df["swing_low"]].tolist()
    patterns = []

    for i in range(len(highs) - 2):
        ls_ts, head_ts, rs_ts = highs[i], highs[i + 1], highs[i + 2]
        ls_p = df.at[ls_ts, "close"]
        head_p = df.at[head_ts, "close"]
        rs_p = df.at[rs_ts, "close"]

        if head_p < ls_p * (1 + HEAD_MIN_PREMIUM):
            continue
        if rs_p > head_p:
            continue
        if abs(rs_p - ls_p) / ls_p > SHOULDER_TOLERANCE:
            continue

        # Find neckline lows: one between LS→Head and one between Head→RS
        nl_left_candidates = [t for t in lows if ls_ts < t < head_ts]
        nl_right_candidates = [t for t in lows if head_ts < t < rs_ts]
        if not nl_left_candidates or not nl_right_candidates:
            continue

        nl_left = nl_left_candidates[-1]
        nl_right = nl_right_candidates[0]

        patterns.append(
            HSPattern(
                kind="hs",
                left_shoulder=ls_ts,
                head=head_ts,
                right_shoulder=rs_ts,
                left_price=ls_p,
                head_price=head_p,
                right_price=rs_p,
                neckline_left=nl_left,
                neckline_right=nl_right,
                neckline_left_price=df.at[nl_left, "close"],
                neckline_right_price=df.at[nl_right, "close"],
            )
        )
    return patterns


def _find_ihs(df: pd.DataFrame) -> list[HSPattern]:
    """Detect inverse H&S patterns (bullish)."""
    lows = df.index[df["swing_low"]].tolist()
    highs = df.index[df["swing_high"]].tolist()
    patterns = []

    for i in range(len(lows) - 2):
        ls_ts, head_ts, rs_ts = lows[i], lows[i + 1], lows[i + 2]
        ls_p = df.at[ls_ts, "close"]
        head_p = df.at[head_ts, "close"]
        rs_p = df.at[rs_ts, "close"]

        if head_p > ls_p * (1 - HEAD_MIN_PREMIUM):
            continue
        if rs_p < head_p:
            continue
        if abs(rs_p - ls_p) / ls_p > SHOULDER_TOLERANCE:
            continue

        nl_left_candidates = [t for t in highs if ls_ts < t < head_ts]
        nl_right_candidates = [t for t in highs if head_ts < t < rs_ts]
        if not nl_left_candidates or not nl_right_candidates:
            continue

        nl_left = nl_left_candidates[-1]
        nl_right = nl_right_candidates[0]

        patterns.append(
            HSPattern(
                kind="ihs",
                left_shoulder=ls_ts,
                head=head_ts,
                right_shoulder=rs_ts,
                left_price=ls_p,
                head_price=head_p,
                right_price=rs_p,
                neckline_left=nl_left,
                neckline_right=nl_right,
                neckline_left_price=df.at[nl_left, "close"],
                neckline_right_price=df.at[nl_right, "close"],
            )
        )
    return patterns


def detect_patterns(df: pd.DataFrame) -> list[HSPattern]:
    df = detect_swing_points(df)
    return _find_hs(df) + _find_ihs(df)
