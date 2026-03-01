import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_BENCHMARKS_URL = "https://benchmarks.pyth.network/v1/shims/tradingview";
const PYTH_PRIMARY_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43";
const PYTH_BETA_ADDRESS = "0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_CUTOFF_TIME = 1_774_972_800;
const DEPLOYMENTS_PATH = resolve(
  process.cwd(),
  "contracts/deployments/tracked-markets.json",
);

export type PriceBoardAssetConfig = {
  id: string;
  asset: "BTC" | "ETH" | "SOL" | "MON";
  displaySymbol: `${string}/USD`;
  ticker: string;
  feedId: string;
  accent: string;
  contractAddress: string;
  question: string;
  strikeE8: number;
  cutoffTime: number;
  pythAddress: string;
};

export type BlindsideServerConfig = {
  port: number;
  rpcUrl: string;
  benchmarksBaseUrl: string;
  assets: PriceBoardAssetConfig[];
};

export function getServerConfig(): BlindsideServerConfig {
  const deployments = loadTrackedDeployments();

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
        contractAddress: deployments.btc,
        question: "Will BTC/USD settle above $95,000 at 2026-03-31 16:00 UTC?",
        strikeE8: 9_500_000_000_000,
        cutoffTime: deployments.cutoffTime,
        pythAddress: PYTH_PRIMARY_ADDRESS,
      },
      {
        id: "eth-24h",
        asset: "ETH",
        displaySymbol: "ETH/USD",
        ticker: "Crypto.ETH/USD",
        feedId:
          "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        accent: "#627eea",
        contractAddress: deployments.eth,
        question: "Will ETH/USD settle above $2,700 at 2026-03-31 16:00 UTC?",
        strikeE8: 270_000_000_000,
        cutoffTime: deployments.cutoffTime,
        pythAddress: PYTH_PRIMARY_ADDRESS,
      },
      {
        id: "sol-24h",
        asset: "SOL",
        displaySymbol: "SOL/USD",
        ticker: "Crypto.SOL/USD",
        feedId:
          "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        accent: "#13cd96",
        contractAddress: deployments.sol,
        question: "Will SOL/USD settle above $180 at 2026-03-31 16:00 UTC?",
        strikeE8: 18_000_000_000,
        cutoffTime: deployments.cutoffTime,
        pythAddress: PYTH_PRIMARY_ADDRESS,
      },
      {
        id: "mon-24h",
        asset: "MON",
        displaySymbol: "MON/USD",
        ticker: "Crypto.MON/USD",
        feedId:
          "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b",
        accent: "#836ef9",
        contractAddress: deployments.mon,
        question: "Will MON/USD settle above $0.0210 at 2026-03-31 16:00 UTC?",
        strikeE8: 2_100_000,
        cutoffTime: deployments.cutoffTime,
        pythAddress: PYTH_BETA_ADDRESS,
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

type TrackedDeployments = {
  btc: string;
  eth: string;
  sol: string;
  mon: string;
  cutoffTime: number;
};

function loadTrackedDeployments(): TrackedDeployments {
  const fallback: TrackedDeployments = {
    btc: process.env.BLINDSIDE_BTC_MARKET_ADDRESS ?? ZERO_ADDRESS,
    eth: process.env.BLINDSIDE_ETH_MARKET_ADDRESS ?? ZERO_ADDRESS,
    sol: process.env.BLINDSIDE_SOL_MARKET_ADDRESS ?? ZERO_ADDRESS,
    mon: process.env.BLINDSIDE_MON_MARKET_ADDRESS ?? ZERO_ADDRESS,
    cutoffTime: DEFAULT_CUTOFF_TIME,
  };

  if (!existsSync(DEPLOYMENTS_PATH)) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) as Partial<
      TrackedDeployments
    >;

    return {
      btc: parsed.btc ?? fallback.btc,
      eth: parsed.eth ?? fallback.eth,
      sol: parsed.sol ?? fallback.sol,
      mon: parsed.mon ?? fallback.mon,
      cutoffTime:
        typeof parsed.cutoffTime === "number"
          ? parsed.cutoffTime
          : fallback.cutoffTime,
    };
  } catch {
    return fallback;
  }
}
