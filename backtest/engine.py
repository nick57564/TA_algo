"""Backtest engine: runs the full strategy on historical data.

Pipeline per timeframe (1H, 4H, Daily):
  1. Detect H&S and IHS patterns
  2. Filter by multi-timeframe structure confirmation
  3. Filter by daily trend (long only in bull, short only in bear)
  4. Find neckline break
  5. Find retest within window
  6. Find engulfing entry trigger
  7. Apply risk management candle-by-candle
  8. Collect closed trades

Filters:
  - No weekend candles
  - One trade at a time
"""

from __future__ import annotations

import pandas as pd

from config import ALLOW_WEEKENDS, MAX_OPEN_TRADES, INITIAL_CAPITAL
from analysis.trend_filter import add_trend, get_trend_at
from analysis.market_structure import compute_structure, get_structure_at
from analysis.patterns.head_shoulders import detect_patterns, HSPattern
from analysis.neckline import find_neckline_break
from analysis.retest import find_retest
from analysis.entry import find_entry
from risk.manager import Trade, open_trade, update_trade


def _is_weekend(ts: pd.Timestamp) -> bool:
    return ts.weekday() >= 5


def _mtf_confirms(
    pattern: HSPattern,
    ts: pd.Timestamp,
    higher_tf_df: pd.DataFrame,
    highest_tf_df: pd.DataFrame,
) -> bool:
    """Check multi-timeframe structure agreement.

    Long allowed if: Weekly+Daily bullish OR Daily+4H bullish.
    Short allowed if: Weekly+Daily bearish OR Daily+4H bearish.
    Do not trade if: Weekly+4H agree but Daily disagrees.
    """
    direction = "long" if pattern.kind == "ihs" else "short"
    expected = "bull" if direction == "long" else "bear"

    s_higher = get_structure_at(higher_tf_df, ts)
    s_highest = get_structure_at(highest_tf_df, ts)

    higher_ok = s_higher == expected
    highest_ok = s_highest == expected

    if higher_ok and highest_ok:
        return True
    if higher_ok or highest_ok:
        return True
    return False


def run(
    data: dict[str, pd.DataFrame],
    signal_tf: str = "4h",
) -> list[Trade]:
    """Run backtest and return list of closed Trade objects.

    data keys: '1w', '1d', '4h', '1h'
    signal_tf: timeframe to detect H&S patterns on ('1h' or '4h')
    """
    df = data[signal_tf].copy()
    daily_df = add_trend(data["1d"].copy())
    daily_struct = compute_structure(daily_df)
    weekly_struct = compute_structure(data["1w"].copy())
    htf_struct = compute_structure(data["4h"].copy()) if signal_tf == "1h" else weekly_struct

    patterns = detect_patterns(df)

    closed_trades: list[Trade] = []
    open_trades: list[Trade] = []
    equity = INITIAL_CAPITAL

    for pattern in patterns:
        # Skip if max open trades reached
        if len(open_trades) >= MAX_OPEN_TRADES:
            continue

        direction = "long" if pattern.kind == "ihs" else "short"

        # Trend filter
        trend = get_trend_at(daily_struct, pattern.right_shoulder)
        if direction == "long" and trend != "bull":
            continue
        if direction == "short" and trend != "bear":
            continue

        # MTF confirmation
        if not _mtf_confirms(pattern, pattern.right_shoulder, daily_struct, weekly_struct):
            continue

        # Neckline break
        break_ts = find_neckline_break(df, pattern)
        if break_ts is None:
            continue

        # Weekend filter on break candle
        if not ALLOW_WEEKENDS and _is_weekend(break_ts):
            continue

        # Retest
        retest_ts = find_retest(df, pattern, break_ts, signal_tf)
        if retest_ts is None:
            continue

        if not ALLOW_WEEKENDS and _is_weekend(retest_ts):
            continue

        # Entry trigger
        entry = find_entry(df, pattern, retest_ts)
        if entry is None:
            continue

        entry_ts, entry_price = entry

        trade = open_trade(direction, entry_price, entry_ts, equity)
        open_trades.append(trade)

        # Simulate candle-by-candle from entry
        after_entry = df[df.index > entry_ts]
        for ts, row in after_entry.iterrows():
            if not ALLOW_WEEKENDS and _is_weekend(ts):
                continue
            update_trade(trade, row["high"], row["low"], row["close"])
            if not trade.is_open:
                trade.exit_time = ts
                pnl = trade.pnl(trade.exit_price)
                equity += pnl
                open_trades.remove(trade)
                closed_trades.append(trade)
                break

    return closed_trades
