> ## Documentation Index
> Fetch the complete documentation index at: https://docs.unlink.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# Node

> Server-side private wallet management for Node.js

The package `@unlink-xyz/node` is a Node.js SDK for building private applications in backends and scripts.

<Note>
  For React apps, use [`@unlink-xyz/react`](/sdk/react) instead. For Vue,
  Svelte, or vanilla browser JS, use
  [`@unlink-xyz/core`](https://www.npmjs.com/package/@unlink-xyz/core) and
  follow the [api-reference](/sdk/api-reference) directly.
</Note>

## Quickstart

Add private wallet management to your backend in under 5 minutes.

<Steps>
  <Step title="Prerequisites">
    Make sure you have:

    * [Node.js](https://nodejs.org/) v18 or later
    * A package manager (npm, pnpm, or yarn)
    * A Node.js project with ESM support (`"type": "module"` in package.json)

    Don't have a Node.js project yet?

    <Tabs>
      <Tab title="JavaScript">
        ```bash  theme={null}
        mkdir my-app && cd my-app
        npm init -y
        npm pkg set type=module
        ```
      </Tab>

      <Tab title="TypeScript">
        ```bash  theme={null}
        mkdir my-app && cd my-app
        npm init -y
        npm pkg set type=module
        npm install -D typescript tsx
        ```
      </Tab>
    </Tabs>

    <Warning>
      `@unlink-xyz/node` depends on `better-sqlite3`, a native module. Most
      systems handle this automatically, but you may need Python 3 and a C++
      compiler (Xcode CLI tools on macOS, `build-essential` on Ubuntu) if the
      prebuilt binary is not available for your platform.
    </Warning>
  </Step>

  <Step title="Install">
    ```bash  theme={null}
    npm install @unlink-xyz/node
    ```
  </Step>

  <Step title="Create a wallet">
    ```typescript  theme={null}
    import { initWallet } from "@unlink-xyz/node";

    const wallet = await initWallet({
      chain: "monad-testnet",
    });
    // Seed, first account, and sync are handled automatically
    ```
  </Step>

  <Step title="Send tokens">
    ```typescript  theme={null}
    import { waitForConfirmation } from "@unlink-xyz/node";

    const result = await wallet.transfer({
      transfers: [{ token: "0x...", recipient: "unlink1...", amount: 1000n }],
    });

    const status = await waitForConfirmation(wallet, result.relayId);
    console.log(status.txHash);
    ```
  </Step>
</Steps>

That's it. `initWallet()` uses Node.js defaults (in-memory storage, `node:crypto` RNG) and creates the seed and first account automatically. Each wallet instance manages one user's private state.

### Common operations

<CardGroup cols={2}>
  <Card title="Create wallet" icon="wallet" href="#seed">
    One-call setup with initWallet().
  </Card>

  <Card title="Deposit" icon="arrow-down-to-bracket" href="#deposit">
    Move tokens from a public address into a private account.
  </Card>

  <Card title="Send tokens" icon="paper-plane" href="#transfer">
    Send a private transfer to another Unlink address.
  </Card>

  <Card title="Withdraw" icon="arrow-up-from-bracket" href="#withdraw">
    Move tokens from a private account back to a public address.
  </Card>
</CardGroup>

***

## Full guide

Everything below covers the complete API surface: initialization, relay lifecycle, events, storage, and configuration.

## initWallet

One-call setup with Node.js defaults. Creates seed, first account, and syncs notes automatically.

```typescript  theme={null}
import { initWallet } from "@unlink-xyz/node";

const wallet = await initWallet({
  chain: "monad-testnet",
});
```

To import an existing mnemonic instead of generating a new one:

```typescript  theme={null}
const wallet = await initWallet({
  chain: "monad-testnet",
  setup: false,
  sync: false,
});

await wallet.seed.importMnemonic("word1 word2 ... word24");
await wallet.accounts.create();
await wallet.sync();
```

### Configuration

`initWallet()` accepts two configuration modes, same as the core SDK:

**Chain mode (recommended):**

```typescript  theme={null}
const wallet = await initWallet({
  chain: "monad-testnet",
});
```

**Explicit mode:**

```typescript  theme={null}
import { createSqliteStorage, initWallet } from "@unlink-xyz/node";

const wallet = await initWallet({
  chainId: 10143,
  gatewayUrl: "https://api.unlink.xyz",
  poolAddress: "0x3027AB04895E170aD5Be3D0453eF61945139c163",
  storage: createSqliteStorage({ path: "./wallet.db" }),
});
```

| Option        | Type             | Default                   | Description                                             |
| ------------- | ---------------- | ------------------------- | ------------------------------------------------------- |
| `chain`       | `SupportedChain` | -                         | Chain name — resolves chainId, gateway, pool, artifacts |
| `chainId`     | `number`         | -                         | Target blockchain ID (required with `gatewayUrl`)       |
| `gatewayUrl`  | `string`         | -                         | Explicit gateway URL (mutually exclusive with `chain`)  |
| `poolAddress` | `string`         | from chain config         | Contract address (required with `gatewayUrl`)           |
| `storage`     | `Storage`        | `createMemoryStorage()`   | Storage backend                                         |
| `rng`         | `function`       | `node:crypto.randomBytes` | Random number generator                                 |
| `chainRpcUrl` | `string`         | -                         | Direct chain RPC for burner transactions                |
| `prover`      | `object`         | from chain config         | Artifact source configuration                           |
| `setup`       | `boolean`        | `true`                    | Auto-create seed and first account                      |
| `sync`        | `boolean`        | `true`                    | Sync notes from blockchain after init                   |
| `autoSync`    | `boolean`        | `false`                   | Enable interval-based auto sync                         |

## Relay lifecycle

### waitForConfirmation

Polls relay status with exponential backoff (2s, 3s, 4.5s, capped at 30s). Resolves on success, throws on failure or timeout.

```typescript  theme={null}
import { waitForConfirmation } from "@unlink-xyz/node";

const result = await wallet.transfer({
  transfers: [{ token: "0x...", recipient: "unlink1...", amount: 1000n }],
});

try {
  const status = await waitForConfirmation(wallet, result.relayId, {
    timeout: 60_000, // 60 seconds (default: 5 minutes)
    pollInterval: 3_000, // initial interval (default: 2 seconds)
  });
  console.log(status.state); // "succeeded"
  console.log(status.txHash); // "0xabc..."
} catch (e) {
  if (e instanceof TimeoutError) {
    // Transaction still pending after timeout
  } else if (e instanceof TransactionFailedError) {
    // e.state: "reverted" | "failed" | "dead"
    // e.reason: error message from broadcaster
  }
}
```

### pollRelayStatus

Async generator that yields `TxStatus` on each poll. Useful for logging or progress updates.

```typescript  theme={null}
import { pollRelayStatus } from "@unlink-xyz/node";

for await (const status of pollRelayStatus(wallet, relayId)) {
  console.log(status.state); // "pending" -> "broadcasting" -> "submitted" -> "succeeded"
}
```

| Option     | Type     | Default     | Description                 |
| ---------- | -------- | ----------- | --------------------------- |
| `timeout`  | `number` | 300000 (5m) | Maximum polling duration    |
| `interval` | `number` | 2000        | Initial poll interval in ms |

## Events

`createWalletEmitter()` wraps the wallet's event system with a Node.js `EventEmitter`.

```typescript  theme={null}
import { createWalletEmitter } from "@unlink-xyz/node";

const { emitter, unsubscribe } = createWalletEmitter(wallet);

emitter.on("notes-updated", (event) => {
  console.log("Notes updated on chain", event.chainId);
});

emitter.on("tx-status-changed", (event) => {
  console.log(`TX ${event.txId}: ${event.state}`);
});

// Listen to all events
emitter.on("*", (event) => console.log(event));

// Cleanup
unsubscribe();
```

Event types: `notes-updated`, `tx-status-changed`, `sync-error`, `wallet-created`, `account-created`, `account-switched`.

## Storage

By default, `initWallet()` uses in-memory storage. For persistence across restarts, use SQLite:

```typescript  theme={null}
import { createSqliteStorage, initWallet } from "@unlink-xyz/node";

const wallet = await initWallet({
  chain: "monad-testnet",
  storage: createSqliteStorage({ path: "./data/wallet.db" }),
});
```

The directory is created automatically if it doesn't exist.

## Errors

```typescript  theme={null}
import { TimeoutError, TransactionFailedError } from "@unlink-xyz/node";
```

| Error                    | Thrown when                        | Properties                |
| ------------------------ | ---------------------------------- | ------------------------- |
| `TimeoutError`           | Relay polling exceeds timeout      | `txId`, `timeout`         |
| `TransactionFailedError` | Transaction reaches a failed state | `txId`, `state`, `reason` |

## Wallet API

The wallet returned by `initWallet()` is an `UnlinkWallet` instance from `@unlink-xyz/core`. All core methods are available:

### Seed

```typescript  theme={null}
await wallet.seed.exists(); // Check if wallet exists
await wallet.seed.create(); // Create wallet, returns { mnemonic }
await wallet.seed.importMnemonic("word1 word2 ..."); // Import wallet
await wallet.seed.exportMnemonic(); // Export mnemonic
await wallet.seed.delete(); // Delete wallet
```

### Accounts

```typescript  theme={null}
await wallet.accounts.list(); // List all accounts
await wallet.accounts.create(); // Create new account
await wallet.accounts.get(0); // Get account by index
await wallet.accounts.getActive(); // Get active account
await wallet.accounts.getActiveIndex(); // Get active account index
await wallet.accounts.setActive(1); // Switch to account
```

### Deposit

```typescript  theme={null}
const deposit = await wallet.deposit({
  depositor: "0xYourEOA",
  deposits: [{ token: "0x...", amount: 1000000n }],
});

// Submit with wallet provider
await provider.sendTransaction({ to: deposit.to, data: deposit.calldata });

// Wait for confirmation
await wallet.confirmDeposit(deposit.relayId);
```

### Transfer

```typescript  theme={null}
// One-step transfer
const result = await wallet.transfer({
  transfers: [{ token: "0x...", recipient: "unlink1...", amount: 1000n }],
});

// Or with preview
const plans = await wallet.planTransfer({
  transfers: [{ token: "0x...", recipient: "unlink1...", amount: 1000n }],
});
const result = await wallet.executeTransfer(plans);

// Wait for confirmation
await waitForConfirmation(wallet, result.relayId);
```

### Withdraw

```typescript  theme={null}
// One-step withdrawal
const result = await wallet.withdraw({
  withdrawals: [{ token: "0x...", amount: 500n, recipient: "0xEOA" }],
});

// Or with preview
const plans = await wallet.planWithdraw({
  withdrawals: [{ token: "0x...", amount: 500n, recipient: "0xEOA" }],
});
const result = await wallet.executeWithdraw(plans);

// Wait for confirmation
await waitForConfirmation(wallet, result.relayId);
```

### Queries

```typescript  theme={null}
await wallet.getBalance("0xTokenAddress"); // bigint
await wallet.getBalances(); // Record<string, bigint>
await wallet.getHistory({ includeSelfSends: false }); // HistoryEntry[]
await wallet.getNotes(); // NoteRecord[]
```

### Sync

```typescript  theme={null}
await wallet.sync(); // Sync notes from chain
await wallet.sync({ forceFullResync: true }); // Full resync

wallet.startAutoSync(5000); // Auto-sync every 5 seconds
wallet.stopAutoSync();
```

### Burner Accounts

Burner accounts are BIP-44 derived EOAs for interacting with DeFi while maintaining privacy.

```typescript  theme={null}
const { address } = await wallet.burner.addressOf(0);
await wallet.burner.fund(0, { token: "0x...", amount: 1000n });
await wallet.burner.send(0, { to: "0x...", data: "0x..." });
await wallet.burner.sweepToPool(0, { token: "0x..." });
```
