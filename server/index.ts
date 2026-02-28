import "dotenv/config";

import cors from "cors";
import express from "express";

import {
  buildTradingViewHistoryUrl,
  getServerConfig,
  type PriceBoardAssetConfig,
} from "./config.js";

type TradingViewHistoryResponse = {
  s: "ok" | "error" | "no_data";
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
  errmsg?: string;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type HistoricalResolution = {
  date: string;
  label: string;
  targetPrice: number;
  settlePrice: number;
  high: number;
  low: number;
  outcome: "UP" | "DOWN" | "FLAT";
  deltaPct: number;
};

type PriceBoardMarket = {
  id: string;
  asset: string;
  displaySymbol: string;
  ticker: string;
  feedId: string;
  accent: string;
  currentPrice: number;
  targetPrice: number;
  highPrice: number;
  lowPrice: number;
  movePct: number;
  moveDirection: "UP" | "DOWN" | "FLAT";
  targetTimestamp: number;
  series: Array<{ time: number; value: number }>;
  historical: HistoricalResolution[];
};

const app = express();
const config = getServerConfig();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    rpcUrl: config.rpcUrl,
  });
});

app.get("/api/price-board", async (_req, res) => {
  try {
    const markets = await Promise.all(config.assets.map(buildPriceBoardMarket));

    res.json({
      generatedAt: new Date().toISOString(),
      markets,
    });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to build the live price board.",
    });
  }
});

app.listen(config.port, () => {
  console.log(
    `Blindside API listening on http://localhost:${config.port} (Monad RPC: ${config.rpcUrl})`,
  );
});

async function buildPriceBoardMarket(
  asset: PriceBoardAssetConfig,
): Promise<PriceBoardMarket> {
  const now = new Date();
  const currentMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const currentMidnightUnix = Math.floor(currentMidnight / 1000);
  const startUnix = currentMidnightUnix - 3 * 24 * 60 * 60;
  const endUnix = Math.floor(Date.now() / 1000);

  const response = await fetch(
    buildTradingViewHistoryUrl(asset.ticker, "5", startUnix, endUnix),
  );

  if (!response.ok) {
    throw new Error(
      `Pyth history responded with ${response.status} for ${asset.displaySymbol}.`,
    );
  }

  const payload = (await response.json()) as TradingViewHistoryResponse;
  if (payload.s !== "ok") {
    throw new Error(
      payload.errmsg || `Pyth returned ${payload.s} for ${asset.displaySymbol}.`,
    );
  }

  const candles = zipCandles(payload);
  const grouped = groupCandlesByUtcDay(candles);
  const dayKeys = [...grouped.keys()].sort();
  const liveDayKey = dayKeys.at(-1);

  if (!liveDayKey) {
    throw new Error(`No live day data returned for ${asset.displaySymbol}.`);
  }

  const liveCandles = grouped.get(liveDayKey) ?? [];
  const firstLive = liveCandles[0];
  const lastLive = liveCandles.at(-1);

  if (!firstLive || !lastLive) {
    throw new Error(`No live candles returned for ${asset.displaySymbol}.`);
  }

  const historical = dayKeys
    .slice(0, -1)
    .slice(-3)
    .map((dayKey) => {
      const dayCandles = grouped.get(dayKey) ?? [];
      const first = dayCandles[0];
      const last = dayCandles.at(-1);

      if (!first || !last) {
        return null;
      }

      const deltaPct = computeDeltaPct(first.open, last.close);

      return {
        date: dayKey,
        label: formatUtcDay(dayKey),
        targetPrice: first.open,
        settlePrice: last.close,
        high: dayCandles.reduce((value, candle) => Math.max(value, candle.high), first.high),
        low: dayCandles.reduce((value, candle) => Math.min(value, candle.low), first.low),
        outcome:
          last.close > first.open
            ? "UP"
            : last.close < first.open
              ? "DOWN"
              : "FLAT",
        deltaPct,
      } satisfies HistoricalResolution;
    })
    .filter((entry): entry is HistoricalResolution => entry !== null);

  return {
    id: asset.id,
    asset: asset.asset,
    displaySymbol: asset.displaySymbol,
    ticker: asset.ticker,
    feedId: asset.feedId,
    accent: asset.accent,
    currentPrice: lastLive.close,
    targetPrice: firstLive.open,
    highPrice: liveCandles.reduce(
      (value, candle) => Math.max(value, candle.high),
      firstLive.high,
    ),
    lowPrice: liveCandles.reduce(
      (value, candle) => Math.min(value, candle.low),
      firstLive.low,
    ),
    movePct: computeDeltaPct(firstLive.open, lastLive.close),
    moveDirection:
      lastLive.close > firstLive.open
        ? "UP"
        : lastLive.close < firstLive.open
          ? "DOWN"
          : "FLAT",
    targetTimestamp: firstLive.time,
    series: liveCandles.map((candle) => ({
      time: candle.time,
      value: candle.close,
    })),
    historical,
  };
}

function zipCandles(payload: TradingViewHistoryResponse): Candle[] {
  const times = payload.t ?? [];
  const opens = payload.o ?? [];
  const highs = payload.h ?? [];
  const lows = payload.l ?? [];
  const closes = payload.c ?? [];

  const size = Math.min(
    times.length,
    opens.length,
    highs.length,
    lows.length,
    closes.length,
  );

  const candles: Candle[] = [];
  for (let index = 0; index < size; index += 1) {
    candles.push({
      time: times[index],
      open: opens[index],
      high: highs[index],
      low: lows[index],
      close: closes[index],
    });
  }

  return candles;
}

function groupCandlesByUtcDay(candles: Candle[]): Map<string, Candle[]> {
  const grouped = new Map<string, Candle[]>();

  for (const candle of candles) {
    const dayKey = new Date(candle.time * 1000).toISOString().slice(0, 10);
    const existing = grouped.get(dayKey);
    if (existing) {
      existing.push(candle);
    } else {
      grouped.set(dayKey, [candle]);
    }
  }

  return grouped;
}

function computeDeltaPct(base: number, value: number): number {
  if (base === 0) {
    return 0;
  }

  return ((value - base) / base) * 100;
}

function formatUtcDay(dayKey: string): string {
  const parsed = new Date(`${dayKey}T00:00:00.000Z`);
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  });
}
