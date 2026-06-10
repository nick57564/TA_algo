"""
Market structure state machine per timeframe.

State rules (close-confirmed only — no wicks):
  Bullish: a candle closes ABOVE the last swing_high (Lower High broken)
           stays bullish until a candle closes BELOW the active Higher Low
  Bearish: a candle closes BELOW the last swing_low (Higher Low broken)
           stays bearish until a candle closes ABOVE the active Lower High

Once in bullish state:
  - active_hl = the swing_low that was in place when the break happened
Once in bearish state:
  - active_lh = the swing_high that was in place when the break happened
"""

from dataclasses import dataclass, field
import pandas as pd
from analysis.swing import add_swings


@dataclass
class StructureState:
    trend: str = "neutral"      # "bullish" | "bearish" | "neutral"
    active_hl: float | None = None   # higher low (last swing low at time of bullish break)
    active_lh: float | None = None   # lower high (last swing high at time of bearish break)
    last_swing_high: float | None = None
    last_swing_low:  float | None = None


def compute_structure(df: pd.DataFrame) -> list[StructureState]:
    """
    Run the state machine over every candle.
    Returns a list of StructureState (one per candle, representing state AFTER that candle closes).
    """
    df = add_swings(df)
    states: list[StructureState] = []
    state = StructureState()

    for i, row in df.iterrows():
        # Update last known swings
        if not pd.isna(row["swing_high"]):
            state.last_swing_high = row["swing_high"]
        if not pd.isna(row["swing_low"]):
            state.last_swing_low = row["swing_low"]

        close = row["close"]

        if state.trend in ("neutral", "bearish"):
            # Bullish shift: close above last swing high (breaks lower high)
            if state.last_swing_high is not None and close > state.last_swing_high:
                state.trend    = "bullish"
                state.active_hl = state.last_swing_low   # HL = the swing low before the break
                state.active_lh = None

        if state.trend == "bullish":
            # Bearish reversal: close below active higher low
            if state.active_hl is not None and close < state.active_hl:
                state.trend    = "bearish"
                state.active_lh = state.last_swing_high
                state.active_hl = None

        if state.trend in ("neutral", "bullish"):
            # Bearish shift: close below last swing low (breaks higher low)
            if state.last_swing_low is not None and close < state.last_swing_low:
                state.trend    = "bearish"
                state.active_lh = state.last_swing_high
                state.active_hl = None

        if state.trend == "bearish":
            # Bullish reversal: close above active lower high
            if state.active_lh is not None and close > state.active_lh:
                state.trend    = "bullish"
                state.active_hl = state.last_swing_low
                state.active_lh = None

        # Snapshot current state (copy)
        states.append(StructureState(
            trend=state.trend,
            active_hl=state.active_hl,
            active_lh=state.active_lh,
            last_swing_high=state.last_swing_high,
            last_swing_low=state.last_swing_low,
        ))

    return states


def get_trend_at(states: list[StructureState], index: int) -> str:
    """Return trend string at a given candle index."""
    if index < 0 or index >= len(states):
        return "neutral"
    return states[index].trend
