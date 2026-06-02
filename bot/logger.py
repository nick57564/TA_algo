"""Sends bot events to the dashboard API.

Usage:
    from logger import log_event, log_entry, log_exit, log_signal

Set env vars (or .env file):
    DASHBOARD_URL=https://your-app.vercel.app
    BOT_SECRET=your_secret_key_here   (must match dashboard env var)
"""

import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:3000")
BOT_SECRET = os.getenv("BOT_SECRET", "")


def _post(payload: dict) -> bool:
    url = f"{DASHBOARD_URL.rstrip('/')}/api/event"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "x-bot-secret": BOT_SECRET,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5):
            return True
    except urllib.error.URLError:
        return False  # dashboard down — don't crash the bot


def log_event(kind: str, message: str, data: dict | None = None) -> bool:
    payload = {"kind": kind, "message": message}
    if data:
        payload["data"] = data
    return _post(payload)


def log_signal(message: str, symbol: str, timeframe: str, direction: str) -> bool:
    return log_event("signal", message, {
        "symbol": symbol, "timeframe": timeframe, "direction": direction,
    })


def log_entry(
    direction: str,
    symbol: str,
    timeframe: str,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    equity: float,
) -> bool:
    msg = f"{direction.upper()} entry @ ${entry_price:.2f}  SL ${stop_loss:.2f}  TP ${take_profit:.2f}"
    return log_event("entry", msg, {
        "direction": direction,
        "symbol": symbol,
        "timeframe": timeframe,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "equity": equity,
    })


def log_exit(
    direction: str,
    symbol: str,
    timeframe: str,
    entry_price: float,
    exit_price: float,
    pnl: float,
    equity: float,
    reason: str,  # 'sl' | 'tp' | 'manual'
) -> bool:
    pnl_pct = (exit_price - entry_price) / entry_price if direction == "long" else (entry_price - exit_price) / entry_price
    sign = "+" if pnl >= 0 else ""
    msg = f"{direction.upper()} closed @ ${exit_price:.2f}  PnL {sign}${pnl:.2f} ({pnl_pct*100:.2f}%)  [{reason.upper()}]"
    return log_event("exit", msg, {
        "direction": direction,
        "symbol": symbol,
        "timeframe": timeframe,
        "entry_price": entry_price,
        "exit_price": exit_price,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
        "equity": equity,
        "exit_reason": reason,
    })


def log_breakeven(symbol: str, entry_price: float) -> bool:
    return log_event("breakeven", f"Stop-loss moved to breakeven @ ${entry_price:.2f}", {
        "symbol": symbol, "entry_price": entry_price,
    })


def log_info(message: str) -> bool:
    return log_event("info", message)


def log_error(message: str) -> bool:
    return log_event("error", message)
