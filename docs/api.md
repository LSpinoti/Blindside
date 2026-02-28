> ## Documentation Index
> Fetch the complete documentation index at: https://docs.unlink.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# API Reference

> Complete reference for Unlink SDK types, hooks, and utilities

This page provides a complete reference for all exports from the Unlink SDK packages.

## React Hooks

### useUnlink

The main hook providing all wallet functionality.

```typescript  theme={null}
import { useUnlink } from "@unlink-xyz/react";

const {
  // State
  wallet, // UnlinkWallet | null
  walletExists, // boolean
  ready, // boolean
  busy, // boolean
  status, // string
  syncError, // string | null
  error, // UnlinkError | null

  // Account
  accounts, // AccountInfo[]
  activeAccount, // Account | null
  activeAccountIndex, // number | null

  // Balance
  chainId, // number
  notes, // WalletNote[]
  balances, // Record<string, bigint>

  // Pending Jobs
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

### useUnlinkBalance

Get balance for a specific token.

```typescript  theme={null}
import { useUnlinkBalance } from "@unlink-xyz/react";

const { balance, ready, loading } = useUnlinkBalance(tokenAddress: string);
// balance: bigint (0n if not found)
// ready: boolean (SDK initialized)
// loading: boolean (fetching data)
```

### useUnlinkBalances

Get all token balances.

```typescript  theme={null}
import { useUnlinkBalances } from "@unlink-xyz/react";

const { balances, ready, loading } = useUnlinkBalances();
// balances: Record<string, bigint>
```

### useUnlinkHistory

Get transaction history with automatic updates.

```typescript  theme={null}
import { useUnlinkHistory } from "@unlink-xyz/react";

const { history, loading, error, refresh } = useUnlinkHistory(options?: {
  includeSelfSends?: boolean;
});
// history: HistoryEntry[]
// loading: boolean
// error: Error | null
// refresh: () => Promise<void>
```

### useTxStatus

Track the status of a transaction in real-time via events and polling.

```typescript  theme={null}
import { useTxStatus } from "@unlink-xyz/react";

const { state, txHash, blockNumber, error, isLoading, refresh } =
  useTxStatus(txId: string | null);
// state: TxState | null ("pending" | "broadcasting" | "submitted" | "succeeded" | ...)
// txHash: string | null
// blockNumber: number | null
// error: string | null
// isLoading: boolean
// refresh: () => Promise<void>
```

Pass `null` to disable tracking. The hook automatically subscribes to `tx-status-changed` events from the wallet.

### useDeposit

Mutation hook for deposits. Wraps `requestDeposit` with loading/error state.

```typescript  theme={null}
import { useDeposit } from "@unlink-xyz/react";

const { mutate, data, isPending, isSuccess, isError, error, reset } =
  useDeposit();

// Execute
await mutate([{ token: "0x...", amount: 1000000n, depositor: "0xYourEOA" }]);
// data: DepositRelayResult (after success)
```

### useTransfer

Mutation hook for transfers. Wraps `send` with loading/error state.

```typescript  theme={null}
import { useTransfer } from "@unlink-xyz/react";

const { mutate, data, isPending, isSuccess, isError, error, reset } =
  useTransfer();

// Execute
await mutate([{ token: "0x...", recipient: "unlink1...", amount: 1000n }]);
// data: TransferResult (after success)
```

### useWithdraw

Mutation hook for withdrawals. Wraps `requestWithdraw` with loading/error state.

```typescript  theme={null}
import { useWithdraw } from "@unlink-xyz/react";

const { mutate, data, isPending, isSuccess, isError, error, reset } =
  useWithdraw();

// Execute
await mutate([{ token: "0x...", amount: 500n, recipient: "0xRecipientEOA" }]);
// data: WithdrawResult (after success)
```

### useOperationMutation

Generic mutation state machine for building custom hooks.

```typescript  theme={null}
import { useOperationMutation } from "@unlink-xyz/react";

const { mutate, data, isPending, isSuccess, isError, error, reset } =
  useOperationMutation(async (params: MyParams) => {
    // Your async operation
    return result;
  });
```

Returns `{ mutate, data, isPending, isSuccess, isError, error, reset }`. Prevents concurrent mutations automatically.

## Types

### Account Types

```typescript  theme={null}
// Full account with all keys
interface Account {
  index: number;
  masterPublicKey: bigint;
  spendingKey: bigint;
  viewingKey: { sk: Uint8Array; pk: Uint8Array };
  nullifyingKey: bigint;
}

