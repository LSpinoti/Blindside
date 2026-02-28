export const MONAD_CHAIN_ID = 10143;
export const MONAD_RPC_URL =
  import.meta.env.VITE_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
export const MON_NATIVE_TOKEN =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const UNLINK_GATEWAY_URL = "https://api.unlink.xyz";
export const UNLINK_POOL_ADDRESS =
  "0x0813da0a10328e5ed617d37e514ac2f6fa49a254";
export const UNLINK_ARTIFACT_VERSION = "v6bad364c";
export const PYTH_BETA_ADDRESS =
  "0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5";
export const PYTH_HERMES_URL = "https://hermes-beta.pyth.network";
export const PYTH_MON_USD_FEED_ID =
  "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type BlindsideSide = "YES" | "NO";
export type RouteKey = "desk" | "activity" | "resolve";
export type BurnerLifecycle = "idle" | "funded" | "in-market" | "claimable" | "swept";
export type VisibilityScope = "Private" | "Public" | "Derived privately";

export type BlindsideMarket = {
  id: string;
  label: string;
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

export type BurnerPosition = {
  id: string;
  marketId: string;
  burnerIndex: number;
  burnerAddress: string;
  side: BlindsideSide;
  amountWei: string;
  placedAt: string;
  state: BurnerLifecycle;
  fundRelayId?: string;
  tradeTxHash?: string;
  claimTxHash?: string;
  sweepTxHash?: string;
  payoutWei?: string;
};

export type BlindsideActivity = {
  id: string;
  timestamp: string;
  action: string;
  marketId?: string;
  scope: string;
  source: VisibilityScope;
  publicAddress?: string;
  privateImpact: string;
  status: string;
  txRef?: string;
};

export type PrivateRegistry = {
  version: 1;
  nextBurnerIndex: number;
  positions: BurnerPosition[];
  activity: BlindsideActivity[];
  createdWalletAt?: string;
  importedWalletAt?: string;
};
