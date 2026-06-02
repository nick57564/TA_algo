"""Interactive Brokers connector via ib_insync.

Requires:
    pip install ib_insync
    TWS or IB Gateway running locally on the configured port.

Port guide:
    7497 = TWS paper account
    7496 = TWS live account
    4002 = IB Gateway paper
    4001 = IB Gateway live
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from config import INITIAL_CAPITAL
from logger import log_info, log_error, log_entry, log_exit, log_signal

try:
    from ib_insync import IB, Stock, Forex, Crypto, MarketOrder, StopOrder, LimitOrder, util
    IB_AVAILABLE = True
except ImportError:
    IB_AVAILABLE = False


def _parse_contract(symbol: str):
    """Convert 'BTC/USDT', 'AAPL', 'EUR/USD' to an ib_insync Contract."""
    if not IB_AVAILABLE:
        raise ImportError("ib_insync not installed. Run: pip install ib_insync")
    s = symbol.upper()
    if "/" in s:
        base, quote = s.split("/")
        if quote in ("USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF"):
            return Forex(s.replace("/", ""))
        else:
            return Crypto(base, quote)
    return Stock(s, "SMART", "USD")


class IBConnector:
    def __init__(self, host: str = "127.0.0.1", port: int = 7497,
                 symbol: str = "BTC/USDT", timeframe: str = "4h", client_id: int = 1):
        self.host = host
        self.port = port
        self.symbol = symbol
        self.timeframe = timeframe
        self.client_id = client_id
        self.ib = IB() if IB_AVAILABLE else None
        self.equity = INITIAL_CAPITAL
        self.open_order_id: int | None = None

    def connect(self) -> bool:
        if not IB_AVAILABLE:
            log_error("ib_insync not installed. Run: pip install ib_insync")
            return False
        try:
            self.ib.connect(self.host, self.port, clientId=self.client_id)
            log_info(f"Connected to IB at {self.host}:{self.port}")
            print(f"✓ Connected to Interactive Brokers — {self.host}:{self.port}")
            return True
        except Exception as e:
            log_error(f"IB connection failed: {e}")
            print(f"✗ IB connection failed: {e}")
            print("  Make sure TWS or IB Gateway is running and API is enabled.")
            return False

    def get_equity(self) -> float:
        if not self.ib or not self.ib.isConnected():
            return self.equity
        try:
            account = self.ib.accountValues()
            for av in account:
                if av.tag == "NetLiquidation" and av.currency == "USD":
                    return float(av.value)
        except Exception:
            pass
        return self.equity

    def place_order(self, direction: str, quantity: float,
                    entry_price: float, stop_loss: float, take_profit: float):
        if not self.ib or not self.ib.isConnected():
            log_error("Cannot place order — IB not connected")
            return

        contract = _parse_contract(self.symbol)
        action = "BUY" if direction == "long" else "SELL"

        entry_order = MarketOrder(action, quantity)
        sl_action   = "SELL" if direction == "long" else "BUY"
        sl_order    = StopOrder(sl_action, quantity, stop_loss, outsideRth=False)
        tp_order    = LimitOrder(sl_action, quantity, take_profit, outsideRth=False)

        try:
            self.ib.qualifyContracts(contract)
            self.ib.placeOrder(contract, entry_order)
            self.ib.placeOrder(contract, sl_order)
            self.ib.placeOrder(contract, tp_order)

            log_entry(direction, self.symbol, self.timeframe,
                      entry_price, stop_loss, take_profit, self.get_equity())
            print(f"✓ Orders placed: {action} {quantity} {self.symbol} @ market")
        except Exception as e:
            log_error(f"Order failed: {e}")
            print(f"✗ Order failed: {e}")

    def run(self):
        if not self.connect():
            return

        log_info(f"IB live bot started — {self.symbol} {self.timeframe}")
        print(f"\nLive bot running — {self.symbol} {self.timeframe}")
        print("Press Ctrl+C to stop\n")

        # Use paper_broker logic but with real IB orders
        from broker.paper_broker import PaperBroker
        paper = PaperBroker(symbol=self.symbol, timeframe=self.timeframe)
        paper.run()  # runs the same strategy loop

        if self.ib and self.ib.isConnected():
            self.ib.disconnect()
            print("Disconnected from IB.")
