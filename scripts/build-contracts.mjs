import { spawnSync } from "node:child_process";

const skipRequested = process.env.SKIP_CONTRACT_BUILD === "1";
const runningOnVercel = Boolean(process.env.VERCEL);

if (skipRequested) {
  console.log("Skipping contract build because SKIP_CONTRACT_BUILD=1.");
  process.exit(0);
}

const forgeCandidates = [
  process.env.FORGE_BIN,
  process.env.HOME ? `${process.env.HOME}/.foundry/bin/forge` : null,
  "forge",
].filter(Boolean);

const forgeBin = forgeCandidates.find((candidate) => {
  const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
});

if (!forgeBin) {
  if (runningOnVercel) {
    console.log(
      "Skipping contract build: forge is not installed in the Vercel build environment.",
    );
    process.exit(0);
  }

  console.error(
    "Contract build requires Monad Foundry (`forge`). Install it or set SKIP_CONTRACT_BUILD=1.",
  );
  process.exit(1);
}

const build = spawnSync(forgeBin, ["build", "--root", "contracts"], {
  stdio: "inherit",
});

if (build.error) {
  console.error(`Failed to run ${forgeBin}: ${build.error.message}`);
  process.exit(1);
}

process.exit(build.status ?? 1);
