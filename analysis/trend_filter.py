"""Trend filter: Daily 50 EMA determines trade direction."""

import pandas as pd
import pandas_ta as ta

from config import TREND_EMA_PERIOD


def add_trend(df: pd.DataFrame) -> pd.DataFrame:
    """Add 'ema50' and 'trend' columns to daily DataFrame.

    trend = 'bull' when close > ema50, 'bear' when close < ema50.
    """
    df = df.copy()
    df["ema50"] = ta.ema(df["close"], length=TREND_EMA_PERIOD)
    df["trend"] = "neutral"
    df.loc[df["close"] > df["ema50"], "trend"] = "bull"
    df.loc[df["close"] < df["ema50"], "trend"] = "bear"
    return df


def get_trend_at(daily_df: pd.DataFrame, timestamp: pd.Timestamp) -> str:
    """Return 'bull' or 'bear' for the most recent daily candle at or before timestamp."""
    past = daily_df[daily_df.index <= timestamp]
    if past.empty or "trend" not in past.columns:
        return "neutral"
    return past.iloc[-1]["trend"]
