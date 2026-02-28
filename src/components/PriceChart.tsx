import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

type ChartPoint = {
  time: number;
  value: number;
};

export function PriceChart({
  data,
  targetPrice,
  accent,
  height,
}: {
  data: ChartPoint[];
  targetPrice: number;
  accent: string;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? "#12171c" : "#fafafa",
        },
        textColor: isDark ? "#aeb8c5" : "#6b7280",
        fontFamily: "IBM Plex Sans, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1c232b" : "#eef1f4" },
        horzLines: { color: isDark ? "#1c232b" : "#eef1f4" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      leftPriceScale: {
        visible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(LineSeries, {
      color: accent,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth) {
        chart.applyOptions({ width: Math.floor(nextWidth) });
        chart.timeScale().fitContent();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
    };
  }, [accent, height]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      return;
    }

    series.setData(
      data.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    );
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }

    if (Number.isFinite(targetPrice)) {
      priceLineRef.current = series.createPriceLine({
        price: targetPrice,
        color: "#6b7280",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Target 00:00",
      });
    }

    chart.timeScale().fitContent();
  }, [data, targetPrice]);

  return <div className="price-chart" ref={containerRef} />;
}
