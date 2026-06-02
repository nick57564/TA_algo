"""Entry point: fetch data, run backtest, print report."""

import argparse

from data.engine import fetch_all
from backtest.engine import run
from backtest.report import generate
from config import INITIAL_CAPITAL


def main():
    parser = argparse.ArgumentParser(description="BTC H&S Algo Backtest")
    parser.add_argument(
        "--tf",
        default="4h",
        choices=["1h", "4h"],
        help="Signal timeframe for H&S detection (default: 4h)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Number of candles to fetch per timeframe (default: 500)",
    )
    args = parser.parse_args()

    print(f"Fetching BTCUSD data ({args.limit} candles per timeframe)...")
    data = fetch_all(limit=args.limit)
    for tf, df in data.items():
        print(f"  {tf}: {len(df)} candles  ({df.index[0].date()} → {df.index[-1].date()})")

    print(f"\nRunning backtest on {args.tf} signal timeframe...")
    trades = run(data, signal_tf=args.tf)

    print(f"Closed trades found: {len(trades)}")
    generate(trades, initial_capital=INITIAL_CAPITAL)


if __name__ == "__main__":
    main()
