const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_MARKET_ADDRESS = "0x27Cf059b318C287684992a5bae7919fdaff5D205";
const DEFAULT_PYTH_BETA_ADDRESS = "0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5";
const DEFAULT_PYTH_HERMES_URL = "https://hermes-beta.pyth.network";
const DEFAULT_PYTH_MON_USD_FEED_ID =
  "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b";
const DEFAULT_CUTOFF_ISO = "2026-03-31T16:00:00.000Z";
const DEFAULT_STRIKE_E8 = 2_100_000;

export type BlindsideMarketApi = {
  id: string;
  question: string;
  summary: string;
  strikeE8: number;
  strikeDisplay: string;
  cutoffTime: string;
  contractAddress: string;
  pythBetaAddress: string;
  pythFeedId: string;
  pythHermesUrl: string;
  yesPoolWei: string;
  noPoolWei: string;
  status: "Open" | "Locked" | "Resolved";
  resolveSource: string;
  resolvedOutcome: boolean | null;
  settlementPriceE8: number | null;
  settlementTimestamp: string | null;
};

export type BlindsideServerConfig = {
  port: number;
  rpcUrl: string;
  marketAddress: string;
  cutoffIso: string;
  pythBetaAddress: string;
  pythHermesUrl: string;
  pythFeedId: string;
};

export function getServerConfig(): BlindsideServerConfig {
  return {
    port: Number(process.env.PORT ?? "3001"),
    rpcUrl: process.env.MONAD_RPC_URL ?? DEFAULT_RPC_URL,
    marketAddress:
      process.env.BLINDSIDE_MARKET_ADDRESS ?? DEFAULT_MARKET_ADDRESS,
    cutoffIso: process.env.BLINDSIDE_MARKET_CUTOFF_ISO ?? DEFAULT_CUTOFF_ISO,
    pythBetaAddress:
      process.env.BLINDSIDE_PYTH_BETA_ADDRESS ?? DEFAULT_PYTH_BETA_ADDRESS,
    pythHermesUrl:
      process.env.BLINDSIDE_PYTH_HERMES_URL ?? DEFAULT_PYTH_HERMES_URL,
    pythFeedId:
      process.env.BLINDSIDE_PYTH_MON_USD_FEED_ID ?? DEFAULT_PYTH_MON_USD_FEED_ID,
  };
}

export function buildMarketCatalogue(): BlindsideMarketApi[] {
  const config = getServerConfig();
  const strikeDisplay = formatStrike(DEFAULT_STRIKE_E8);
  const question = `Will MON/USD settle above $${strikeDisplay} at 2026-03-31 16:00 UTC?`;

  return [
    {
      id: "mon-above-0_0210-mar-31",
      question,
      summary:
        "Private vault funding, public burner execution, and Pyth-backed resolution for a single binary market.",
      strikeE8: DEFAULT_STRIKE_E8,
      strikeDisplay,
      cutoffTime: config.cutoffIso,
      contractAddress: config.marketAddress,
      pythBetaAddress: config.pythBetaAddress,
      pythFeedId: config.pythFeedId,
      pythHermesUrl: config.pythHermesUrl,
      yesPoolWei: "480000000000000000",
      noPoolWei: "320000000000000000",
      status: inferMarketStatus(config.cutoffIso),
      resolveSource: "Pyth MON/USD beta feed",
      resolvedOutcome: null,
      settlementPriceE8: null,
      settlementTimestamp: null,
    },
  ];
}

export function buildHermesLatestUrl(feedId: string): string {
  const { pythHermesUrl } = getServerConfig();
  const url = new URL("/v2/updates/price/latest", pythHermesUrl);
  url.searchParams.append("ids[]", feedId);
  url.searchParams.set("encoding", "hex");
  return url.toString();
}

function inferMarketStatus(cutoffIso: string): "Open" | "Locked" | "Resolved" {
  const cutoff = Date.parse(cutoffIso);
  if (Number.isNaN(cutoff)) {
    return "Open";
  }

  return Date.now() >= cutoff ? "Locked" : "Open";
}

function formatStrike(strikeE8: number): string {
  return (strikeE8 / 100_000_000).toFixed(4);
}
