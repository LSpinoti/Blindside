import "dotenv/config";

import cors from "cors";
import express from "express";

import {
  buildHermesLatestUrl,
  buildMarketCatalogue,
  getServerConfig,
} from "./config.js";

type PythLatestResponse = {
  binary: {
    encoding: string;
    data: string[];
  };
  parsed: Array<{
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  }>;
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

app.get("/api/markets", (_req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    markets: buildMarketCatalogue(),
  });
});

app.get("/api/markets/:marketId", (req, res) => {
  const market = buildMarketCatalogue().find(
    (entry) => entry.id === req.params.marketId,
  );

  if (!market) {
    res.status(404).json({ error: "Market not found." });
    return;
  }

  res.json({
    generatedAt: new Date().toISOString(),
    market,
  });
});

app.get("/api/admin/pyth-update", async (req, res) => {
  const marketId = String(req.query.marketId ?? "");
  const market =
    buildMarketCatalogue().find((entry) => entry.id === marketId) ??
    buildMarketCatalogue()[0];

  if (!market) {
    res.status(404).json({ error: "No market configured." });
    return;
  }

  try {
    const response = await fetch(buildHermesLatestUrl(market.pythFeedId));
    if (!response.ok) {
      throw new Error(`Hermes responded with ${response.status}.`);
    }

    const payload = (await response.json()) as PythLatestResponse;
    const latest = payload.parsed[0];
    const latestPriceE8 = Number(latest?.price.price ?? "0");

    res.json({
      generatedAt: new Date().toISOString(),
      marketId: market.id,
      marketAddress: market.contractAddress,
      pythContract: market.pythBetaAddress,
      updateDataHex: payload.binary.data.map((entry) => `0x${entry}`),
      latestPriceE8,
      latestPriceDisplay: (latestPriceE8 / 100_000_000).toFixed(6),
      exponent: latest?.price.expo ?? -8,
      publishTime: latest?.price.publish_time ?? null,
      strikeE8: market.strikeE8,
      strikeDisplay: market.strikeDisplay,
      resolvesYes: latestPriceE8 > market.strikeE8,
    });
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch the latest Pyth payload.",
    });
  }
});

app.listen(config.port, () => {
  console.log(
    `Blindside API listening on http://localhost:${config.port} (Monad RPC: ${config.rpcUrl})`,
  );
});
