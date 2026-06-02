"""Backtest report: computes and prints all required stats."""

from __future__ import annotations

import pandas as pd

from config import INITIAL_CAPITAL
from risk.manager import Trade


def generate(trades: list[Trade], initial_capital: float = INITIAL_CAPITAL) -> dict:
    if not trades:
        print("No trades to report.")
        return {}

    equity = initial_capital
    equity_curve = [equity]
    monthly: dict[str, float] = {}
    wins, losses = [], []

    for t in trades:
        pnl = t.pnl(t.exit_price)
        equity += pnl
        equity_curve.append(equity)

        month_key = pd.Timestamp(t.entry_time).strftime("%Y-%m")
        monthly[month_key] = monthly.get(month_key, 0) + pnl

        if pnl > 0:
            wins.append(pnl)
        else:
            losses.append(pnl)

    total = len(trades)
    win_count = len(wins)
    loss_count = len(losses)
    winrate = win_count / total * 100

    avg_win = sum(wins) / win_count if wins else 0
    avg_loss = abs(sum(losses) / loss_count) if losses else 0
    profit_factor = sum(wins) / abs(sum(losses)) if losses else float("inf")

    # Max drawdown
    peak = equity_curve[0]
    max_dd = 0.0
    for e in equity_curve:
        if e > peak:
            peak = e
        dd = (peak - e) / peak
        if dd > max_dd:
            max_dd = dd

    # Longest losing streak
    streak = max_streak = 0
    for t in trades:
        if t.pnl(t.exit_price) < 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    # By timeframe — not tracked per trade yet, placeholder
    longs = [t for t in trades if t.direction == "long"]
    shorts = [t for t in trades if t.direction == "short"]

    stats = {
        "total_trades": total,
        "wins": win_count,
        "losses": loss_count,
        "winrate_pct": round(winrate, 2),
        "profit_factor": round(profit_factor, 3),
        "max_drawdown_pct": round(max_dd * 100, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "largest_losing_streak": max_streak,
        "final_equity": round(equity, 2),
        "net_pnl": round(equity - initial_capital, 2),
        "monthly_returns": monthly,
        "longs_count": len(longs),
        "shorts_count": len(shorts),
        "long_winrate_pct": round(
            len([t for t in longs if t.pnl(t.exit_price) > 0]) / len(longs) * 100, 2
        ) if longs else 0,
        "short_winrate_pct": round(
            len([t for t in shorts if t.pnl(t.exit_price) > 0]) / len(shorts) * 100, 2
        ) if shorts else 0,
    }

    _print(stats)
    return stats


def _print(s: dict) -> None:
    print("\n" + "=" * 52)
    print("  BACKTEST REPORT")
    print("=" * 52)
    print(f"  Total trades         : {s['total_trades']}")
    print(f"  Win rate             : {s['winrate_pct']}%")
    print(f"  Profit factor        : {s['profit_factor']}")
    print(f"  Max drawdown         : {s['max_drawdown_pct']}%")
    print(f"  Avg win              : ${s['avg_win']}")
    print(f"  Avg loss             : ${s['avg_loss']}")
    print(f"  Largest losing streak: {s['largest_losing_streak']}")
    print(f"  Longs  | count={s['longs_count']}  winrate={s['long_winrate_pct']}%")
    print(f"  Shorts | count={s['shorts_count']}  winrate={s['short_winrate_pct']}%")
    print(f"  Net P&L              : ${s['net_pnl']}")
    print(f"  Final equity         : ${s['final_equity']}")
    print("-" * 52)
    print("  Monthly returns:")
    for month, pnl in sorted(s["monthly_returns"].items()):
        sign = "+" if pnl >= 0 else ""
        print(f"    {month}  {sign}${round(pnl, 2)}")
    print("=" * 52 + "\n")
