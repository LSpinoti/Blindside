import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_BENCHMARKS_URL =
  "https://benchmarks.pyth.network/v1/shims/tradingview";
const DEFAULT_HERMES_URL = "https://hermes.pyth.network";
const PYTH_PRIMARY_ADDRESS = "0x2880aB155794e7179c9eE2e38200202908C17B43";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEPLOYMENTS_PATH = resolve(
  process.cwd(),
  "contracts/deployments/tracked-markets.json",
);

export type PriceBoardAssetConfig = {
  id: string;
  asset: "BTC" | "ETH" | "SOL" | "XRP";
  displaySymbol: `${string}/USD`;
  ticker: string;
  feedId: string;
  accent: string;
  contractAddress: string;
  question: string;
  pythAddress: string;
  hermesUrl: string;
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
        id: "btc-1h",
        asset: "BTC",
        displaySymbol: "BTC/USD",
        ticker: "Crypto.BTC/USD",
        feedId:
          "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
        accent: "#ef8e19",
        contractAddress: deployments.btc,
        question: "Will BTC/USD close above its opening price this UTC hour?",
        pythAddress: PYTH_PRIMARY_ADDRESS,
        hermesUrl: DEFAULT_HERMES_URL,
      },
      {
        id: "eth-1h",
        asset: "ETH",
        displaySymbol: "ETH/USD",
        ticker: "Crypto.ETH/USD",
        feedId:
          "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
        accent: "#627eea",
        contractAddress: deployments.eth,
        question: "Will ETH/USD close above its opening price this UTC hour?",
        pythAddress: PYTH_PRIMARY_ADDRESS,
        hermesUrl: DEFAULT_HERMES_URL,
      },
      {
        id: "sol-1h",
        asset: "SOL",
        displaySymbol: "SOL/USD",
        ticker: "Crypto.SOL/USD",
        feedId:
          "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
        accent: "#13cd96",
        contractAddress: deployments.sol,
        question: "Will SOL/USD close above its opening price this UTC hour?",
        pythAddress: PYTH_PRIMARY_ADDRESS,
        hermesUrl: DEFAULT_HERMES_URL,
      },
      {
        id: "xrp-1h",
        asset: "XRP",
        displaySymbol: "XRP/USD",
        ticker: "Crypto.XRP/USD",
        feedId:
          "ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
        accent: "#ffffff",
        contractAddress: deployments.xrp,
        question: "Will XRP/USD close above its opening price this UTC hour?",
        pythAddress: PYTH_PRIMARY_ADDRESS,
        hermesUrl: DEFAULT_HERMES_URL,
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
  xrp: string;
};

function loadTrackedDeployments(): TrackedDeployments {
  const fallback: TrackedDeployments = {
    btc: process.env.BLINDSIDE_BTC_MARKET_ADDRESS ?? ZERO_ADDRESS,
    eth: process.env.BLINDSIDE_ETH_MARKET_ADDRESS ?? ZERO_ADDRESS,
    sol: process.env.BLINDSIDE_SOL_MARKET_ADDRESS ?? ZERO_ADDRESS,
    xrp: process.env.BLINDSIDE_XRP_MARKET_ADDRESS ?? ZERO_ADDRESS,
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
      xrp: parsed.xrp ?? fallback.xrp,
    };
  } catch {
    return fallback;
  }
}
