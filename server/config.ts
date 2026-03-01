const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_BENCHMARKS_URL = "https://benchmarks.pyth.network/v1/shims/tradingview";

export type PriceBoardAssetConfig = {
  id: string;
  asset: "BTC" | "ETH" | "SOL" | "MON";
  displaySymbol: `${string}/USD`;
  ticker: string;
  feedId: string;
  accent: string;
};

export type BlindsideServerConfig = {
  port: number;
  rpcUrl: string;
  benchmarksBaseUrl: string;
  assets: PriceBoardAssetConfig[];
};

export function getServerConfig(): BlindsideServerConfig {
  return {
    port: Number(process.env.PORT ?? "3001"),
    rpcUrl: process.env.MONAD_RPC_URL ?? DEFAULT_RPC_URL,
    benchmarksBaseUrl: DEFAULT_BENCHMARKS_URL,
    assets: [
      {
        id: "btc-24h",
        asset: "BTC",
        displaySymbol: "BTC/USD",
        ticker: "Crypto.BTC/USD",
        feedId:
          "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        accent: "#ef8e19",
      },
      {
        id: "eth-24h",
        asset: "ETH",
        displaySymbol: "ETH/USD",
        ticker: "Crypto.ETH/USD",
        feedId:
          "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        accent: "#627eea",
      },
      {
        id: "sol-24h",
        asset: "SOL",
        displaySymbol: "SOL/USD",
        ticker: "Crypto.SOL/USD",
        feedId:
          "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        accent: "#13cd96",
      },
      {
        id: "mon-24h",
        asset: "MON",
        displaySymbol: "MON/USD",
        ticker: "Crypto.MON/USD",
        feedId:
          "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b",
        accent: "#836ef9",
      },
    ],
  };
}

export function buildTradingViewHistoryUrl(
  ticker: string,
  resolution: "1" | "5" | "15" | "60",
  fromUnix: number,
  toUnix: number,
): string {
  const { benchmarksBaseUrl } = getServerConfig();
  const url = new URL(`${benchmarksBaseUrl.replace(/\/$/, "")}/history`);
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("resolution", resolution);
  url.searchParams.set("from", String(fromUnix));
  url.searchParams.set("to", String(toUnix));
  return url.toString();
}
