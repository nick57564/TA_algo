"""
BTCUSD Structure Bot — Hyperliquid

Usage:
  python main.py --mode backtest
  python main.py --mode paper
  python main.py --mode live
"""

import argparse
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from data.fetcher import fetch_all
from backtest.engine import run
from backtest.report import generate
from logger import log_info, log_error
from config import SYMBOL, INITIAL_CAPITAL, HYPERLIQUID_TESTNET


def parse_args():
    p = argparse.ArgumentParser(description="BTCUSD Structure Bot — Hyperliquid")
    p.add_argument("--mode",   default="backtest", choices=["backtest", "paper", "live"])
    p.add_argument("--symbol", default=SYMBOL)
    p.add_argument("--limit",  default=500, type=int, help="Candles per timeframe")
    p.add_argument("--testnet", action="store_true", default=HYPERLIQUID_TESTNET)
    return p.parse_args()


def run_backtest(args):
    print(f"\n{'='*55}")
    print(f"  BTCUSD Structure Bot — Backtest")
    print(f"  Symbol: {args.symbol}  |  Candles: {args.limit}")
    print(f"  Exchange: Hyperliquid {'TESTNET' if args.testnet else 'MAINNET'}")
    print(f"{'='*55}\n")

    log_info(f"Backtest starting — {args.symbol} ({args.limit} candles)")

    print("Fetching candles from Hyperliquid…")
    try:
        data = fetch_all(args.symbol, limit=args.limit, testnet=args.testnet)
    except Exception as e:
        log_error(f"Data fetch failed: {e}")
        print(f"Error: {e}")
        return

    for tf, df in data.items():
        print(f"  {tf:4s}: {len(df)} candles  {df.index[0].date()} → {df.index[-1].date()}")

    print("\nRunning strategy…")
    trades = run(data)
    stats  = generate(trades, initial_capital=INITIAL_CAPITAL)

    if not stats:
        return

    # Push results to dashboard
    try:
        import json, urllib.request, datetime
        from config import DASHBOARD_URL, BOT_SECRET
        payload = {
            "ts": datetime.datetime.utcnow().isoformat() + "Z",
            "symbol": args.symbol,
            "timeframe": "multi",
            **stats,
        }
        data_bytes = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"{DASHBOARD_URL.rstrip('/')}/api/backtest",
            data=data_bytes,
            headers={"Content-Type": "application/json", "x-bot-secret": BOT_SECRET},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
        print("Results sent to dashboard.")
    except Exception as e:
        print(f"Could not send to dashboard: {e}")


def run_paper(args):
    print(f"\nPaper trading mode — coming in Phase 2")
    print("Run backtest first to validate the strategy.")


def run_live(args):
    print(f"\nLive trading mode")
    print("WARNING: This uses real money. Make sure paper trading is validated first.")
    from broker.hyperliquid import HyperliquidBroker
    broker = HyperliquidBroker(testnet=False)
    balance = broker.get_balance()
    print(f"Account balance: ${balance:,.2f} USDC")
    # Live loop — Phase 3


if __name__ == "__main__":
    args = parse_args()
    if args.mode == "backtest":
        run_backtest(args)
    elif args.mode == "paper":
        run_paper(args)
    elif args.mode == "live":
        run_live(args)
