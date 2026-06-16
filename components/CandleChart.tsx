"use client";
import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

export interface Candle {
  t: number; // unix ms
  o: string | number;
  h: string | number;
  l: string | number;
  c: string | number;
  v: string | number;
}

export interface SignalMarker {
  time: number;       // unix ms
  direction: "long" | "short";
  type: string;       // e.g. "Entry", "Exit TP", "Exit SL"
  price: number;
}

export interface MAPoint { time: number; value: number; }
export interface HighlightTrade { entryTime: number; exitTime: number; direction: "long" | "short"; }

interface Props {
  candles: Candle[];
  signals?: SignalMarker[];
  maLine?: MAPoint[];
  maLabel?: string;
  height?: number;
  highlightTrade?: HighlightTrade | null;
}

export default function CandleChart({ candles, signals = [], maLine, maLabel = "200 MA", height = 500, highlightTrade }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HighlightTrade | null>(null);
  const updateOverlayFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0d1321" },
        textColor: "#64748b",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e2a3a" },
        horzLines: { color: "#1e2a3a" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3b82f6", labelBackgroundColor: "#3b82f6" },
        horzLine: { color: "#3b82f6", labelBackgroundColor: "#3b82f6" },
      },
      rightPriceScale: {
        borderColor: "#1e2a3a",
        textColor: "#64748b",
      },
      timeScale: {
        borderColor: "#1e2a3a",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      width:  containerRef.current.clientWidth,
      height,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:          "#10b981",
      downColor:        "#ef4444",
      borderUpColor:    "#10b981",
      borderDownColor:  "#ef4444",
      wickUpColor:      "#10b981",
      wickDownColor:    "#ef4444",
    });

    // Convert Hyperliquid candles → lightweight-charts format
    const data: CandlestickData[] = candles
      .map(c => ({
        time: Math.floor(c.t / 1000) as Time,
        open:  Number(c.o),
        high:  Number(c.h),
        low:   Number(c.l),
        close: Number(c.c),
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    series.setData(data);

    // 200-day MA line
    if (maLine && maLine.length > 0) {
      const maSeries = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: maLabel,
      });
      const maData: LineData[] = maLine
        .map(p => ({ time: Math.floor(p.time / 1000) as Time, value: p.value }))
        .sort((a, b) => (a.time as number) - (b.time as number));
      maSeries.setData(maData);
    }

    // Add signal markers
    if (signals.length > 0) {
      const markers: SeriesMarker<Time>[] = signals
        .map(s => {
          const isLong  = s.direction === "long";
          const isEntry = s.type.toLowerCase().includes("entry");
          const isTP    = s.type.toLowerCase().includes("tp");
          const isSL    = s.type.toLowerCase().includes("sl");

          return {
            time:     Math.floor(s.time / 1000) as Time,
            position: isLong ? "belowBar" : "aboveBar",
            color:    isEntry
              ? (isLong ? "#10b981" : "#ef4444")
              : isTP ? "#3b82f6" : "#f59e0b",
            shape: isEntry
              ? (isLong ? "arrowUp" : "arrowDown")
              : "circle",
            text: s.type,
            size: isEntry ? 2 : 1,
          } as SeriesMarker<Time>;
        })
        .sort((a, b) => (a.time as number) - (b.time as number));

      createSeriesMarkers(series, markers);
    }

    chart.timeScale().fitContent();

    // Highlight selected trade
    if (highlightTrade) {
      const pad = 15 * 86400; // 15-day padding in seconds
      chartRef.current?.timeScale().setVisibleRange({
        from: (Math.floor(highlightTrade.entryTime / 1000) - pad) as Time,
        to:   (Math.floor(highlightTrade.exitTime  / 1000) + pad) as Time,
      });
    }

    // Keep the glow box positioned over the trade's time window as the chart scrolls/zooms
    const updateOverlay = () => {
      const trade = highlightRef.current;
      const ov = overlayRef.current;
      if (!ov) return;
      if (!trade || !chartRef.current) { ov.style.opacity = "0"; return; }
      const ts = chartRef.current.timeScale();
      const x1 = ts.timeToCoordinate(Math.floor(trade.entryTime / 1000) as Time);
      const x2 = ts.timeToCoordinate(Math.floor(trade.exitTime  / 1000) as Time);
      if (x1 === null || x2 === null) { ov.style.opacity = "0"; return; }
      const left  = Math.min(x1, x2);
      const width = Math.max(Math.abs(x2 - x1), 3);
      ov.style.opacity = "1";
      ov.style.left  = `${left}px`;
      ov.style.width = `${width}px`;
    };
    const onRangeChange = () => requestAnimationFrame(updateOverlay);
    updateOverlay();
    chart.timeScale().subscribeVisibleTimeRangeChange(onRangeChange);

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
        requestAnimationFrame(updateOverlay);
      }
    });
    ro.observe(containerRef.current);

    chartRef.current      = chart;
    seriesRef.current     = series;
    updateOverlayFnRef.current = updateOverlay;

    return () => {
      ro.disconnect();
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRangeChange);
      chart.remove();
    };
  }, [candles, signals, height]);

  // Zoom to highlighted trade + reposition the glow overlay without re-building the chart
  useEffect(() => {
    highlightRef.current = highlightTrade ?? null;
    if (!chartRef.current) return;
    if (highlightTrade) {
      const pad = 15 * 86400;
      chartRef.current.timeScale().setVisibleRange({
        from: (Math.floor(highlightTrade.entryTime / 1000) - pad) as Time,
        to:   (Math.floor(highlightTrade.exitTime  / 1000) + pad) as Time,
      });
    }
    // setVisibleRange needs a frame to apply before coordinates are valid
    requestAnimationFrame(() => updateOverlayFnRef.current?.());
    requestAnimationFrame(() => requestAnimationFrame(() => updateOverlayFnRef.current?.()));
  }, [highlightTrade]);

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: 8 }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height, borderRadius: 8, overflow: "hidden" }}
      />
      <div
        ref={overlayRef}
        style={{
          opacity: 0,
          position: "absolute",
          top: 0,
          bottom: 0,
          pointerEvents: "none",
          background: "rgba(239,68,68,.22)",
          borderLeft: "3px solid #ef4444",
          borderRight: "3px solid #ef4444",
          transition: "opacity .15s",
          animation: "chartTradeGlow 1.4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes chartTradeGlow {
          0%, 100% { box-shadow: inset 0 0 22px rgba(239,68,68,.35); background: rgba(239,68,68,.18); }
          50%      { box-shadow: inset 0 0 40px rgba(239,68,68,.6);  background: rgba(239,68,68,.30); }
        }
      `}</style>
    </div>
  );
}
