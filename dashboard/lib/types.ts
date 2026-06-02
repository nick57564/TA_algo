export type EventKind =
  | "signal"       // H&S pattern detected
  | "entry"        // trade opened
  | "exit"         // trade closed (sl / tp)
  | "breakeven"    // SL moved to breakeven
  | "info"         // general bot status
  | "error";       // bot error

export interface BotEvent {
  id: string;
  ts: string;          // ISO timestamp
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
