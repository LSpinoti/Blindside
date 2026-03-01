import "dotenv/config";

import cors from "cors";
import express from "express";
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

import {
  buildTradingViewHistoryUrl,
  getServerConfig,
  type PriceBoardAssetConfig,
} from "./config.js";
import { startDemoLiquidityService } from "./demoLiquidity.js";

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

type PythTimedResponse = {
  binary: {
    data: string[];
  };
  parsed: Array<{
    price: {
      price: string;
      expo: number;
      publish_time: number;
    };
  }>;
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
  contractAddress: string;
  question: string;
  strikeE8: number;
  cutoffTime: number;
  pythAddress: string;
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
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(config.rpcUrl),
});
const marketStateAbi = parseAbi([
  "function cutoffTime() view returns (uint64)",
  "function resolve(bytes[] updateData) payable",
]);
const pythAbi = parseAbi([
  "function getUpdateFee(bytes[] updateData) view returns (uint256)",
]);
const settlingMarkets = new Set<string>();
const demoLiquidityEnabled =
  process.env.BLINDSIDE_ENABLE_DEMO_LIQUIDITY !== "0";
const CUTOFF_CACHE_MS = 5_000;
const cutoffCache = new Map<string, { value: number; expiresAt: number }>();

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
    const cutoffTimes = await readLiveMarketCutoffs(config.assets);
    const markets = await Promise.all(
      config.assets.map((asset) =>
        buildPriceBoardMarket(asset, cutoffTimes.get(asset.id) ?? null),
      ),
    );

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

startAutoResolver();

if (demoLiquidityEnabled) {
  startDemoLiquidityService(config);
} else {
  console.log("Blindside demo liquidity disabled (BLINDSIDE_ENABLE_DEMO_LIQUIDITY=0).");
}

