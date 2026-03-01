import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

import type { BlindsideServerConfig, PriceBoardAssetConfig } from "./config.js";

type HexAddress = `0x${string}`;

type DemoAgentWalletFile = {
  name: string;
  privateKey: string;
  address?: string;
};

type DemoAgentWalletRecord = {
  name: string;
  privateKey: Hex;
  address: HexAddress;
};

type DemoAgent = DemoAgentWalletRecord & {
  account: ReturnType<typeof privateKeyToAccount>;
  walletClient: ReturnType<typeof createWalletClient>;
};

type TrackedOrder = {
  orderId: bigint;
  side: boolean;
  priceBps: number;
  placedAt: number;
};

const DEMO_AGENT_WALLETS_PATH = resolve(
  process.cwd(),
  "server/demo-agent-wallets.json",
);
const QUOTE_SIZE_WEI = 30_000_000_000_000_000n;
const BET_SIZE_WEI = 12_000_000_000_000_000n;
const QUOTE_REFRESH_MS = 60_000;
const BET_REFRESH_MS = 120_000;
const CUTOFF_BUFFER_SECONDS = 75;
const BALANCE_RESERVE_WEI = 35_000_000_000_000_000n;

const marketAbi = parseAbi([
  "function buyYes() payable",
  "function buyNo() payable",
  "function cutoffTime() view returns (uint64)",
  "function getOrderBook() view returns (uint8[4] bidPrices, uint256[4] bidSizes, uint8[4] askPrices, uint256[4] askSizes)",
  "function placeLimitOrder(bool side, uint8 limitPriceBps, uint8 maxSlippageBps) payable returns (uint64 orderId)",
  "function cancelLimitOrder(uint64 orderId)",
  "function limitOrders(uint64 orderId) view returns (address owner, bool side, uint8 priceBps, uint8 slippageBps, uint256 amount, bool active)",
]);

