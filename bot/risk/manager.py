"""
Position sizing and trade management.

SL placement:
  Long:  just below last Higher Low (active_hl - small buffer)
  Short: just above last Lower High  (active_lh + small buffer)

Position size:
  risk_amount = account_balance * RISK_PER_TRADE
  size = risk_amount / (entry_price * SL_distance_pct)
"""

from dataclasses import dataclass, field
from config import RISK_PER_TRADE, STOP_LOSS_PCT, TAKE_PROFIT_PCT

SL_BUFFER = 0.001   # 0.1% buffer below/above the structural level


@dataclass
class Trade:
    direction:   str            # "long" | "short"
    entry_price: float
    sl_price:    float
    tp_price:    float
    size:        float          # position size in base currency (BTC)
    entry_time:  object         # pandas Timestamp
    exit_price:  float | None = None
    exit_time:   object | None = None
    exit_reason: str | None    = None   # "tp" | "sl" | "manual"
    breakeven_moved: bool = False

    def is_open(self) -> bool:
        return self.exit_price is None

    def pnl(self, price: float | None = None) -> float:
        p = price if price is not None else self.exit_price
        if p is None:
            return 0.0
        if self.direction == "long":
            return (p - self.entry_price) * self.size
        else:
            return (self.entry_price - p) * self.size

    def pnl_pct(self, price: float | None = None) -> float:
        p = price if price is not None else self.exit_price
        if p is None:
            return 0.0
        if self.direction == "long":
            return (p - self.entry_price) / self.entry_price * 100
        else:
            return (self.entry_price - p) / self.entry_price * 100


def open_trade(
    direction: str,
    entry_price: float,
    entry_time: object,
    account_balance: float,
    structural_level: float | None,   # active_hl for long, active_lh for short
) -> Trade:
    """Create a new trade with correct SL/TP and position size."""

    # SL price: structural level with buffer, fallback to fixed %
    if structural_level is not None:
        if direction == "long":
            sl_price = structural_level * (1 - SL_BUFFER)
        else:
            sl_price = structural_level * (1 + SL_BUFFER)
    else:
        if direction == "long":
            sl_price = entry_price * (1 - STOP_LOSS_PCT)
        else:
            sl_price = entry_price * (1 + STOP_LOSS_PCT)

    # TP price: fixed % from entry
    if direction == "long":
        tp_price = entry_price * (1 + TAKE_PROFIT_PCT)
    else:
        tp_price = entry_price * (1 - TAKE_PROFIT_PCT)

    # Position size: risk 1% of account
    sl_distance_pct = abs(entry_price - sl_price) / entry_price
    if sl_distance_pct == 0:
        sl_distance_pct = STOP_LOSS_PCT

    risk_amount = account_balance * RISK_PER_TRADE
    size = risk_amount / (entry_price * sl_distance_pct)

    return Trade(
        direction=direction,
        entry_price=entry_price,
        sl_price=sl_price,
        tp_price=tp_price,
        size=size,
        entry_time=entry_time,
    )


def update_trade(trade: Trade, candle) -> Trade:
    """
    Apply candle to an open trade. Check SL/TP hits.
    Uses candle low/high for SL and TP checks (intra-candle).
    Returns the trade (modified in place).
    """
    if not trade.is_open():
        return trade

    low  = float(candle["low"])
    high = float(candle["high"])
    close = float(candle["close"])

    if trade.direction == "long":
        if low <= trade.sl_price:
            trade.exit_price  = trade.sl_price
            trade.exit_time   = candle.name
            trade.exit_reason = "sl"
        elif high >= trade.tp_price:
            trade.exit_price  = trade.tp_price
            trade.exit_time   = candle.name
            trade.exit_reason = "tp"
    else:  # short
        if high >= trade.sl_price:
            trade.exit_price  = trade.sl_price
            trade.exit_time   = candle.name
            trade.exit_reason = "sl"
        elif low <= trade.tp_price:
            trade.exit_price  = trade.tp_price
            trade.exit_time   = candle.name
            trade.exit_reason = "tp"

    return trade