async function buildPriceBoardMarket(
  asset: PriceBoardAssetConfig,
  liveCutoffTime: number | null,
): Promise<PriceBoardMarket> {
  const nowUnix = Math.floor(Date.now() / 1000);
  const currentHourUnix = Math.floor(nowUnix / 3600) * 3600;
  const startUnix = currentHourUnix - 8 * 60 * 60;
  const cutoffTime = liveCutoffTime ?? nextHourlyCutoff(nowUnix);
  const strikeTimestamp = cutoffTime - 60 * 60;

  const [payload, strikePrice] = await Promise.all([
    fetchTradingViewHistory(asset, startUnix, nowUnix),
    fetchTimedPythPrice(asset, strikeTimestamp),
  ]);

  const candles = zipCandles(payload);
  const grouped = groupCandlesByUtcHour(candles);
  const hourKeys = [...grouped.keys()].sort();
  const liveHourKey = hourKeys.at(-1);

  if (!liveHourKey) {
    throw new Error(`No live hour data returned for ${asset.displaySymbol}.`);
  }

  const liveCandles = grouped.get(liveHourKey) ?? [];
  const firstLive = liveCandles[0];
  const lastLive = liveCandles.at(-1);

  if (!firstLive || !lastLive) {
    throw new Error(`No live candles returned for ${asset.displaySymbol}.`);
  }

  const historical = hourKeys
    .slice(0, -1)
    .slice(-3)
    .map((hourKey) => {
      const hourCandles = grouped.get(hourKey) ?? [];
      const first = hourCandles[0];
      const last = hourCandles.at(-1);

      if (!first || !last) {
        return null;
      }

      const deltaPct = computeDeltaPct(first.open, last.close);

      return {
        date: `${hourKey}:00:00.000Z`,
        targetPrice: first.open,
        settlePrice: last.close,
        high: hourCandles.reduce((value, candle) => Math.max(value, candle.high), first.high),
        low: hourCandles.reduce((value, candle) => Math.min(value, candle.low), first.low),
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
    contractAddress: asset.contractAddress,
    question: asset.question,
    strikeE8: Math.round(strikePrice * 1e8),
    cutoffTime,
    pythAddress: asset.pythAddress,
    currentPrice: lastLive.close,
    targetPrice: strikePrice,
    highPrice: liveCandles.reduce(
      (value, candle) => Math.max(value, candle.high),
      firstLive.high,
    ),
    lowPrice: liveCandles.reduce(
      (value, candle) => Math.min(value, candle.low),
      firstLive.low,
    ),
    movePct: computeDeltaPct(strikePrice, lastLive.close),
    moveDirection:
      lastLive.close > strikePrice
        ? "UP"
        : lastLive.close < strikePrice
          ? "DOWN"
          : "FLAT",
    targetTimestamp: strikeTimestamp,
    series: liveCandles.map((candle) => ({
      time: candle.time,
      value: candle.close,
    })),
    historical,
  };
}

async function fetchTradingViewHistory(
  asset: PriceBoardAssetConfig,
  startUnix: number,
  endUnix: number,
): Promise<TradingViewHistoryResponse> {
  const response = await fetch(
    buildTradingViewHistoryUrl(asset.ticker, "1", startUnix, endUnix),
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

  return payload;
}

async function readLiveMarketCutoffs(
  assets: PriceBoardAssetConfig[],
): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  const nowMs = Date.now();
  const uncachedAssets: PriceBoardAssetConfig[] = [];

  for (const asset of assets) {
    if (!isLiveContractAddress(asset.contractAddress)) {
      results.set(asset.id, null);
      continue;
    }

    const cacheKey = asset.contractAddress.toLowerCase();
    const cached = cutoffCache.get(cacheKey);

    if (cached && cached.expiresAt > nowMs) {
      results.set(asset.id, cached.value);
      continue;
    }

    uncachedAssets.push(asset);
  }

  if (uncachedAssets.length === 0) {
    return results;
  }

  try {
    const calls = uncachedAssets.map((asset) => ({
      address: asset.contractAddress as `0x${string}`,
      abi: marketStateAbi,
      functionName: "cutoffTime" as const,
    }));
    const response = await publicClient.multicall({
      allowFailure: true,
      contracts: calls,
    });

    response.forEach((entry, index) => {
      const asset = uncachedAssets[index];

      if (entry.status !== "success") {
        results.set(asset.id, null);
        return;
      }

      const cutoffTime = Number(entry.result);
      results.set(asset.id, cutoffTime);
      cutoffCache.set(asset.contractAddress.toLowerCase(), {
        value: cutoffTime,
        expiresAt: nowMs + CUTOFF_CACHE_MS,
      });
    });
  } catch {
    for (const asset of uncachedAssets) {
      results.set(asset.id, null);
    }
  }

  return results;
}

async function fetchTimedPythPrice(
  asset: PriceBoardAssetConfig,
  publishTime: number,
): Promise<number> {
  try {
    const payload = await fetchTimedPythPayload(
      asset.hermesUrl,
      asset.feedId,
      publishTime,
    );
    const nextPrice = payload.parsed[0]?.price;
    if (!nextPrice) {
      throw new Error("Missing timed Pyth price.");
    }

    return normalizePythPrice(nextPrice.price, nextPrice.expo);
  } catch {
    const response = await fetchTradingViewHistory(
      asset,
      publishTime,
      publishTime + 15 * 60,
    );
    const candles = zipCandles(response);
    const firstCandle = candles[0];

    if (!firstCandle) {
      throw new Error(`No strike price available for ${asset.displaySymbol}.`);
    }

    return firstCandle.open;
  }
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

function groupCandlesByUtcHour(candles: Candle[]): Map<string, Candle[]> {
  const grouped = new Map<string, Candle[]>();

  for (const candle of candles) {
    const hourKey = new Date(candle.time * 1000).toISOString().slice(0, 13);
    const existing = grouped.get(hourKey);
    if (existing) {
      existing.push(candle);
      continue;
    }

    grouped.set(hourKey, [candle]);
  }

  return grouped;
}

function computeDeltaPct(start: number, end: number): number {
  if (start === 0) {
    return 0;
  }

  return ((end - start) / start) * 100;
}

function normalizePrivateKey(value: string | undefined): Hex | null {
  if (!value) {
    return null;
  }

  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function isLiveContractAddress(value: string): boolean {
  return (
    isAddress(value) &&
    value.toLowerCase() !== "0x0000000000000000000000000000000000000000"
  );
}

function nextHourlyCutoff(referenceUnix: number): number {
  return (Math.floor(referenceUnix / 3600) + 1) * 3600;
}

function startAutoResolver(): void {
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  if (!privateKey) {
    console.log("Blindside auto-resolver disabled (PRIVATE_KEY missing).");
    return;
  }

  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: monadTestnet,
    transport: http(config.rpcUrl),
  });

  const tick = async () => {
    const cutoffTimes = await readLiveMarketCutoffs(config.assets);

    for (const asset of config.assets) {
      if (!isLiveContractAddress(asset.contractAddress)) {
        continue;
      }

      if (settlingMarkets.has(asset.contractAddress)) {
        continue;
      }

      const cutoffTime = cutoffTimes.get(asset.id);
      if (cutoffTime == null) {
        continue;
      }

      try {
        const nowUnix = Math.floor(Date.now() / 1000);
        if (nowUnix < cutoffTime) {
          continue;
        }

        settlingMarkets.add(asset.contractAddress);

        const updateData = await fetchTimedPythUpdate(
          asset.hermesUrl,
          asset.feedId,
          BigInt(cutoffTime),
        );

        const fee = await publicClient.readContract({
          address: asset.pythAddress as `0x${string}`,
          abi: pythAbi,
          functionName: "getUpdateFee",
          args: [updateData],
        });

        const txHash = await walletClient.writeContract({
          address: asset.contractAddress as `0x${string}`,
          abi: marketStateAbi,
          functionName: "resolve",
          args: [updateData],
          value: fee,
        });

        await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        cutoffCache.delete(asset.contractAddress.toLowerCase());

        console.log(
          `Resolved ${asset.displaySymbol} hourly market at cutoff ${cutoffTime} (tx: ${txHash}).`,
        );
      } catch (error) {
        console.error(
          `Auto-resolve failed for ${asset.displaySymbol}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        settlingMarkets.delete(asset.contractAddress);
      }
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, 30_000);
}

async function fetchTimedPythUpdate(
  hermesUrl: string,
  feedId: string,
  cutoffTime: bigint,
): Promise<Hex[]> {
  const payload = await fetchTimedPythPayload(hermesUrl, feedId, cutoffTime);
  return payload.binary.data.map((entry) => `0x${entry}` as Hex);
}

async function fetchTimedPythPayload(
  hermesUrl: string,
  feedId: string,
  publishTime: number | bigint,
): Promise<PythTimedResponse> {
  const payloadUrl = new URL(`/v2/updates/price/${publishTime}`, hermesUrl);
  payloadUrl.searchParams.append("ids[]", feedId);
  payloadUrl.searchParams.set("encoding", "hex");

  const response = await fetch(payloadUrl);
  if (!response.ok) {
    throw new Error(`Pyth Hermes responded with ${response.status}.`);
  }

  return (await response.json()) as PythTimedResponse;
}

function normalizePythPrice(price: string, expo: number): number {
  return Number(price) * 10 ** expo;
}
