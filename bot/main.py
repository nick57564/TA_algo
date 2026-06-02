"""Main entry point for the TA Algo trading bot.

Usage:
    python main.py --mode backtest --symbol BTC/USDT --tf 4h --limit 500
    python main.py --mode paper    --symbol ETH/USDT --tf 1h
    python main.py --mode live     --symbol BTC/USDT --tf 4h --broker ib
"""

import argparse
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from data.engine import fetch_all
from backtest.engine import run
from backtest.report import generate
from config import INITIAL_CAPITAL
from logger import log_info, log_error


def parse_args():
    p = argparse.ArgumentParser(description="TA Algo — H&S Trading Bot")
    p.add_argument("--mode",   default="backtest", choices=["backtest", "paper", "live"])
    p.add_argument("--symbol", default="BTC/USDT",  help="Trading symbol (e.g. BTC/USDT, ETH/USDT)")
    p.add_argument("--tf",     default="4h",        choices=["1h", "4h", "1d", "1w"])
    p.add_argument("--limit",  default=500, type=int, help="Candles to fetch")
    p.add_argument("--broker", default="none",       choices=["none", "ib"])
    p.add_argument("--ib-host", default="127.0.0.1")
    p.add_argument("--ib-port", default=7497, type=int)
    return p.parse_args()


def run_backtest(args):
    log_info(f"Backtest starting — {args.symbol} {args.tf.upper()} ({args.limit} candles)")
    print(f"\n📊 Fetching {args.symbol} data ({args.limit} candles per timeframe)…")

    try:
        data = fetch_all(symbol=args.symbol, limit=args.limit)
    except Exception as e:
        log_error(f"Data fetch failed: {e}")
        print(f"Error fetching data: {e}")
        return

    for tf, df in data.items():
        print(f"  {tf}: {len(df)} candles  {df.index[0].date()} → {df.index[-1].date()}")

    print(f"\n🔍 Running H&S backtest on {args.tf} timeframe…")
    trades = run(data, signal_tf=args.tf)
    stats  = generate(trades, initial_capital=INITIAL_CAPITAL)

    # Push results to dashboard
    if stats:
        from logger import _post
        _post({
            "kind": "info",
            "message": f"Backtest complete — {stats['total_trades']} trades, {stats['winrate_pct']}% win rate",
        })
        # Push backtest result to /api/backtest
        import json, urllib.request
        dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000")
        bot_secret    = os.getenv("BOT_SECRET", "")
        result_payload = {
            "ts": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "symbol": args.symbol,
            "timeframe": args.tf,
            "equity_curve": [INITIAL_CAPITAL] + [INITIAL_CAPITAL + sum(
                t.pnl(t.exit_price) for t in trades[:i+1]
            ) for i in range(len(trades))],
            **stats,
        }
        try:
            data_bytes = json.dumps(result_payload).encode()
            req = urllib.request.Request(
                f"{dashboard_url.rstrip('/')}/api/backtest",
                data=data_bytes,
                headers={"Content-Type": "application/json", "x-bot-secret": bot_secret},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
            print("\n✅ Results sent to dashboard")
        except Exception as e:
            print(f"⚠ Could not send to dashboard: {e}")


def run_paper(args):
    from broker.paper_broker import PaperBroker
    print(f"\n📄 Paper trading — {args.symbol} {args.tf.upper()}")
    log_info(f"Paper trading started — {args.symbol} {args.tf.upper()}")
    broker = PaperBroker(symbol=args.symbol, timeframe=args.tf)
    broker.run()


def run_live(args):
    if args.broker == "ib":
        from broker.ib_connector import IBConnector
        print(f"\n⚡ Live trading via Interactive Brokers — {args.symbol} {args.tf.upper()}")
        log_info(f"Live IB trading started — {args.symbol} {args.tf.upper()}")
        connector = IBConnector(
            host=args.ib_host, port=args.ib_port,
            symbol=args.symbol, timeframe=args.tf,
        )
        connector.run()
    else:
        print("Live mode requires --broker ib")
        sys.exit(1)


if __name__ == "__main__":
    args = parse_args()
    print(f"\n{'='*50}")
    print(f"  TA Algo — H&S Strategy")
    print(f"  Mode: {args.mode.upper()} | Symbol: {args.symbol} | TF: {args.tf.upper()}")
    print(f"{'='*50}\n")

    if args.mode == "backtest":
        run_backtest(args)
    elif args.mode == "paper":
        run_paper(args)
    elif args.mode == "live":
        run_live(args)
