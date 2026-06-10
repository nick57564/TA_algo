"""
Hyperliquid broker connector.
Supports testnet and mainnet. Uses the official hyperliquid-python-sdk.

Testnet:  app.hyperliquid-testnet.xyz  (free fake money, same API as live)
Mainnet:  app.hyperliquid.xyz
"""

import eth_account
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants

from config import HYPERLIQUID_TESTNET, WALLET_ADDRESS, PRIVATE_KEY, SYMBOL, LEVERAGE


class HyperliquidBroker:
    def __init__(self, testnet: bool = None):
        self.testnet = testnet if testnet is not None else HYPERLIQUID_TESTNET
        base_url = constants.TESTNET_API_URL if self.testnet else constants.MAINNET_API_URL

        account = eth_account.Account.from_key(PRIVATE_KEY)
        self.info     = Info(base_url, skip_ws=True)
        self.exchange = Exchange(account, base_url, account_address=WALLET_ADDRESS)
        self._set_leverage()

    def _set_leverage(self):
        """Set cross-margin leverage for the symbol."""
        try:
            self.exchange.update_leverage(LEVERAGE, SYMBOL, is_cross=True)
        except Exception as e:
            print(f"Warning: could not set leverage: {e}")

    def get_balance(self) -> float:
        """Return USDC balance (free margin)."""
        state = self.info.user_state(WALLET_ADDRESS)
        return float(state["marginSummary"]["accountValue"])

    def get_position(self) -> dict | None:
        """Return current open position for SYMBOL or None."""
        state = self.info.user_state(WALLET_ADDRESS)
        for pos in state.get("assetPositions", []):
            if pos["position"]["coin"] == SYMBOL:
                size = float(pos["position"]["szi"])
                if size != 0:
                    return {
                        "direction": "long" if size > 0 else "short",
                        "size": abs(size),
                        "entry_price": float(pos["position"]["entryPx"]),
                        "unrealized_pnl": float(pos["position"]["unrealizedPnl"]),
                    }
        return None

    def place_order(
        self,
        direction: str,      # "long" | "short"
        size: float,         # BTC amount
        sl_price: float,
        tp_price: float,
    ) -> dict:
        """Place a market order with attached SL and TP."""
        is_buy = (direction == "long")

        # Market entry
        result = self.exchange.market_open(
            SYMBOL,
            is_buy,
            size,
            slippage=0.001,   # 0.1% max slippage
        )

        # Attach SL (stop market)
        self.exchange.order(
            SYMBOL,
            not is_buy,          # SL is opposite side
            size,
            sl_price,
            {"trigger": {"triggerPx": sl_price, "isMarket": True, "tpsl": "sl"}},
            reduce_only=True,
        )

        # Attach TP (limit)
        self.exchange.order(
            SYMBOL,
            not is_buy,
            size,
            tp_price,
            {"limit": {"tif": "Gtc"}},
            reduce_only=True,
        )

        return result

    def close_position(self) -> dict | None:
        """Close the open position for SYMBOL at market."""
        pos = self.get_position()
        if not pos:
            return None
        is_buy = (pos["direction"] == "short")   # close short = buy
        return self.exchange.market_close(SYMBOL, pos["size"], slippage=0.001)

    def cancel_all_orders(self):
        """Cancel all open orders for SYMBOL."""
        open_orders = self.info.open_orders(WALLET_ADDRESS)
        for o in open_orders:
            if o["coin"] == SYMBOL:
                self.exchange.cancel(SYMBOL, o["oid"])