// Account summary (for listing)
interface AccountInfo {
  index: number;
  masterPublicKey: bigint;
  address: string; // Bech32m address (unlink1...)
}
```

### Transaction Types

```typescript  theme={null}
// Transfer parameters (React layer)
interface TransferInput {
  token: string; // Token contract address
  recipient: string; // Unlink address (unlink1...)
  amount: bigint; // Amount in smallest unit
}

// Transfer result
interface TransferResult {
  relayId: string; // Broadcaster relay ID
  plans: TransferPlanResult;
  transactResult: TransactRelayResult;
}

// Transfer plan (for preview)
type TransferPlanResult = TransactionPlan[];
```

```typescript  theme={null}
// Deposit parameters (React layer)
interface DepositInput {
  token: string; // Token contract address
  amount: bigint; // Amount to deposit
  depositor: string; // Your Ethereum address
}

// Deposit result
interface DepositRelayResult {
  relayId: string; // For tracking
  to: string; // Contract address
  calldata: string; // Transaction data
  value: bigint; // ETH value to send
  commitments: DepositCommitmentInfo[];
}
```

```typescript  theme={null}
// Withdraw parameters (React layer)
interface WithdrawInput {
  token: string; // Token contract address
  recipient: string; // Ethereum address (0x...)
  amount: bigint; // Amount to withdraw
}

// Withdraw result
interface WithdrawResult {
  relayId: string;
  plans: WithdrawPlanResult;
  transactResult: TransactRelayResult;
}

// Withdraw plan (for preview)
type WithdrawPlanResult = WithdrawalPlan[];
```

### Note Types

```typescript  theme={null}
// Note stored in database
interface NoteRecord {
  chainId: number;
  index: number; // Index in merkle tree
  token: string;
  value: string; // Amount as string
  commitment: string;
  npk: string; // Nullifier public key
  mpk: string; // Master public key
  random: string;
  nullifier: string;
  spentAtIndex?: number; // Set when spent
}

// Note for display
interface WalletNote {
  chainId: number;
  index: number;
  token: string;
  value: bigint;
  commitment: string;
  npk: string;
  mpk: string;
  random: string;
  nullifier: string;
  spentAtIndex?: number;
}
```

### History Types

```typescript  theme={null}
interface HistoryEntry {
  id: string;
  kind: "deposit" | "transfer" | "withdraw";
  status: "pending" | "confirmed" | "failed";
  amounts: Array<{
    token: string;
    delta: bigint; // Positive = received, negative = sent
  }>;
  timestamp?: number;
  relayId?: string;
}
```

### Event Types

```typescript  theme={null}
type WalletSDKEvent =
  | { type: "wallet-created" }
  | { type: "account-created"; index: number }
  | { type: "account-switched"; index: number }
  | { type: "notes-updated"; chainId: number }
  | { type: "sync-error"; error: string }
  | TxStatusChangedEvent;

type TxStatusChangedEvent = {
  type: "tx-status-changed";
  txId: string;
  state: TxState;
  previousState: TxState | null;
  txHash?: string;
  blockNumber?: number;
  error?: string;
};
```

### Transaction Status Types

```typescript  theme={null}
// Transaction state (from broadcaster)
type TxState =
  | "pending"
  | "broadcasting"
  | "submitted"
  | "succeeded"
  | "reverted"
  | "failed"
  | "dead";

// Status information for a transaction
type TxStatus = {
  txId: string;
  state: TxState;
  txHash?: string;
  blockNumber?: number;
  error?: string;
};

