"""Send trade events to the Vercel dashboard."""

import json
import urllib.request
import os
from config import DASHBOARD_URL, BOT_SECRET


def _post(payload: dict) -> bool:
    url = f"{DASHBOARD_URL.rstrip('/')}/api/event"
    try:
        data = json.dumps(payload).encode()
        req  = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json", "x-bot-secret": BOT_SECRET},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
        return True
    except Exception:
        return False


def log_entry(direction: str, symbol: str, price: float, size: float, sl: float, tp: float):
    _post({"kind": "entry", "message": f"{direction.upper()} {symbol} @ ${price:,.2f}",
           "data": {"direction": direction, "symbol": symbol, "price": price,
                    "size": size, "sl": sl, "tp": tp}})


def log_exit(direction: str, symbol: str, price: float, pnl: float, reason: str):
    _post({"kind": "exit", "message": f"CLOSE {symbol} @ ${price:,.2f}  PnL ${pnl:+,.2f} ({reason})",
           "data": {"direction": direction, "symbol": symbol, "price": price,
                    "pnl": pnl, "reason": reason}})


def log_signal(message: str, symbol: str, tf: str, direction: str):
    _post({"kind": "signal", "message": message,
           "data": {"symbol": symbol, "timeframe": tf, "direction": direction}})


def log_info(message: str):
    _post({"kind": "info", "message": message})


def log_error(message: str):
    _post({"kind": "error", "message": message})
