export type EventKind = "signal" | "entry" | "exit" | "breakeven" | "info" | "error";

export interface BotEvent {
  id: string;
  ts: string;
  kind: EventKind;
  message: string;
  data?: Record<string, unknown>;
}

export interface TradeEvent extends BotEvent {
  kind: "entry" | "exit";
  data: {
    direction: "long" | "short";
    symbol: string;
    timeframe: string;
    entry_price?: number;
    exit_price?: number;
    stop_loss?: number;
    take_profit?: number;
    pnl?: number;
    pnl_pct?: number;
    exit_reason?: "sl" | "tp" | "manual";
    equity?: number;
  };
}

export interface BotConfig {
  symbol: string;
  timeframe: string;
  mode: "backtest" | "paper" | "live";
  risk_pct: number;
  sl_pct: number;
  tp_pct: number;
  broker: "none" | "ib";
  ib_host: string;
  ib_port: number;
}

export interface BacktestResult {
  ts: string;
  symbol: string;
  timeframe: string;
  total_trades: number;
  wins: number;
  losses: number;
  winrate_pct: number;
  profit_factor: number;
  max_drawdown_pct: number;
  avg_win: number;
  avg_loss: number;
  largest_losing_streak: number;
  net_pnl: number;
  final_equity: number;
  longs_count: number;
  shorts_count: number;
  long_winrate_pct: number;
  short_winrate_pct: number;
  monthly_returns: Record<string, number>;
  equity_curve: number[];
}

export interface BotStatus {
  running: boolean;
  mode: "backtest" | "paper" | "live" | "idle";
  symbol: string;
  timeframe: string;
  broker_connected: boolean;
  broker: string;
  open_position: null | {
    direction: string;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    entry_time: string;
  };
  last_heartbeat: string | null;
}

export const DEFAULT_CONFIG: BotConfig = {
  symbol: "BTC/USDT",
  timeframe: "4h",
  mode: "backtest",
  risk_pct: 1,
  sl_pct: 1,
  tp_pct: 3,
  broker: "none",
  ib_host: "127.0.0.1",
  ib_port: 7497,
};
