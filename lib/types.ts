export type EventKind = "entry" | "exit" | "signal" | "info" | "error";

export interface BotEvent {
  kind: EventKind;
  message: string;
  ts: string;
  data?: Record<string, unknown>;
}

export interface Trade {
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time: string;
  exit_reason: "tp" | "sl" | "be" | "eod" | "end_of_data" | "manual";
  entry_reason?: string;
  analysis?: string;
  pnl: number;
  size: number;
  sl_price: number;
  tp_price: number;
}

export interface Signal {
  timestamp: string;
  timeframe: string;
  direction: "long" | "short";
  type: string;
  price: number;
  retest_level?: number;
  mtf_alignment?: string;
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
  net_pnl: number;
  final_equity: number;
  avg_win: number;
  avg_loss: number;
  max_drawdown_pct: number;
  largest_losing_streak: number;
  longs_count: number;
  shorts_count: number;
  long_winrate_pct: number;
  short_winrate_pct: number;
  monthly_returns: Record<string, number>;
  equity_curve: number[];
  trades?: Trade[];
  signals?: Signal[];
}

export interface AccountState {
  balance: number;
  equity: number;
  unrealized_pnl: number;
  position?: {
    direction: "long" | "short";
    size: number;
    entry_price: number;
    unrealized_pnl: number;
    liquidation_price?: number;
  } | null;
  mode: "testnet" | "mainnet";
}
