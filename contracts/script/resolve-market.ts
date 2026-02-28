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
const DEFAULT_MARKET_ADDRESS = "0x719BfAdA8caA300A26adfe0eCf54bDF08E1B330E";
const DEFAULT_PYTH_ADDRESS = "0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5";
const DEFAULT_HERMES_URL = "https://hermes-beta.pyth.network";
const DEFAULT_FEED_ID =
  "e786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b";

const pythAbi = parseAbi([
  "function getUpdateFee(bytes[] updateData) view returns (uint256)",
]);
const marketAbi = parseAbi([
  "function resolve(bytes[] updateData) payable",
]);

type PythLatestResponse = {
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
    cliMarketAddress ?? process.env.BLINDSIDE_MARKET_ADDRESS ?? DEFAULT_MARKET_ADDRESS;
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  const rpcUrl = process.env.MONAD_RPC_URL ?? DEFAULT_RPC_URL;
  const pythAddress =
    process.env.BLINDSIDE_PYTH_BETA_ADDRESS ?? DEFAULT_PYTH_ADDRESS;
  const hermesUrl =
    process.env.BLINDSIDE_PYTH_HERMES_URL ?? DEFAULT_HERMES_URL;
  const feedId = process.env.BLINDSIDE_PYTH_MON_USD_FEED_ID ?? DEFAULT_FEED_ID;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }
  if (!isAddress(marketAddress)) {
    throw new Error("Pass a valid market address or set BLINDSIDE_MARKET_ADDRESS.");
  }

  const payloadUrl = new URL("/v2/updates/price/latest", hermesUrl);
  payloadUrl.searchParams.append("ids[]", feedId);
  payloadUrl.searchParams.set("encoding", "hex");

  const pythResponse = await fetch(payloadUrl);
  if (!pythResponse.ok) {
    throw new Error(`Pyth Hermes responded with ${pythResponse.status}.`);
  }

  const payload = (await pythResponse.json()) as PythLatestResponse;
  const updateData = payload.binary.data.map((entry) => `0x${entry}` as Hex);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
  });

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
        fee: fee.toString(),
        latestPriceE8: payload.parsed[0]?.price.price ?? null,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
