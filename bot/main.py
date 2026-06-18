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
    trades, signals = run(data)
    stats  = generate(trades, initial_capital=INITIAL_CAPITAL)
    print(f"  Signals found: {len(signals)}")

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
            "signals": signals,
            "trades": [
                {
                    "direction":   t.direction,
                    "entry_price": t.entry_price,
                    "exit_price":  t.exit_price,
                    "entry_time":  t.entry_time.isoformat() if hasattr(t.entry_time, "isoformat") else str(t.entry_time),
                    "exit_time":   t.exit_time.isoformat()  if hasattr(t.exit_time,  "isoformat") else str(t.exit_time),
                    "exit_reason": t.exit_reason,
                    "pnl":         round(t.pnl(), 2),
                    "size":        round(t.size, 6),
                    "sl_price":    t.sl_price,
                    "tp_price":    t.tp_price,
                }
                for t in trades
            ],
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
    import time, json, urllib.request, datetime
    from data.fetcher import fetch_all
    from analysis.structure import compute_structure
    from analysis.trend import get_bias
    from analysis.mtf import is_aligned
    from analysis.entry import find_entry
    from risk.manager import open_trade as make_trade
    from broker.hyperliquid import HyperliquidBroker
    from config import (SYMBOL, EMA_PERIOD, TF_WEEKLY, TF_DAILY, TF_4H, TF_1H,
                        DASHBOARD_URL, BOT_SECRET, INITIAL_CAPITAL)

    symbol = args.symbol

    print(f"\n{'='*55}")
    print(f"  BTCUSD Structure Bot — Paper Trading (Testnet)")
    print(f"  Symbol: {symbol}  |  Same strategy as backtest")
    print(f"  Checking every 5 min, acting on 1H candle closes")
    print(f"{'='*55}\n")

    broker = HyperliquidBroker(testnet=True)
    balance = broker.get_balance()
    print(f"Testnet balance: ${balance:,.2f} USDC")
    log_info(f"Paper trading started — {symbol} — balance ${balance:,.2f}")

    def post_event(kind: str, message: str, extra: dict = {}):
        try:
            payload = json.dumps({
                "ts": datetime.datetime.utcnow().isoformat() + "Z",
                "kind": kind, "message": message, **extra,
            }).encode()
            req = urllib.request.Request(
                f"{DASHBOARD_URL.rstrip('/')}/api/events",
                data=payload,
                headers={"Content-Type": "application/json", "x-bot-secret": BOT_SECRET},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            print(f"  [dashboard] {e}")

    last_candle_time = None   # track last 1H candle we acted on

    while True:
        try:
            # Fetch live candles for all timeframes
            data = fetch_all(symbol, limit=300, testnet=True)
            df_1h = data[TF_1H]
            df_d  = data[TF_DAILY]

            # Only act once per 1H candle (compare last closed candle time)
            latest_1h_ts = df_1h.index[-2]   # -2 = last completed candle
            if latest_1h_ts == last_candle_time:
                time.sleep(300)   # check again in 5 min
                continue
            last_candle_time = latest_1h_ts

            i = len(df_1h) - 2   # index of last completed candle
            candle = df_1h.iloc[i]
            ts     = df_1h.index[i]

            # Daily EMA bias
            idx_d   = len(df_d) - 1
            ema_bias = get_bias(df_d.iloc[:idx_d + 1], EMA_PERIOD)
            if ema_bias == "neutral":
                print(f"  [{ts.strftime('%Y-%m-%d %H:%M')}] EMA neutral — skip")
                time.sleep(300)
                continue

            # MTF alignment
            from analysis.structure import compute_structure
            states_w  = compute_structure(data[TF_WEEKLY])
            states_d  = compute_structure(df_d)
            states_4h = compute_structure(data[TF_4H])

            def _nearest(df, target_ts):
                mask = df.index <= target_ts
                return int(mask.values.nonzero()[0][-1]) if mask.any() else 0

            structures = {
                TF_WEEKLY: states_w,
                TF_DAILY:  states_d,
                TF_4H:     states_4h,
            }
            indices = {
                TF_WEEKLY: _nearest(data[TF_WEEKLY], ts),
                TF_DAILY:  _nearest(df_d, ts),
                TF_4H:     _nearest(data[TF_4H], ts),
            }

            direction = "bullish" if ema_bias == "long" else "bearish"
            if not is_aligned(structures, indices, direction, ema_bias):
                print(f"  [{ts.strftime('%Y-%m-%d %H:%M')}] MTF not aligned ({direction}) — skip")
                time.sleep(300)
                continue

            # Check open position — if already in a trade, skip entry
            position = broker.get_position()
            if position:
                pnl = position["unrealized_pnl"]
                print(f"  [{ts.strftime('%Y-%m-%d %H:%M')}] In {position['direction']} trade — uPnL ${pnl:+.2f}")
                post_event("info", f"In {position['direction']} @ ${position['entry_price']:,.0f} — uPnL ${pnl:+.2f}")
                time.sleep(300)
                continue

            # Check 1H entry signal
            states_1h = compute_structure(df_1h)
            signal = find_entry(df_1h, states_1h[i], direction, i)
            if signal is None:
                print(f"  [{ts.strftime('%Y-%m-%d %H:%M')}] No entry signal")
                time.sleep(300)
                continue

            # Size position
            balance = broker.get_balance()
            state_1h = states_1h[i]
            structural_level = state_1h.active_hl if direction == "bullish" else state_1h.active_lh
            trade = make_trade(
                direction=signal["direction"],
                entry_price=signal["entry_price"],
                entry_time=signal["timestamp"],
                account_balance=balance,
                structural_level=structural_level,
            )

            # Place order on testnet
            print(f"  [{ts.strftime('%Y-%m-%d %H:%M')}] SIGNAL {signal['direction'].upper()} @ ${trade.entry_price:,.0f}  SL ${trade.sl_price:,.0f}  TP ${trade.tp_price:,.0f}  size {trade.size:.4f}")
            result = broker.place_order(
                direction=trade.direction,
                size=round(trade.size, 4),
                sl_price=round(trade.sl_price, 0),
                tp_price=round(trade.tp_price, 0),
            )
            msg = f"{signal['direction'].upper()} entry @ ${trade.entry_price:,.0f} | SL ${trade.sl_price:,.0f} | TP ${trade.tp_price:,.0f} | size {trade.size:.4f} BTC"
            print(f"  Order placed: {msg}")
            post_event("entry", msg)
            log_info(f"Paper order: {msg}")

        except KeyboardInterrupt:
            print("\nPaper trading stopped.")
            log_info("Paper trading stopped by user.")
            break
        except Exception as e:
            log_error(f"Paper loop error: {e}")
            print(f"  Error: {e}")
            time.sleep(60)


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
