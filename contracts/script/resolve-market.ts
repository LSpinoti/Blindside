import "dotenv/config";

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

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_HERMES_URL = "https://hermes.pyth.network";
const DEFAULT_BETA_HERMES_URL = "https://hermes-beta.pyth.network";
const PYTH_BETA_MON_FEED_ID =
  "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const pythAbi = parseAbi([
  "function getUpdateFee(bytes[] updateData) view returns (uint256)",
]);
const marketAbi = parseAbi([
  "function resolve(bytes[] updateData) payable",
  "function PYTH() view returns (address)",
  "function PRICE_FEED_ID() view returns (bytes32)",
  "function cutoffTime() view returns (uint64)",
]);

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

async function main(): Promise<void> {
  const cliMarketAddress = process.argv[2];
  const marketAddress =
    cliMarketAddress ?? process.env.BLINDSIDE_MARKET_ADDRESS ?? ZERO_ADDRESS;
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  const rpcUrl = process.env.MONAD_RPC_URL ?? DEFAULT_RPC_URL;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }
  if (!isAddress(marketAddress)) {
    throw new Error("Pass a valid market address or set BLINDSIDE_MARKET_ADDRESS.");
  }

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
  });

  const [pythAddress, feedId, cutoffTime] = await Promise.all([
    publicClient.readContract({
      address: marketAddress as `0x${string}`,
      abi: marketAbi,
      functionName: "PYTH",
    }),
    publicClient.readContract({
      address: marketAddress as `0x${string}`,
      abi: marketAbi,
      functionName: "PRICE_FEED_ID",
    }),
    publicClient.readContract({
      address: marketAddress as `0x${string}`,
      abi: marketAbi,
      functionName: "cutoffTime",
    }),
  ]);

  const hermesUrl = resolveHermesUrl(
    process.env.BLINDSIDE_PYTH_HERMES_URL,
    feedId,
  );

  const payloadUrl = new URL(`/v2/updates/price/${cutoffTime}`, hermesUrl);
  payloadUrl.searchParams.append("ids[]", feedId);
  payloadUrl.searchParams.set("encoding", "hex");

  const pythResponse = await fetch(payloadUrl);
  if (!pythResponse.ok) {
    throw new Error(`Pyth Hermes responded with ${pythResponse.status}.`);
  }

  const payload = (await pythResponse.json()) as PythTimedResponse;
  const updateData = payload.binary.data.map((entry) => `0x${entry}` as Hex);

  const fee = await publicClient.readContract({
    address: pythAddress as `0x${string}`,
    abi: pythAbi,
    functionName: "getUpdateFee",
    args: [updateData],
  });

  const walletClient = createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: monadTestnet,
    transport: http(rpcUrl),
  });

  const txHash = await walletClient.writeContract({
    address: marketAddress as `0x${string}`,
    abi: marketAbi,
    functionName: "resolve",
    args: [updateData],
    value: fee,
  });

  console.log(
    JSON.stringify(
      {
        txHash,
        marketAddress,
        pythAddress,
        hermesUrl,
        feedId,
        cutoffTime: Number(cutoffTime),
        fee: fee.toString(),
        settlementPriceE8: payload.parsed[0]?.price.price ?? null,
        exponent: payload.parsed[0]?.price.expo ?? null,
        publishTime: payload.parsed[0]?.price.publish_time ?? null,
      },
      null,
      2,
    ),
  );
}

function normalizePrivateKey(value: string | undefined): Hex | null {
  if (!value) {
    return null;
  }

  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function resolveHermesUrl(
  envUrl: string | undefined,
  feedId: string,
): string {
  if (envUrl) {
    return envUrl;
  }

  return feedId.replace(/^0x/, "").toLowerCase() === PYTH_BETA_MON_FEED_ID
    ? DEFAULT_BETA_HERMES_URL
    : DEFAULT_HERMES_URL;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
