> ## Documentation Index
> Fetch the complete documentation index at: https://docs.unlink.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# React

> React hooks and components for adding private wallets to your app

The package `@unlink-xyz/react` provides React hooks for building private applications.

<Note>
  For Node.js backends and scripts, use [`@unlink-xyz/node`](/sdk/node). For
  terminal usage, use [`@unlink-xyz/cli`](/sdk/cli). For advanced or low-level
  usage, use
  [`@unlink-xyz/core`](https://www.npmjs.com/package/@unlink-xyz/core) and
  follow the [API reference](/sdk/api-reference) directly.
</Note>

## Quickstart

Add a private wallet to your React app in under 5 minutes.

<Steps>
  <Step title="Prerequisites">
    Make sure you have:

    * [Node.js](https://nodejs.org/) v18 or later
    * A package manager (npm, pnpm, or yarn)
    * A React 18+ or 19+ project

    Don't have a React project yet?

    <Tabs>
      <Tab title="Vite">
        ```bash  theme={null}
        npm create vite@latest my-app -- --template react-ts
        cd my-app
        ```
      </Tab>

      <Tab title="Next.js">
        ```bash  theme={null}
        npx create-next-app@latest my-app
        cd my-app
        ```
      </Tab>
    </Tabs>
  </Step>

  <Step title="Install">
    ```bash  theme={null}
    npm install @unlink-xyz/react
    ```
  </Step>

  <Step title="Wrap your app">
    ```tsx  theme={null}
    import { UnlinkProvider } from "@unlink-xyz/react";

    function App() {
      return (
        <UnlinkProvider chain="monad-testnet">
          <Wallet />
        </UnlinkProvider>
      );
    }
    ```
  </Step>

  <Step title="Build your wallet component">
    ```tsx  theme={null}
    import { useUnlink } from "@unlink-xyz/react";

    function Wallet() {
      const {
        ready, walletExists, activeAccount,
        createWallet, createAccount, balances, send
      } = useUnlink();

      if (!ready) return <div>Loading...</div>;

      // First visit: create wallet + account
      if (!walletExists) return <button onClick={() => createWallet()}>Create Wallet</button>;
      if (!activeAccount) return <button onClick={() => createAccount()}>Create Account</button>;

      return (
        <div>
          <p>Balance: {balances["0xToken"] || "0"}</p>
          <button onClick={() =>
            send([{ token: "0x...", recipient: "unlink1...", amount: 1000n }])
          }>
            Send
          </button>
        </div>
      );
    }
    ```
  </Step>
</Steps>

That's it. Your app handles sync, proof generation, and transaction relay automatically.

### Common operations

<CardGroup cols={2}>
  <Card title="Create wallet" icon="wallet" href="#wallet-setup">
    Generate a mnemonic and create a user's first account.
  </Card>

  <Card title="Deposit" icon="arrow-down-to-bracket" href="#deposit">
    Move tokens from a public address into a private account.
  </Card>

  <Card title="Send tokens" icon="paper-plane" href="#private-transfer">
    Send a private transfer to another Unlink address.
  </Card>

  <Card title="Withdraw" icon="arrow-up-from-bracket" href="#withdrawal">
    Move tokens from a private account back to a public address.
  </Card>
</CardGroup>

***

## Full guide

Everything below covers the complete API surface: provider config, all hooks, patterns, and utilities.

## Provider setup

```tsx  theme={null}
<UnlinkProvider chain="monad-testnet" autoSync={true}>
  <App />
</UnlinkProvider>
```

| Prop           | Type             | Default | Description                                                           |
| -------------- | ---------------- | ------- | --------------------------------------------------------------------- |
| `chain`        | `SupportedChain` | -       | Chain name — resolves chainId, gateway, pool, artifacts automatically |
| `gatewayUrl`   | `string`         | -       | Explicit gateway URL (alternative to `chain`)                         |
| `chainId`      | `number`         | -       | Target blockchain ID (required with `gatewayUrl`)                     |
| `poolAddress`  | `string`         | -       | Contract address (required with `gatewayUrl`)                         |
| `autoSync`     | `boolean`        | `true`  | Enable automatic balance sync                                         |
| `syncInterval` | `number`         | `5000`  | Sync interval in ms                                                   |
| `prover`       | `ProverConfig`   | -       | Artifact source override                                              |

<Note>
  `chain` and `gatewayUrl` are mutually exclusive. Use `chain` for hosted
  deployments (auto-resolves gateway URL, contract address, chain ID, and
  artifact versions). Use `gatewayUrl` + `chainId` + `poolAddress` for local
  development or custom deployments.
</Note>

## Hooks

### useUnlink

```tsx  theme={null}
const {
  // Wallet State
  wallet, // UnlinkWallet | null
  walletExists, // boolean
  ready, // boolean
  busy, // boolean
  status, // string
  syncError, // string | null
  error, // UnlinkError | null

  // Account State
  accounts, // AccountInfo[]
  activeAccount, // Account | null
  activeAccountIndex, // number | null

  // Balance State
  chainId, // number | null
  notes, // WalletNote[]
  balances, // Record<string, bigint>

  // Pending Operations
  pendingDeposits, // PendingDepositJob[]
  pendingTransfers, // PendingTransferJob[]
  pendingWithdrawals, // PendingWithdrawJob[]

  // Wallet Actions
  createWallet, // () => Promise<{ mnemonic: string }>
  importWallet, // (mnemonic: string) => Promise<void>
  exportMnemonic, // () => Promise<string>
  clearWallet, // () => Promise<void>

  // Account Actions
  createAccount, // (index?: number) => Promise<Account>
  switchAccount, // (index: number) => Promise<void>

  // Transfer Actions
  send, // (params: TransferInput[]) => Promise<TransferResult>
  planTransfer, // (params: TransferInput[]) => Promise<TransferPlanResult>
  executeTransfer, // (plan: TransferPlanResult) => Promise<TransferResult>

  // Deposit Actions
  requestDeposit, // (params: DepositInput[]) => Promise<DepositRelayResult>

  // Withdraw Actions
  requestWithdraw, // (params: WithdrawInput[]) => Promise<WithdrawResult>
  planWithdraw, // (params: WithdrawInput[]) => Promise<WithdrawPlanResult>
  executeWithdraw, // (plan: WithdrawPlanResult) => Promise<WithdrawResult>

  // Sync Actions
  refresh, // () => Promise<void>
  forceResync, // () => Promise<void>

  // Error Actions
  clearError, // () => void

  // Transaction Status Actions
  getTxStatus, // (txId: string) => Promise<TxStatus>
  waitForConfirmation, // (txId: string, options?) => Promise<TxStatus>
} = useUnlink();
```

#### Accessing Configuration

Configuration is provided via `UnlinkProvider` props. Keep these values in app config and pass them to the provider:

```tsx  theme={null}
<UnlinkProvider chain="monad-testnet">
  <App />
</UnlinkProvider>
```

### useUnlinkBalance

```tsx  theme={null}
const { balance, ready, loading } = useUnlinkBalance("0xTokenAddress");
```

### useUnlinkBalances

```tsx  theme={null}
const { balances, ready, loading } = useUnlinkBalances();
```

### useUnlinkHistory

```tsx  theme={null}
const { history, loading, error, refresh } = useUnlinkHistory({
  includeSelfSends: false, // optional
});
// history: HistoryEntry[]
// loading: boolean
// error: Error | null
// refresh: () => Promise<void>
```

### useTxStatus

Track a transaction's status in real-time.

```tsx  theme={null}
import { useTxStatus } from "@unlink-xyz/react";

const { state, txHash, blockNumber, error, isLoading, refresh } =
  useTxStatus(relayId);
```

### useDeposit

Mutation hook for deposits with built-in loading/error state.

```tsx  theme={null}
import { useDeposit } from "@unlink-xyz/react";

const { mutate, isPending, isSuccess, isError, error, data, reset } =
  useDeposit();

await mutate([{ token: "0x...", amount: 1000000n, depositor: "0xYourEOA" }]);
```

### useTransfer

Mutation hook for transfers.

```tsx  theme={null}
import { useTransfer } from "@unlink-xyz/react";

const { mutate, isPending, isSuccess, isError, error, data, reset } =
  useTransfer();

await mutate([{ token: "0x...", recipient: "unlink1...", amount: 1000n }]);
```

### useWithdraw

Mutation hook for withdrawals.

```tsx  theme={null}
import { useWithdraw } from "@unlink-xyz/react";

const { mutate, isPending, isSuccess, isError, error, data, reset } =
  useWithdraw();

await mutate([{ token: "0x...", amount: 500n, recipient: "0xRecipientEOA" }]);
```

## Common Patterns

### Wallet Setup

```tsx  theme={null}
const { ready, walletExists, activeAccount, createWallet, createAccount } =
  useUnlink();

if (!walletExists) {
  const { mnemonic } = await createWallet();
  // Show mnemonic to user for backup
}

if (!activeAccount) {
  await createAccount();
}
```

### Private Transfer

```tsx  theme={null}
const { send, busy } = useUnlink();

await send([
  { token: "0xTokenAddress", recipient: "unlink1...", amount: 1000n },
]);
```

### Transfer with Preview

```tsx  theme={null}
const { planTransfer, executeTransfer } = useUnlink();

// Preview
const plans = await planTransfer([{ token, recipient, amount }]);
console.log("Prepared", plans.length, "transaction plan(s)");

// Execute after user confirms
await executeTransfer(plans);
```

### Withdrawal

```tsx  theme={null}
const { requestWithdraw } = useUnlink();

await requestWithdraw([
  { token: "0xTokenAddress", recipient: "0xEthereumAddress", amount: 500n },
]);
```

### Deposit

```tsx  theme={null}
const { requestDeposit } = useUnlink();

const deposit = await requestDeposit([
  { token, amount, depositor: userAddress },
]);

// Submit with wallet provider
await ethereum.request({
  method: "eth_sendTransaction",
  params: [{ to: deposit.to, data: deposit.calldata, from: userAddress }],
});
```

### Multi-Account

```tsx  theme={null}
const { accounts, activeAccountIndex, createAccount, switchAccount } =
  useUnlink();

await createAccount(); // Create new account
await switchAccount(1); // Switch to account index 1
```

### Backup & Recovery

```tsx  theme={null}
const { exportMnemonic, importWallet } = useUnlink();

const mnemonic = await exportMnemonic();
await importWallet(mnemonic);
```

### Balance Display

```tsx  theme={null}
function TokenBalance({ token, symbol }) {
  const { balance, ready } = useUnlinkBalance(token);
  if (!ready) return <div>Loading...</div>;
  return (
    <div>
      {symbol}: {formatAmount(balance, 18)}
    </div>
  );
}
```

### Transaction History

```tsx  theme={null}
import { useUnlinkHistory } from "@unlink-xyz/react";

function History() {
  const { history, loading, refresh } = useUnlinkHistory();
  if (loading) return <div>Loading...</div>;
  return (
    <div>
      <h3>
        History <button onClick={refresh}>↻</button>
      </h3>
      {history.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.kind}</strong> - {entry.status}
          {entry.amounts.map(({ token, delta }) => (
            <div key={token}>
              {token}: {delta}
            </div>
          ))}
        </li>
      ))}
    </div>
  );
}
```

### Transaction Tracking

Wait for a transaction to confirm after sending:

```tsx  theme={null}
import { TimeoutError, TransactionFailedError } from "@unlink-xyz/react";

const { send, waitForConfirmation } = useUnlink();

const result = await send([{ token, recipient, amount }]);

try {
  const status = await waitForConfirmation(result.relayId, { timeout: 60000 });
  // status.state === "succeeded"
} catch (e) {
  if (e instanceof TimeoutError) {
    // Transaction still pending after timeout
  } else if (e instanceof TransactionFailedError) {
    // Transaction failed on-chain
  }
}
```

Or track status reactively with `useTxStatus`:

```tsx  theme={null}
import { useTxStatus } from "@unlink-xyz/react";

function TxTracker({ relayId }) {
  const { state, txHash, isLoading } = useTxStatus(relayId);
  if (isLoading) return <div>Checking...</div>;
  return (
    <div>
      Status: {state} {txHash && `(${txHash})`}
    </div>
  );
}
```

### Error Handling

Use structured errors from the `error` state:

```tsx  theme={null}
const { error, clearError } = useUnlink();

if (error) {
  // error.code: "VALIDATION_ERROR" | "PROOF_ERROR" | "NETWORK_ERROR" | ...
  // error.message: human-readable description
  // error.operation: which action triggered it
  showError(error.message);
  clearError();
}
```

## Utilities

```tsx  theme={null}
import {
  computeBalances,
  decodeAddress,
  encodeAddress,
  formatAmount,
  normalizeAddress,
  parseAmount,
  parseZkAddress,
  randomHex,
  shortenHex,
} from "@unlink-xyz/react";

formatAmount(1500000n, 6); // "1.5"
parseAmount("1.5", 6); // 1500000n
shortenHex("0x1234...ef", 4); // "0x1234...ef"

const zkAddress = encodeAddress(account.masterPublicKey);
const mpk = decodeAddress(zkAddress);
```

## TypeScript Types

```typescript  theme={null}
import type {
  Account,
  AccountInfo,
  Chain,
  DepositInput,
  HistoryEntry,
  NoteRecord,
  ParsedZkAddress,
  PendingDepositJob,
  PendingTransferJob,
  PendingWithdrawJob,
  TransferInput,
  TransferPlanResult,
  TransferResult,
  TxState,
  TxStatus,
  UnlinkActions,
  UnlinkContextValue,
  UnlinkError,
  UnlinkErrorCode,
  UnlinkErrorOperation,
  UnlinkState,
  UnlinkWallet,
  WalletNote,
  WalletSDKEvent,
  WithdrawInput,
  WithdrawPlanResult,
  WithdrawResult,
} from "@unlink-xyz/react";
```