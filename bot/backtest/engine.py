"""
Backtest engine.

Runs the full strategy pipeline on historical data:
  1. Compute structure state for each timeframe
  2. Walk 1H candles forward
  3. At each candle: check MTF sync → check entry signal → manage open trade
"""

import pandas as pd
from analysis.structure import compute_structure, StructureState
from analysis.trend import get_bias
from analysis.mtf import is_aligned
from analysis.entry import find_entry
from risk.manager import open_trade, update_trade, Trade
from config import INITIAL_CAPITAL, TF_WEEKLY, TF_DAILY, TF_4H, TF_1H, EMA_PERIOD


def _nearest_idx(df: pd.DataFrame, ts: pd.Timestamp) -> int:
    """Return index of the last candle in df whose time <= ts."""
    mask = df.index <= ts
    if not mask.any():
        return 0
    return int(mask.values.nonzero()[0][-1])


def run(data: dict[str, pd.DataFrame]) -> tuple[list[Trade], list[dict]]:
    """
    data: dict of {timeframe: OHLCV DataFrame} for W, D, 4H, 1H.
    Returns list of completed Trade objects.
    """
    df_w  = data[TF_WEEKLY]
    df_d  = data[TF_DAILY]
    df_4h = data[TF_4H]
    df_1h = data[TF_1H]

    # Pre-compute structure states for all timeframes
    states_w  = compute_structure(df_w)
    states_d  = compute_structure(df_d)
    states_4h = compute_structure(df_4h)
    states_1h = compute_structure(df_1h)

    trades:  list[Trade] = []
    signals: list[dict]  = []
    balance = INITIAL_CAPITAL
    open_trade_obj: Trade | None = None

    for i in range(1, len(df_1h)):
        candle  = df_1h.iloc[i]
        ts      = df_1h.index[i]
        state_1h = states_1h[i]

        # Update open trade first
        if open_trade_obj and open_trade_obj.is_open():
            update_trade(open_trade_obj, candle)
            if not open_trade_obj.is_open():
                pnl = open_trade_obj.pnl()
                balance += pnl
                trades.append(open_trade_obj)
                open_trade_obj = None
            continue   # one trade at a time — skip signal check while in trade

        # Map 1H candle timestamp to index in other timeframes
        idx_w  = _nearest_idx(df_w,  ts)
        idx_d  = _nearest_idx(df_d,  ts)
        idx_4h = _nearest_idx(df_4h, ts)

        # Daily EMA bias
        ema_bias = get_bias(df_d.iloc[:idx_d + 1], EMA_PERIOD) if idx_d > 0 else "neutral"
        if ema_bias == "neutral":
            continue

        # Build structures dict for MTF check
        structures = {
            TF_WEEKLY: states_w,
            TF_DAILY:  states_d,
            TF_4H:     states_4h,
        }
        indices = {
            TF_WEEKLY: idx_w,
            TF_DAILY:  idx_d,
            TF_4H:     idx_4h,
        }

        # Determine which direction to look for (EMA bias drives this)
        direction = "bullish" if ema_bias == "long" else "bearish"

        # Check MTF alignment
        if not is_aligned(structures, indices, direction, ema_bias):
            continue

        # Check 1H entry signal
        signal = find_entry(df_1h, state_1h, direction, i)
        if signal is None:
            continue

        # Record signal for chart
        signals.append({
            "timestamp":     signal["timestamp"].isoformat(),
            "direction":     signal["direction"],
            "type":          "Entry",
            "price":         signal["entry_price"],
            "retest_level":  signal.get("retest_level"),
            "timeframe":     "1H",
        })

        # Open trade
        structural_level = state_1h.active_hl if direction == "bullish" else state_1h.active_lh
        open_trade_obj = open_trade(
            direction=signal["direction"],
            entry_price=signal["entry_price"],
            entry_time=signal["timestamp"],
            account_balance=balance,
            structural_level=structural_level,
        )

    # Close any open trade at last price
    if open_trade_obj and open_trade_obj.is_open():
        last_candle = df_1h.iloc[-1]
        open_trade_obj.exit_price  = float(last_candle["close"])
        open_trade_obj.exit_time   = df_1h.index[-1]
        open_trade_obj.exit_reason = "end_of_data"
        trades.append(open_trade_obj)

    # Add exit markers for all completed trades
    for t in trades:
        if t.exit_time and t.exit_reason != "end_of_data":
            signals.append({
                "timestamp": t.exit_time.isoformat(),
                "direction": t.direction,
                "type":      "Exit TP" if t.exit_reason == "tp" else "Exit SL",
                "price":     t.exit_price,
                "timeframe": "1H",
            })

    return trades, signals
