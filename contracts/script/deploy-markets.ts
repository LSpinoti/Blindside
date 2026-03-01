import "dotenv/config";

import { spawnSync } from "node:child_process";

const DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";
const DEFAULT_HERMES_URL = "https://hermes.pyth.network";

type PythTimedResponse = {
  parsed: Array<{
    price: {
      price: string;
      expo: number;
      publish_time: number;
    };
  }>;
};

type DeployAsset = {
  envKey: string;
  feedId: string;
  hermesUrl: string;
};

const deployAssets: DeployAsset[] = [
  {
    envKey: "BLINDSIDE_BTC_INITIAL_STRIKE_E8",
    feedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    hermesUrl: DEFAULT_HERMES_URL,
  },
  {
    envKey: "BLINDSIDE_ETH_INITIAL_STRIKE_E8",
    feedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    hermesUrl: DEFAULT_HERMES_URL,
  },
  {
    envKey: "BLINDSIDE_SOL_INITIAL_STRIKE_E8",
    feedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    hermesUrl: DEFAULT_HERMES_URL,
  },
  {
    envKey: "BLINDSIDE_XRP_INITIAL_STRIKE_E8",
    feedId: "ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
    hermesUrl: DEFAULT_HERMES_URL,
  },
];

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required.");
  }

  const rpcUrl = process.env.MONAD_RPC_URL ?? DEFAULT_RPC_URL;
  const hourStart = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const strikeEntries = await Promise.all(
    deployAssets.map(async (asset) => {
      const strikeE8 = await fetchStrikeE8(asset, hourStart);
      return [asset.envKey, strikeE8] as const;
    }),
  );

  const nextEnv = {
    ...process.env,
    MONAD_RPC_URL: rpcUrl,
  } as NodeJS.ProcessEnv;

  for (const [envKey, strikeE8] of strikeEntries) {
    nextEnv[envKey] = strikeE8;
  }

  const result = spawnSync(
    process.env.SHELL ?? "bash",
    [
      "-lc",
      'cd contracts && "$HOME/.foundry/bin/forge" script script/DeployBlindsideMarkets.s.sol:DeployBlindsideMarketsScript --rpc-url "${MONAD_RPC_URL}" --private-key "$PRIVATE_KEY" --broadcast --legacy',
    ],
    {
      cwd: process.cwd(),
      env: nextEnv,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function fetchStrikeE8(
  asset: DeployAsset,
  publishTime: number,
): Promise<string> {
  const payloadUrl = new URL(`/v2/updates/price/${publishTime}`, asset.hermesUrl);
  payloadUrl.searchParams.append("ids[]", asset.feedId);

  const response = await fetch(payloadUrl);
  if (!response.ok) {
    throw new Error(
      `Pyth Hermes responded with ${response.status} for ${asset.envKey}.`,
    );
  }

  const payload = (await response.json()) as PythTimedResponse;
  const quote = payload.parsed[0]?.price;
  if (!quote) {
    throw new Error(`Missing Pyth price for ${asset.envKey}.`);
  }

  const normalized = normalizeToE8(quote.price, quote.expo);
  if (normalized <= 0n) {
    throw new Error(`Invalid non-positive strike for ${asset.envKey}.`);
  }

  return normalized.toString();
}

function normalizeToE8(rawPrice: string, expo: number): bigint {
  let normalized = BigInt(rawPrice);
  const exponentDelta = expo + 8;

  if (exponentDelta > 0) {
    normalized *= 10n ** BigInt(exponentDelta);
  } else if (exponentDelta < 0) {
    normalized /= 10n ** BigInt(-exponentDelta);
  }

  return normalized;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
