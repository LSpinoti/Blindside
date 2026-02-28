> ## Documentation Index
> Fetch the complete documentation index at: https://docs.unlink.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# CLI

> Manage wallets, accounts, and private transactions from your terminal

The package `@unlink-xyz/cli` lets you manage wallets, accounts, and perform private transactions from your terminal.

<Note>
  For React apps, use [`@unlink-xyz/react`](/sdk/react) instead. For Node
  backends and scripts, use [`@unlink-xyz/node`](/sdk/node). For advanced or
  low-level usage, use
  [`@unlink-xyz/core`](https://www.npmjs.com/package/@unlink-xyz/core) and
  follow the [API reference](/sdk/api-reference) directly.
</Note>

## Quickstart

Create a wallet and send a private transfer in under 5 minutes.

<Steps>
  <Step title="Prerequisites">
    Make sure you have:

    * [Node.js](https://nodejs.org/) v18 or later
    * npm
  </Step>

  <Step title="Install">
    ```bash  theme={null}
    npm install -g @unlink-xyz/cli
    ```
  </Step>

  <Step title="Configure">
    <Tabs>
      <Tab title="Interactive (recommended)">
        ```bash  theme={null}
        unlink-cli config init
        ```

        Prompts for gateway URL, chain ID, pool address, and saves to `~/.unlink/config.json`.
      </Tab>

      <Tab title="Environment variables">
        ```bash  theme={null}
        export UNLINK_GATEWAY_URL=https://api.unlink.xyz
        export UNLINK_CHAIN_ID=10143
        export UNLINK_POOL_ADDRESS=0x0813da0a10328e5ed617d37e514ac2f6fa49a254
        ```
      </Tab>

      <Tab title=".env file">
        ```bash .env theme={null}
        UNLINK_GATEWAY_URL=https://api.unlink.xyz
        UNLINK_CHAIN_ID=10143
        UNLINK_POOL_ADDRESS=0x0813da0a10328e5ed617d37e514ac2f6fa49a254
        ```

        Then load it before running commands:

        ```bash  theme={null}
        source .env
        ```
      </Tab>
    </Tabs>
  </Step>

  <Step title="Create wallet and send">
    ```bash  theme={null}
    unlink-cli wallet create
    unlink-cli sync
    unlink-cli balance
    unlink-cli transfer --to unlink1... --token 0x... --amount 1000000000000000000
    ```
  </Step>
</Steps>

That's it. The CLI handles sync, proof generation, and transaction relay automatically.

### Common operations

<CardGroup cols={2}>
  <Card title="Create wallet" icon="wallet" href="#wallet">
    Generate a mnemonic and create your first account.
  </Card>

  <Card title="Deposit" icon="arrow-down-to-bracket" href="#deposit">
    Move tokens from a public address into your private account.
  </Card>

  <Card title="Send tokens" icon="paper-plane" href="#transfer">
    Send a private transfer to another Unlink address.
  </Card>

  <Card title="Withdraw" icon="arrow-up-from-bracket" href="#withdraw">
    Move tokens from your private account back to a public address.
  </Card>
</CardGroup>

***

## Full guide

Everything below covers installation options, all commands, configuration, and JSON output.

## Install

```bash  theme={null}
npm install -g @unlink-xyz/cli
```

## Configuration

All options can be set via CLI flags or environment variables.

| Flag                    | Env Var               | Description                                                                   |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `--gateway-url <url>`   | `UNLINK_GATEWAY_URL`  | Unlink gateway URL (REST API for indexer/broadcaster)                         |
| `--node-url <url>`      | `UNLINK_RPC_HTTP_URL` | Ethereum JSON-RPC URL for on-chain transactions (defaults to `--gateway-url`) |
| `--chain-id <id>`       | `UNLINK_CHAIN_ID`     | Chain ID                                                                      |
| `--pool-address <addr>` | `UNLINK_POOL_ADDRESS` | UnlinkPool contract address                                                   |
| `--private-key <key>`   | `UNLINK_PRIVATE_KEY`  | Private key for signing deposit transactions                                  |
| `--data-dir <path>`     | `UNLINK_DATA_DIR`     | Data directory (default: `~/.unlink`)                                         |
| `--json`                |                       | Output JSON instead of human-readable text                                    |

### Loading environment variables

The CLI does not auto-load `.env` files. Source your `.env` (from the monorepo root) before running commands:

```bash  theme={null}
source .env   # from monorepo root where .env lives
unlink-cli wallet status
```

Or inline:

```bash  theme={null}
set -a && source .env && set +a && unlink-cli wallet status
```

### Testnet (.env)

```bash  theme={null}
export UNLINK_GATEWAY_URL=https://api.unlink.xyz
export UNLINK_CHAIN_ID=10143
export UNLINK_POOL_ADDRESS=0x0813da0a10328e5ed617d37e514ac2f6fa49a254
export UNLINK_PRIVATE_KEY=<your-private-key>
```

<Note>
  `--gateway-url` points to the Unlink gateway, which routes to
  indexer/broadcaster APIs. ZK artifacts are fetched from the artifact CDN.
  `--node-url` points to the chain RPC for sending on-chain transactions. If
  only `--gateway-url` is set and it's a standard JSON-RPC endpoint,
  `--node-url` is not needed.
</Note>

## Commands

### Wallet

```bash  theme={null}
# Create a new wallet (generates BIP-39 mnemonic + first account)
unlink-cli wallet create

# Check if a wallet exists
unlink-cli wallet status

# Export recovery mnemonic
unlink-cli wallet export

# Import wallet from mnemonic
unlink-cli wallet import --mnemonic "word1 word2 ... word24"
echo "word1 word2 ..." | unlink-cli wallet import    # stdin also works
unlink-cli wallet import --mnemonic "..." --overwrite # replace existing wallet

# Delete wallet (irreversible)
unlink-cli wallet delete --yes
```

### Accounts

Each wallet can derive multiple accounts. Each account has a unique Unlink address (`unlink1...`).

```bash  theme={null}
# List all accounts
unlink-cli account list

# Show active account
unlink-cli account active

# Create a new account
unlink-cli account create

# Switch active account
unlink-cli account switch <index>
```

### Sync

Sync downloads on-chain events (deposits, transfers, withdrawals) for the active account. Run this before checking balances or notes.

```bash  theme={null}
unlink-cli sync
```

### Balances

```bash  theme={null}
# Show all token balances
unlink-cli balance

# Show balance for a specific token
unlink-cli balance 0xTokenAddress
```

### Deposit

Deposit tokens from a public address into your private account. The CLI automatically handles ERC20 approval if needed.

Requires: `--gateway-url`, `--node-url` (or `UNLINK_RPC_HTTP_URL`), `--chain-id`, `--pool-address`, `--private-key`

```bash  theme={null}
unlink-cli deposit --token 0xTokenAddress --amount 1000000000000000000
```

The deposit flow:

1. Checks ERC20 allowance; sends an `approve` transaction if insufficient
2. Generates cryptographic commitments via the SDK
3. Submits the deposit transaction on-chain
4. Reconciles the deposit with local state

### Transfer

Private transfer to another Unlink address. ZK proof is generated locally, relayed via the broadcaster.

Requires: `--gateway-url`, `--chain-id`, `--pool-address`

```bash  theme={null}
unlink-cli transfer \
  --to unlink1qy52x902c29f46pkrt5sq3guf7846d2hkxyjzhsmn3ypvred7xe7az53jwtfr9y2j9... \
  --token 0xTokenAddress \
  --amount 500000000000000000
```

### Withdraw

Withdraw tokens from your private account back to a public address.

Requires: `--gateway-url`, `--chain-id`, `--pool-address`

```bash  theme={null}
unlink-cli withdraw \
  --to 0xRecipientEOA \
  --token 0xTokenAddress \
  --amount 250000000000000000
```

### Transaction Status

Check the status of a relay (deposit, transfer, or withdrawal).

```bash  theme={null}
unlink-cli tx-status <relay-id>
```

Output includes: state (`pending`, `succeeded`, `failed`), tx hash, block number.

### History

```bash  theme={null}
# Show transaction history
unlink-cli history

# Include self-sends (change notes)
unlink-cli history --include-self-sends
```

### Notes

List all notes (UTXOs) for the active account.

```bash  theme={null}
unlink-cli notes
```

Each note shows: index, status (`spent`/`unspent`), token address, value.

### Config

```bash  theme={null}
# Show resolved configuration
unlink-cli config show
```

## JSON Output

Add `--json` to any command for machine-readable output:

```bash  theme={null}
unlink-cli --json wallet status
# {"exists":true}

unlink-cli --json balance
# {"balances":[{"token":"0x...","balance":"1000000000000000000"}]}

unlink-cli --json account list
# {"accounts":[{"index":0,"address":"unlink1...","masterPublicKey":"..."}],"activeIndex":0}
```

Errors in JSON mode are written to stderr:

```bash  theme={null}
unlink-cli --json balance  # without --chain-id
# stderr: {"error":"--chain-id or UNLINK_CHAIN_ID is required for this command"}
# exit code: 1
```

## Troubleshooting

**Command not found after install**: Make sure your global `node_modules/.bin` is on your `PATH`, or use `npx @unlink-xyz/cli` instead.

**Proof generation is slow**: ZK proofs take 5-30 seconds. This is normal.

**Balance not updating**: Run `unlink-cli sync` before checking balances.

**Cannot install package**: Run `npm login` first. Contact Unlink to get npm access.
