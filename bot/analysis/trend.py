"""Daily 50 EMA trend filter."""

import pandas as pd


def add_ema(df: pd.DataFrame, period: int = 50) -> pd.DataFrame:
    df = df.copy()
    df["ema"] = df["close"].ewm(span=period, adjust=False).mean()
    return df


def get_bias(daily_df: pd.DataFrame, period: int = 50) -> str:
    """
    Returns 'long' if last daily close is above EMA50, 'short' otherwise.
    """
    df = add_ema(daily_df, period)
    last = df.iloc[-1]
    return "long" if last["close"] > last["ema"] else "short"
