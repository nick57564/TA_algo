"""Generate backtest statistics from a list of trades."""

from risk.manager import Trade
from config import INITIAL_CAPITAL


def generate(trades: list[Trade], initial_capital: float = INITIAL_CAPITAL) -> dict:
    if not trades:
        print("\nNo trades found in backtest.")
        return {}

    wins   = [t for t in trades if t.pnl() > 0]
    losses = [t for t in trades if t.pnl() <= 0]
    longs  = [t for t in trades if t.direction == "long"]
    shorts = [t for t in trades if t.direction == "short"]

    total   = len(trades)
    win_pct = len(wins) / total * 100

    gross_profit = sum(t.pnl() for t in wins)
    gross_loss   = abs(sum(t.pnl() for t in losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    net_pnl      = sum(t.pnl() for t in trades)
    final_equity = initial_capital + net_pnl

    avg_win  = gross_profit / len(wins)  if wins   else 0
    avg_loss = gross_loss   / len(losses) if losses else 0

    # Max drawdown
    equity = initial_capital
    peak   = initial_capital
    max_dd = 0.0
    equity_curve = [initial_capital]
    for t in trades:
        equity += t.pnl()
        equity_curve.append(equity)
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak * 100
        if dd > max_dd:
            max_dd = dd

    # Longest losing streak
    streak = max_streak = 0
    for t in trades:
        if t.pnl() <= 0:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 0

    # Monthly returns
    monthly: dict[str, float] = {}
    for t in trades:
        if t.exit_time:
            key = t.exit_time.strftime("%Y-%m")
            monthly[key] = monthly.get(key, 0) + t.pnl()

    stats = {
        "total_trades": total,
        "wins": len(wins),
        "losses": len(losses),
        "winrate_pct": round(win_pct, 1),
        "profit_factor": round(profit_factor, 2),
        "net_pnl": round(net_pnl, 2),
        "final_equity": round(final_equity, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "largest_losing_streak": max_streak,
        "longs_count": len(longs),
        "shorts_count": len(shorts),
        "long_winrate_pct":  round(len([t for t in longs  if t.pnl() > 0]) / len(longs)  * 100, 1) if longs  else 0,
        "short_winrate_pct": round(len([t for t in shorts if t.pnl() > 0]) / len(shorts) * 100, 1) if shorts else 0,
        "monthly_returns": monthly,
        "equity_curve": equity_curve,
    }

    # Print summary
    print(f"\n{'='*55}")
    print(f"  BACKTEST RESULTS — BTCUSD Structure Bot")
    print(f"{'='*55}")
    print(f"  Trades      : {total}  ({len(wins)}W / {len(losses)}L)")
    print(f"  Win rate    : {win_pct:.1f}%")
    print(f"  Profit factor: {profit_factor:.2f}")
    print(f"  Net P&L     : ${net_pnl:,.2f}")
    print(f"  Final equity: ${final_equity:,.2f}")
    print(f"  Max drawdown: {max_dd:.2f}%")
    print(f"  Avg win     : ${avg_win:.2f}   Avg loss: ${avg_loss:.2f}")
    print(f"  Longs  {len(longs)} trades  win rate {stats['long_winrate_pct']}%")
    print(f"  Shorts {len(shorts)} trades  win rate {stats['short_winrate_pct']}%")
    if monthly:
        print(f"\n  Monthly returns:")
        for month, pnl in sorted(monthly.items()):
            bar = "█" * int(abs(pnl) / 50) if pnl != 0 else ""
            sign = "+" if pnl >= 0 else ""
            print(f"    {month}  {sign}${pnl:,.0f}  {bar}")
    print(f"{'='*55}\n")

    return stats
