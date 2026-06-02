"""Risk management: position sizing, SL/TP, breakeven trailing.

Rules:
  Risk per trade:  1% of current account equity
  Stop-loss:       1% from entry price
  Take-profit:     3% from entry price
  Breakeven:       move SL to entry when trade reaches +2%
  Close at +3%:    full TP
  If price almost hits TP but reverses: hold, do not act
"""

from dataclasses import dataclass

from config import (
    RISK_PER_TRADE,
    STOP_LOSS_PCT,
    TAKE_PROFIT_PCT,
    BREAKEVEN_TRIGGER_PCT,
)


@dataclass
class Trade:
    direction: str          # 'long' or 'short'
    entry_price: float
    entry_time: object
    position_size: float    # in base currency units (e.g. BTC)
    stop_loss: float
    take_profit: float
    breakeven_moved: bool = False
    exit_price: float | None = None
    exit_time: object = None
    exit_reason: str | None = None  # 'sl', 'tp', 'manual'

    @property
    def is_open(self) -> bool:
        return self.exit_price is None

    def pnl(self, current_price: float) -> float:
        if self.direction == "long":
            return (current_price - self.entry_price) * self.position_size
        return (self.entry_price - current_price) * self.position_size

    def pnl_pct(self, current_price: float) -> float:
        if self.direction == "long":
            return (current_price - self.entry_price) / self.entry_price
        return (self.entry_price - current_price) / self.entry_price


def open_trade(
    direction: str,
    entry_price: float,
    entry_time: object,
    equity: float,
) -> Trade:
    """Calculate position size and levels, return a new Trade."""
    risk_amount = equity * RISK_PER_TRADE
    sl_distance = entry_price * STOP_LOSS_PCT
    position_size = risk_amount / sl_distance

    if direction == "long":
        stop_loss = entry_price * (1 - STOP_LOSS_PCT)
        take_profit = entry_price * (1 + TAKE_PROFIT_PCT)
    else:
        stop_loss = entry_price * (1 + STOP_LOSS_PCT)
        take_profit = entry_price * (1 - TAKE_PROFIT_PCT)

    return Trade(
        direction=direction,
        entry_price=entry_price,
        entry_time=entry_time,
        position_size=position_size,
        stop_loss=stop_loss,
        take_profit=take_profit,
    )


def update_trade(trade: Trade, high: float, low: float, close: float) -> Trade:
    """Apply SL/TP/breakeven logic for one candle. Mutates trade in place."""
    if not trade.is_open:
        return trade

    pnl_pct = trade.pnl_pct(close)

    # Move SL to breakeven when +2% is reached
    if not trade.breakeven_moved and pnl_pct >= BREAKEVEN_TRIGGER_PCT:
        trade.stop_loss = trade.entry_price
        trade.breakeven_moved = True

    if trade.direction == "long":
        if low <= trade.stop_loss:
            trade.exit_price = trade.stop_loss
            trade.exit_reason = "sl"
        elif high >= trade.take_profit:
            trade.exit_price = trade.take_profit
            trade.exit_reason = "tp"
    else:
        if high >= trade.stop_loss:
            trade.exit_price = trade.stop_loss
            trade.exit_reason = "sl"
        elif low <= trade.take_profit:
            trade.exit_price = trade.take_profit
            trade.exit_reason = "tp"

    return trade
