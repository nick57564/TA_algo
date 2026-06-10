"""
Multi-timeframe sync check.

Rules:
  To go LONG:  (Weekly bullish AND Daily bullish) OR (Daily bullish AND 4H bullish)
               AND daily close above 50 EMA
  To go SHORT: (Weekly bearish AND Daily bearish) OR (Daily bearish AND 4H bearish)
               AND daily close below 50 EMA
"""

from analysis.structure import StructureState
from config import TF_WEEKLY, TF_DAILY, TF_4H


def is_aligned(
    structures: dict[str, list[StructureState]],
    indices: dict[str, int],
    direction: str,          # "bullish" | "bearish"
    ema_bias: str,           # "long" | "short"
) -> bool:
    """
    Returns True if MTF conditions are met for the given direction.
    """
    if direction == "bullish" and ema_bias != "long":
        return False
    if direction == "bearish" and ema_bias != "short":
        return False

    def trend_at(tf: str) -> str:
        states = structures.get(tf, [])
        idx    = indices.get(tf, -1)
        if not states:
            return "neutral"
        idx = min(idx, len(states) - 1)
        return states[idx].trend

    w_trend = trend_at(TF_WEEKLY)
    d_trend = trend_at(TF_DAILY)
    h4_trend = trend_at(TF_4H)

    weekly_daily_agree = (w_trend == direction and d_trend == direction)
    daily_4h_agree     = (d_trend == direction and h4_trend == direction)

    return weekly_daily_agree or daily_4h_agree
