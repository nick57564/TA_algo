"""Paper trading broker — runs the strategy live with simulated orders."""

import time
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from data.engine import fetch_all
from analysis.market_structure import compute_structure
from analysis.trend_filter import add_trend, get_trend_at
from analysis.patterns.head_shoulders import detect_patterns
from analysis.neckline import find_neckline_break
from analysis.retest import find_retest
from analysis.entry import find_entry
from risk.manager import open_trade, update_trade, Trade
from config import INITIAL_CAPITAL
from logger import log_info, log_entry, log_exit, log_signal, log_breakeven


class PaperBroker:
    def __init__(self, symbol: str = "BTC/USDT", timeframe: str = "4h", poll_seconds: int = 60):
        self.symbol = symbol
        self.timeframe = timeframe
        self.poll_seconds = poll_seconds
        self.equity = INITIAL_CAPITAL
        self.open_trade: Trade | None = None

    def run(self):
        log_info(f"Paper broker started — {self.symbol} {self.timeframe}")
        print(f"Paper trading: {self.symbol} {self.timeframe} — polling every {self.poll_seconds}s")
        print("Press Ctrl+C to stop\n")

        while True:
            try:
                self._tick()
            except KeyboardInterrupt:
                log_info("Paper broker stopped by user")
                print("\nStopped.")
                break
            except Exception as e:
                log_info(f"Tick error: {e}")
                print(f"Error: {e}")
            time.sleep(self.poll_seconds)

    def _tick(self):
        data = fetch_all(symbol=self.symbol, limit=300)
        df   = data.get(self.timeframe)
        if df is None or df.empty:
            return

        daily  = add_trend(data.get("1d", df))
        weekly = compute_structure(data.get("1w", df))

        # Update open trade with latest candle
        if self.open_trade and self.open_trade.is_open:
            last = df.iloc[-1]
            prev_open = self.open_trade.is_open
            update_trade(self.open_trade, last["high"], last["low"], last["close"])
            if not self.open_trade.is_open and prev_open:
                pnl = self.open_trade.pnl(self.open_trade.exit_price)
                self.equity += pnl
                log_exit(
                    self.open_trade.direction, self.symbol, self.timeframe,
                    self.open_trade.entry_price, self.open_trade.exit_price,
                    pnl, self.equity, self.open_trade.exit_reason or "manual",
                )
                print(f"  Trade closed: {self.open_trade.exit_reason} | PnL ${pnl:.2f} | Equity ${self.equity:.2f}")
                self.open_trade = None

        if self.open_trade:
            return  # one trade at a time

        # Look for new patterns
        patterns = detect_patterns(df.tail(100))
        for pattern in patterns:
            trend = get_trend_at(daily, pattern.right_shoulder)
            direction = "long" if pattern.kind == "ihs" else "short"
            if direction == "long" and trend != "bull": continue
            if direction == "short" and trend != "bear": continue

            break_ts = find_neckline_break(df, pattern)
            if not break_ts: continue

            retest_ts = find_retest(df, pattern, break_ts, self.timeframe)
            if not retest_ts: continue

            entry = find_entry(df, pattern, retest_ts)
            if not entry: continue

            entry_ts, entry_price = entry
            trade = open_trade(direction, entry_price, entry_ts, self.equity)
            self.open_trade = trade

            log_signal(f"H&S pattern — {pattern.kind.upper()}", self.symbol, self.timeframe, direction)
            log_entry(direction, self.symbol, self.timeframe,
                      entry_price, trade.stop_loss, trade.take_profit, self.equity)
            print(f"  New trade: {direction.upper()} @ ${entry_price:.2f}  SL ${trade.stop_loss:.2f}  TP ${trade.take_profit:.2f}")
            break