export function startDemoLiquidityService(config: BlindsideServerConfig): void {
  const liveAssets = config.assets.filter((asset) => isLiveContractAddress(asset.contractAddress));
  const focusAsset = liveAssets[0] ?? null;

  if (liveAssets.length === 0) {
    console.log("Blindside demo liquidity disabled (no live market addresses found).");
    return;
  }

  let agents: DemoAgent[];
  try {
    agents = loadDemoAgents(config.rpcUrl);
  } catch (error) {
    console.error(
      `Blindside demo liquidity disabled: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(config.rpcUrl),
  });
  const trackedOrders = new Map<string, TrackedOrder>();
  const lastBetBucketByMarket = new Map<string, number>();
  let tickRunning = false;

  console.log(
    `Blindside demo liquidity active for ${liveAssets.length} market(s). Fund ${agents
      .map((agent) => `${agent.name}:${agent.address}`)
      .join(" / ")} via ${DEMO_AGENT_WALLETS_PATH}; opposing buys cycle on ${
      focusAsset?.displaySymbol ?? liveAssets[0].displaySymbol
    }.`,
  );

  const tick = async () => {
    if (tickRunning) {
      return;
    }

    tickRunning = true;

    try {
      const balances = await snapshotBalances(publicClient, agents);

      for (const asset of liveAssets) {
        try {
          await maintainMarketLiquidity({
            asset,
            agents,
            balances,
            enableDirectionalBets: asset.id === focusAsset?.id,
            trackedOrders,
            lastBetBucketByMarket,
            publicClient,
          });
        } catch (error) {
          console.error(
            `Demo liquidity failed for ${asset.displaySymbol}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      tickRunning = false;
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, 10_000);
}

async function maintainMarketLiquidity(params: {
  asset: PriceBoardAssetConfig;
  agents: DemoAgent[];
  balances: Map<HexAddress, bigint>;
  enableDirectionalBets: boolean;
  trackedOrders: Map<string, TrackedOrder>;
  lastBetBucketByMarket: Map<string, number>;
  publicClient: ReturnType<typeof createPublicClient>;
}): Promise<void> {
  const {
    asset,
    agents,
    balances,
    enableDirectionalBets,
    trackedOrders,
    lastBetBucketByMarket,
    publicClient,
  } = params;
  const contractAddress = asset.contractAddress as HexAddress;
  const nowMs = Date.now();
  const nowUnix = Math.floor(nowMs / 1000);
  const cutoffTime = Number(
    await publicClient.readContract({
      address: contractAddress,
      abi: marketAbi,
      functionName: "cutoffTime",
    }),
  );
  const secondsToCutoff = cutoffTime - nowUnix;

  if (secondsToCutoff <= CUTOFF_BUFFER_SECONDS) {
    await cancelMarketQuotes(asset, agents, trackedOrders, balances, publicClient);
    return;
  }

  const [bidPrices, _bidSizes, askPrices] = await publicClient.readContract({
    address: contractAddress,
    abi: marketAbi,
    functionName: "getOrderBook",
  });
  const quotePlan = computeQuotePlan(
    asset,
    nowMs,
    firstLivePrice(Array.from(bidPrices, (value) => Number(value))),
    firstLivePrice(Array.from(askPrices, (value) => Number(value))),
  );

  await ensureQuote({
    asset,
    agent: agents[0],
    balances,
    trackedOrders,
    publicClient,
    side: true,
    targetPriceBps: quotePlan.bidBps,
  });
  await ensureQuote({
    asset,
    agent: agents[1],
    balances,
    trackedOrders,
    publicClient,
    side: false,
    targetPriceBps: quotePlan.askBps,
  });

  if (!enableDirectionalBets) {
    return;
  }

  const betBucket = Math.floor(nowMs / BET_REFRESH_MS);
  if (lastBetBucketByMarket.get(asset.id) === betBucket) {
    return;
  }

  const yesReady = hasSpendableBalance(balances, agents[0].address, BET_SIZE_WEI);
  const noReady = hasSpendableBalance(balances, agents[1].address, BET_SIZE_WEI);

  if (!yesReady || !noReady) {
    return;
  }

  await placeDirectionalBet(asset, agents[0], balances, publicClient, true);
  await placeDirectionalBet(asset, agents[1], balances, publicClient, false);
  lastBetBucketByMarket.set(asset.id, betBucket);
}

async function ensureQuote(params: {
  asset: PriceBoardAssetConfig;
  agent: DemoAgent;
  balances: Map<HexAddress, bigint>;
  trackedOrders: Map<string, TrackedOrder>;
  publicClient: ReturnType<typeof createPublicClient>;
  side: boolean;
  targetPriceBps: number;
}): Promise<void> {
  const {
    asset,
    agent,
    balances,
    trackedOrders,
    publicClient,
    side,
    targetPriceBps,
  } = params;
  const key = trackedOrderKey(asset.id, agent.name);
  const existing = trackedOrders.get(key);
  const needsRefresh =
    !existing ||
    existing.side !== side ||
    existing.priceBps !== targetPriceBps ||
    Date.now() - existing.placedAt >= QUOTE_REFRESH_MS;

  if (!needsRefresh) {
    return;
  }

  if (existing) {
    await cancelTrackedOrder({
      asset,
      agent,
      balances,
      trackedOrders,
      publicClient,
    });
  }

  if (!hasSpendableBalance(balances, agent.address, QUOTE_SIZE_WEI)) {
    return;
  }

  const { result: orderId, request } = await publicClient.simulateContract({
    address: asset.contractAddress as HexAddress,
    abi: marketAbi,
    functionName: "placeLimitOrder",
    account: agent.account,
    args: [side, targetPriceBps, 0],
    value: QUOTE_SIZE_WEI,
  });
  const txHash = await agent.walletClient.writeContract(request);

  await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  spendBalance(balances, agent.address, QUOTE_SIZE_WEI);

  if (orderId > 0n) {
    trackedOrders.set(key, {
      orderId,
      side,
      priceBps: targetPriceBps,
      placedAt: Date.now(),
    });
    return;
  }

  trackedOrders.delete(key);
}

async function cancelMarketQuotes(
  asset: PriceBoardAssetConfig,
  agents: DemoAgent[],
  trackedOrders: Map<string, TrackedOrder>,
  balances: Map<HexAddress, bigint>,
  publicClient: ReturnType<typeof createPublicClient>,
): Promise<void> {
  for (const agent of agents) {
    if (!trackedOrders.has(trackedOrderKey(asset.id, agent.name))) {
      continue;
    }

    await cancelTrackedOrder({
      asset,
      agent,
      balances,
      trackedOrders,
      publicClient,
    });
  }
}

async function cancelTrackedOrder(params: {
  asset: PriceBoardAssetConfig;
  agent: DemoAgent;
  balances: Map<HexAddress, bigint>;
  trackedOrders: Map<string, TrackedOrder>;
  publicClient: ReturnType<typeof createPublicClient>;
}): Promise<void> {
  const { asset, agent, balances, trackedOrders, publicClient } = params;
  const key = trackedOrderKey(asset.id, agent.name);
  const existing = trackedOrders.get(key);

  if (!existing) {
    return;
  }

  let refundableAmount = 0n;

  try {
    const [owner, _side, _priceBps, _slippageBps, amount, active] =
      await publicClient.readContract({
        address: asset.contractAddress as HexAddress,
        abi: marketAbi,
        functionName: "limitOrders",
        args: [existing.orderId],
      });

    if (!active || amount === 0n || owner.toLowerCase() !== agent.address.toLowerCase()) {
      trackedOrders.delete(key);
      return;
    }

    refundableAmount = amount;
  } catch {
    trackedOrders.delete(key);
    return;
  }

  try {
    const txHash = await agent.walletClient.writeContract({
      address: asset.contractAddress as HexAddress,
      abi: marketAbi,
      account: agent.account,
      chain: monadTestnet,
      functionName: "cancelLimitOrder",
      args: [existing.orderId],
    });

    await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    creditBalance(balances, agent.address, refundableAmount);
  } catch (error) {
    console.error(
      `Demo quote cancel failed for ${asset.displaySymbol} (${agent.name}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    trackedOrders.delete(key);
  }
}

async function placeDirectionalBet(
  asset: PriceBoardAssetConfig,
  agent: DemoAgent,
  balances: Map<HexAddress, bigint>,
  publicClient: ReturnType<typeof createPublicClient>,
  side: boolean,
): Promise<void> {
  const txHash = await agent.walletClient.writeContract({
    address: asset.contractAddress as HexAddress,
    abi: marketAbi,
    account: agent.account,
    chain: monadTestnet,
    functionName: side ? "buyYes" : "buyNo",
    value: BET_SIZE_WEI,
  });

  await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  spendBalance(balances, agent.address, BET_SIZE_WEI);
}

async function snapshotBalances(
  publicClient: ReturnType<typeof createPublicClient>,
  agents: DemoAgent[],
): Promise<Map<HexAddress, bigint>> {
  const entries = await Promise.all(
    agents.map(async (agent): Promise<[HexAddress, bigint]> => {
      const balance = await publicClient.getBalance({
        address: agent.address,
      });

      return [agent.address, balance];
    }),
  );

  return new Map(entries);
}

function loadDemoAgents(rpcUrl: string): DemoAgent[] {
  const walletRecords = ensureWalletFile();

  return walletRecords.map((record) => {
    const account = privateKeyToAccount(record.privateKey);

    return {
      ...record,
      account,
      walletClient: createWalletClient({
        account,
        chain: monadTestnet,
        transport: http(rpcUrl),
      }),
    };
  });
}

function ensureWalletFile(): DemoAgentWalletRecord[] {
  if (!existsSync(DEMO_AGENT_WALLETS_PATH)) {
    const generated = [
      createWalletRecord("maker-yes"),
      createWalletRecord("maker-no"),
    ];

    writeWalletFile(generated);
    return generated;
  }

  const raw = JSON.parse(readFileSync(DEMO_AGENT_WALLETS_PATH, "utf8")) as unknown;

  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error(
      `Expected at least two demo agent wallets in ${DEMO_AGENT_WALLETS_PATH}.`,
    );
  }

  const normalized = raw.slice(0, 2).map((entry) => normalizeWalletEntry(entry));

  const hasAddressMismatch = normalized.some((entry, index) => {
    const rawEntry = raw[index] as DemoAgentWalletFile;
    return rawEntry.address?.toLowerCase() !== entry.address.toLowerCase();
  });

  if (hasAddressMismatch) {
    writeWalletFile(normalized);
  }

  return normalized;
}

function normalizeWalletEntry(value: unknown): DemoAgentWalletRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Demo agent wallet entries must be objects.");
  }

  const { name, privateKey } = value as DemoAgentWalletFile;
  if (!name || typeof name !== "string") {
    throw new Error("Each demo agent wallet needs a name.");
  }

  const normalizedKey = normalizePrivateKey(privateKey);
  if (!normalizedKey) {
    throw new Error(`Invalid private key for demo agent ${name}.`);
  }

  const account = privateKeyToAccount(normalizedKey);
  return {
    name,
    privateKey: normalizedKey,
    address: account.address,
  };
}

function createWalletRecord(name: string): DemoAgentWalletRecord {
  while (true) {
    const candidate = `0x${randomBytes(32).toString("hex")}` as Hex;

    try {
      const account = privateKeyToAccount(candidate);

      return {
        name,
        privateKey: candidate,
        address: account.address,
      };
    } catch {
      continue;
    }
  }
}

function writeWalletFile(wallets: DemoAgentWalletRecord[]): void {
  writeFileSync(
    DEMO_AGENT_WALLETS_PATH,
    `${JSON.stringify(wallets, null, 2)}\n`,
    "utf8",
  );
}

function computeQuotePlan(
  asset: PriceBoardAssetConfig,
  nowMs: number,
  bestBidBps: number | null,
  bestAskBps: number | null,
): { bidBps: number; askBps: number } {
  const wobble =
    ((Math.floor(nowMs / QUOTE_REFRESH_MS) + asset.asset.charCodeAt(0)) % 5) - 2;
  let midpoint = 50;

  if (bestBidBps !== null && bestAskBps !== null) {
    midpoint = Math.round((bestBidBps + bestAskBps) / 2);
  } else if (bestBidBps !== null) {
    midpoint = bestBidBps + 4;
  } else if (bestAskBps !== null) {
    midpoint = bestAskBps - 4;
  }

  midpoint = clampBps(midpoint + wobble, 42, 58);

  const spread = 3 + ((Math.floor(nowMs / (QUOTE_REFRESH_MS * 2)) + asset.id.length) % 2);
  const bidBps = clampBps(midpoint - spread, 30, 70);
  const askBps = clampBps(Math.max(midpoint + spread, bidBps + 2), 32, 72);

  return {
    bidBps,
    askBps,
  };
}

function trackedOrderKey(marketId: string, agentName: string): string {
  return `${marketId}:${agentName}`;
}

function firstLivePrice(levels: number[]): number | null {
  for (const level of levels) {
    if (level > 0) {
      return level;
    }
  }

  return null;
}

function hasSpendableBalance(
  balances: Map<HexAddress, bigint>,
  address: HexAddress,
  spendAmount: bigint,
): boolean {
  const balance = balances.get(address) ?? 0n;
  return balance >= spendAmount + BALANCE_RESERVE_WEI;
}

function spendBalance(
  balances: Map<HexAddress, bigint>,
  address: HexAddress,
  amount: bigint,
): void {
  const current = balances.get(address) ?? 0n;
  balances.set(address, current > amount ? current - amount : 0n);
}

function creditBalance(
  balances: Map<HexAddress, bigint>,
  address: HexAddress,
  amount: bigint,
): void {
  const current = balances.get(address) ?? 0n;
  balances.set(address, current + amount);
}

function clampBps(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function normalizePrivateKey(value: string | undefined): Hex | null {
  if (!value) {
    return null;
  }

  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    return null;
  }

  return normalized as Hex;
}

function isLiveContractAddress(value: string): boolean {
  return (
    isAddress(value) &&
    value.toLowerCase() !== "0x0000000000000000000000000000000000000000"
  );
}