// Result from useTxStatus hook
type UseTxStatusResult = {
  state: TxState | null;
  txHash: string | null;
  blockNumber: number | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

// Options for waitForConfirmation
type WaitForConfirmationOptions = {
  timeout?: number; // Default: 300000 (5 minutes)
};
```

### Pending Job Types

```typescript  theme={null}
type PendingJobBase = {
  txId: string;
  status: "pending" | "confirmed" | "failed";
  chainId: number;
  token: string;
  amount: bigint;
  startedAt: number;
  txHash?: string;
  confirmedAt?: number;
};

type PendingDepositJob = PendingJobBase & { commitment?: string };
type PendingTransferJob = PendingJobBase & { recipient: string };
type PendingWithdrawJob = PendingJobBase & { recipient: string };
```

### Error Types

```typescript  theme={null}
// Structured error from the Unlink context
type UnlinkError = {
  code: UnlinkErrorCode;
  message: string;
  operation: UnlinkErrorOperation;
  timestamp: number;
  details?: unknown;
};

type UnlinkErrorCode =
  | "UNKNOWN"
  | "SDK_NOT_INITIALIZED"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "PROOF_ERROR"
  | "TIMEOUT"
  | "TRANSACTION_FAILED";

type UnlinkErrorOperation =
  | "init"
  | "createWallet"
  | "importWallet"
  | "clearWallet"
  | "createAccount"
  | "switchAccount"
  | "send"
  | "executeTransfer"
  | "requestDeposit"
  | "requestWithdraw"
  | "executeWithdraw"
  | "refresh"
  | "forceResync";

// Thrown when waitForConfirmation times out
class TimeoutError extends Error {
  readonly txId: string;
  readonly timeout: number;
}

// Thrown when a transaction reaches a failed state
class TransactionFailedError extends Error {
  readonly txId: string;
  readonly state: TxState;
  readonly reason?: string;
}
```

## Utility Functions

### Amount Formatting

```typescript  theme={null}
import { formatAmount, parseAmount } from "@unlink-xyz/react";

// Format bigint with decimals
formatAmount(1000000n, 6); // "1.0"
formatAmount(1500000n, 6); // "1.5"
formatAmount(1234567890n, 18); // "0.00000000123456789"

// Parse decimal string to bigint
parseAmount("1.5", 6); // 1500000n
parseAmount("0.001", 18); // 1000000000000000n
```

### Address Utilities

```typescript  theme={null}
import {
  decodeAddress,
  encodeAddress,
  normalizeAddress,
  parseZkAddress,
  shortenHex,
} from "@unlink-xyz/react";

// Encode master public key to Unlink address
const address = encodeAddress(masterPublicKey);
// Returns: "unlink1qp5x2r8..."

// Decode Unlink address to master public key
const mpk = decodeAddress("unlink1qp5x2r8...");
// Returns: bigint

// Parse and validate Unlink address
const parsed = parseZkAddress("unlink1qp5x2r8...");
// Returns: { masterPublicKey: bigint, ... }

// Normalize Ethereum address (lowercase)
normalizeAddress("0xAbCdEf...");
// Returns: "0xabcdef..."

// Shorten hex for display
shortenHex("0x1234567890abcdef", 4);
// Returns: "0x1234...cdef"
```

### Balance Computation

```typescript  theme={null}
import { computeBalances } from "@unlink-xyz/react";

// Compute balances from notes
const notes = await wallet.getNotes();
const balances = computeBalances(notes);
// Returns: { "0xTokenA": 1000n, "0xTokenB": 500n }
```

### Random Generation

```typescript  theme={null}
import { randomHex } from "@unlink-xyz/react";

// Generate random hex string
const random = randomHex(32);
// Returns: "0xa1b2c3d4e5f6..."
```

## Provider Props

```typescript  theme={null}
// Either provide chain or explicit gatewayUrl + chainId + poolAddress
type UnlinkConfig = UnlinkConfigBase &
  (
    | {
        chain: SupportedChain;
        poolAddress?: string;
        chainId?: never;
        gatewayUrl?: never;
      }
    | {
        chainId: number;
        gatewayUrl: string;
        poolAddress: string;
        chain?: never;
      }
  );

type UnlinkConfigBase = {
  syncInterval?: number; // Default: 5000 (ms)
  autoSync?: boolean; // Default: true
  prover?: { artifactSource?: { baseUrl?: string; version?: string } };
};
```

| Prop           | Type             | Default | Description                                                           |
| -------------- | ---------------- | ------- | --------------------------------------------------------------------- |
| `chain`        | `SupportedChain` | -       | Chain name — resolves chainId, gateway, pool, artifacts automatically |
| `chainId`      | `number`         | -       | Target blockchain ID (required with `gatewayUrl`)                     |
| `gatewayUrl`   | `string`         | -       | Explicit gateway URL (alternative to `chain`)                         |
| `poolAddress`  | `string`         | -       | Contract address (required with `gatewayUrl`)                         |
| `autoSync`     | `boolean`        | `true`  | Enable automatic balance sync                                         |
| `syncInterval` | `number`         | `5000`  | Sync interval in ms                                                   |
| `prover`       | `ProverConfig`   | -       | Artifact source override                                              |

## UnlinkWallet Instance Methods

For `@unlink-xyz/core`'s `UnlinkWallet` class, used directly in non-React frameworks.

### wallet.seed

```typescript  theme={null}
wallet.seed.exists(): Promise<boolean>
wallet.seed.create(): Promise<{ mnemonic: string }>
wallet.seed.importMnemonic(mnemonic: string, opts?: { overwrite?: boolean }): Promise<void>
wallet.seed.exportMnemonic(): Promise<string>
wallet.seed.delete(): Promise<void>
```

### wallet.accounts

```typescript  theme={null}
wallet.accounts.list(): Promise<AccountInfo[]>
wallet.accounts.get(index: number): Promise<Account | null>
wallet.accounts.create(index?: number): Promise<Account>
wallet.accounts.getActive(): Promise<Account | null>
wallet.accounts.getActiveIndex(): Promise<number | null>
wallet.accounts.setActive(index: number): Promise<void>
```

### Core Operations

```typescript  theme={null}
wallet.deposit(params: SimpleDepositParams): Promise<DepositRelayResult>
wallet.confirmDeposit(relayId: string): Promise<DepositSyncResult>
wallet.transfer(params: SimpleTransferParams): Promise<TransferResult>
wallet.planTransfer(params: SimpleTransferParams): Promise<TransferPlanResult>
wallet.executeTransfer(plans: TransferPlanResult): Promise<TransferResult>
wallet.withdraw(params: SimpleWithdrawParams): Promise<WithdrawResult>
wallet.planWithdraw(params: SimpleWithdrawParams): Promise<WithdrawPlanResult>
wallet.executeWithdraw(plans: WithdrawPlanResult): Promise<WithdrawResult>
wallet.confirmTransaction(relayId: string): Promise<TransactSyncResult>
```

### Queries

```typescript  theme={null}
wallet.getBalance(token: string): Promise<bigint>
wallet.getBalances(): Promise<Record<string, bigint>>
wallet.getHistory(opts?: { includeSelfSends?: boolean }): Promise<HistoryEntry[]>
wallet.getNotes(): Promise<NoteRecord[]>
```

### Sync

```typescript  theme={null}
wallet.sync(opts?: { forceFullResync?: boolean }): Promise<void>
wallet.startAutoSync(intervalMs?: number): void
wallet.stopAutoSync(): void
```

### Transaction Status

```typescript  theme={null}
wallet.getTxStatus(txId: string): Promise<RelayStatusResponse>
wallet.trackTx(txId: string): void
wallet.untrackTx(txId: string): void
```

### Events

```typescript  theme={null}
wallet.on(handler: (event: WalletSDKEvent) => void): () => void
// Returns unsubscribe function
```

### wallet.burner

```typescript  theme={null}
wallet.burner.addressOf(index: number): Promise<BurnerAccount>
wallet.burner.send(index: number, tx: BurnerSendParams): Promise<{ txHash: string }>
wallet.burner.exportKey(index: number): Promise<string>
wallet.burner.fund(index: number, params: { token: string; amount: bigint }): Promise<WithdrawResult>
wallet.burner.sweepToPool(index: number, params: { token: string; amount?: bigint }): Promise<{ txHash: string }>
wallet.burner.getTokenBalance(address: string, token: string): Promise<bigint>
wallet.burner.getBalance(address: string): Promise<bigint>
```

## Error Handling

Use structured `UnlinkError` from the `useUnlink` hook:

```typescript  theme={null}
const { error, clearError } = useUnlink();

if (error) {
  switch (error.code) {
    case "VALIDATION_ERROR":
      // Invalid input (bad address, amount, etc.)
      break;
    case "PROOF_ERROR":
      // ZK proof generation failed
      break;
    case "NETWORK_ERROR":
      // Gateway/broadcaster unreachable
      break;
    case "TIMEOUT":
      // Operation timed out
      break;
    case "TRANSACTION_FAILED":
      // On-chain transaction failed
      break;
    case "SDK_NOT_INITIALIZED":
      // Wallet not ready yet
      break;
  }
  // error.message: human-readable description
  // error.operation: which action triggered it
  // error.timestamp: when it occurred
  clearError(); // Reset error state
}
```

For `waitForConfirmation`, catch specific error classes:

```typescript  theme={null}
import { TimeoutError, TransactionFailedError } from "@unlink-xyz/react";

try {
  const status = await waitForConfirmation(relayId, { timeout: 60000 });
} catch (e) {
  if (e instanceof TimeoutError) {
    // e.txId, e.timeout
  } else if (e instanceof TransactionFailedError) {
    // e.txId, e.state, e.reason
  }
}
```

## Constants

```typescript  theme={null}
// Default sync interval
const DEFAULT_SYNC_INTERVAL_MS = 5000;

// Default waitForConfirmation timeout
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 300000; // 5 minutes

// Terminal transaction states
const TERMINAL_TX_STATES = ["succeeded", "reverted", "failed", "dead"];

// Supported chains
type SupportedChain = "monad-testnet";
```
