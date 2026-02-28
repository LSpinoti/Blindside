# Blindside MVP Plan

## Product Thesis

Blindside is a private prediction market terminal for simple binary price markets on Monad testnet. Users keep funds in Unlink, fund one-off burner EOAs to interact with public market contracts, and sweep winnings back into Unlink after settlement. The chain only shows burner-level activity, while the app privately shows the user's true aggregate exposure, cost basis, and PnL.

This MVP should optimize for a clear hackathon demo:

- show an end-to-end private trading loop
- use Unlink in a way that is obvious in the UI
- deploy at least one Foundry contract on Monad
- use a real oracle-backed resolution path
- keep scope small enough to finish quickly

## MVP Goals

- Let a user create or import an Unlink wallet and view its private balance.
- Let the user fund a burner EOA from Unlink for a single market position.
- Let the burner place a `YES` or `NO` position on a binary MON/USD market.
- Let the app privately aggregate positions across burners into one account-level dashboard.
- Let an operator resolve the market using Pyth's MON/USD testnet feed.
- Let the user claim winnings from the burner and sweep proceeds back into Unlink.
- Expose private history and transaction status in a way that makes Unlink's role visible.

## Non-Goals For MVP

- No generalized order book, AMM, or secondary trading.
- No social feeds, comments, or public profile system.
- No multi-asset markets beyond MON/USD.
- No cross-chain bridging, fiat onramp, or account abstraction.
- No advanced market types such as range markets or scalar outcomes.
- No trustless decentralized market creation by end users.

## Core User Flow

1. User connects to Blindside and initializes an Unlink wallet with `useUnlink`.
2. User deposits MON into Unlink and sees a private vault balance.
3. User selects a live market and clicks `Fund burner + place trade`.
4. App derives a fresh burner index, funds it from Unlink, and sends a public transaction from that burner to the market contract.
5. Blindside records the burner address locally and in app state, linking it privately to the user account.
6. When the market resolves, the user claims from the burner and sweeps funds back into Unlink.
7. Dashboard updates private aggregate exposure, realized PnL, and full lifecycle history.

## Recommended MVP Market Design

Use a simple pari-mutuel binary market settled in native MON. This is the lowest-risk contract model for a short build.

- One market contract per question.
- Question example: `Will MON/USD settle above $X at YYYY-MM-DD HH:MM UTC?`
- Users send MON to buy `YES` or `NO` shares before expiry.
- Contract tracks total `yesPool`, `noPool`, and user stake per side.
- After expiry, an operator resolves the market to `YES` or `NO`.
- Winners claim a pro-rata share of the full pool.

Why this shape:

- no LP math
- no slippage engine
- no order matching
- easy to explain in a demo
- straightforward claim logic

## Smart Contract Scope

Deploy with Monad Foundry.

### Contracts

- `BinaryPriceMarket`
- optional `MarketFactory` only if time remains

### `BinaryPriceMarket` responsibilities

- store metadata: question, strike, cutoff, resolve timestamp
- accept MON for `buyYes()` and `buyNo()`
- reject entries after cutoff
- support `resolve()` using an oracle-fed settlement price
- support `claim()` for winning side
- emit events for position opens, resolution, and claims

### Event surface

- `PositionOpened(address burner, bool side, uint256 amount)`
- `MarketResolved(bool outcome, int64 settlementPrice, uint256 resolvedAt)`
- `Claimed(address burner, uint256 payout)`

### Resolution path

- Use Pyth's Monad testnet beta price feed contract because MON/USD is a beta feed.
- beta price feed contract: `0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5`
- beta Hermes endpoint: `https://hermes-beta.pyth.network`
- Operator fetches the update payload offchain and submits it when calling `resolve()`.

Pyth docs available at https://docs.pyth.network/price-feeds/core

## App Architecture

### Frontend

React + Vite + TypeScript.

- use `@unlink-xyz/react` for private wallet interactions
- use `viem` for burner EOA and market contract reads
- use `useUnlink` for wallet state, balances, deposit, withdraw, and confirmations
- use `useUnlinkHistory` for private vault history
- use `useTxStatus` for transaction tracking in the UI

Primary frontend modules:

- wallet bootstrap
- market list and detail page
- trade ticket
- private portfolio dashboard
- burner account registry
- activity log

### Backend API

Minimal Express service.

- serve market metadata and contract addresses
- prepare Pyth update payloads for the resolver flow
- optionally calculate cached aggregate metrics for faster dashboard loads
- keep admin-only endpoints for market resolution

This can stay thin. The frontend can still read most onchain state directly.

### Indexing Layer

Use a lightweight indexer service only for Blindside market events.

- recommended: Ponder or Envio
- index `PositionOpened`, `Claimed`, and `MarketResolved`
- store normalized event rows in Postgres
- query by burner address for faster portfolio and activity rendering

If time gets tight, ship without the indexer first and fall back to direct `viem` reads plus local mapping. The indexer is valuable, but the private trading loop is the true MVP.

## Data Model

### Private app state

- Unlink account metadata
- burner index to burner address mapping
- burner address to market position mapping
- private aggregate exposure by market
- private realized and unrealized PnL

This state should live in browser storage for MVP, because it is part of the privacy story. Avoid making the backend the source of truth for user identity linkage.

### Public onchain state

- burner balances
- burner trades
- market pools
- market resolution outcome
- claim payouts

## Service Layout

Use Dockerized services where practical:

- `frontend`: React app
- `api`: Express app
- `indexer`: Ponder or Envio worker
- `db`: Postgres for indexer and cached API reads

This matches the repo notes while keeping each responsibility isolated.

## Privacy Model

Blindside's privacy claim is specific and should stay precise:

- the user's Unlink wallet is private
- the user's public market interactions occur from burner EOAs, not their main wallet
- onchain observers can see burner activity
- onchain observers should not directly see the link between burner activity and the user's Unlink account
- aggregate exposure, portfolio totals, and cross-burner PnL are only shown inside the app

Important limitations to state clearly:

- this is address separation and private funding, not perfect anonymity
- repeated burner reuse weakens privacy
- timing and behavioral patterns can still create linkability

## Key Unlink Integrations

Build around features already present in the local docs.

- `useUnlink` for wallet lifecycle and private balances
- `requestDeposit` or `useDeposit` for funding the private pool
- `wallet.burner.addressOf()` to derive burner EOAs
- `wallet.burner.fund()` to move capital from Unlink to a burner
- `wallet.burner.send()` to submit market transactions from a burner
- `wallet.burner.sweepToPool()` to return funds and winnings to Unlink
- `useUnlinkHistory` to surface private vault history
- `useTxStatus` and `waitForConfirmation` for clear transaction progress

## Delivery Plan

### Phase 1: Contract and happy path

- implement `BinaryPriceMarket`
- deploy one market to Monad testnet with Foundry
- verify the contract
- write a small script for operator resolution using Pyth beta data

### Phase 2: Private wallet loop

- initialize Unlink provider
- add deposit flow
- add burner derivation and funding
- submit `buyYes` and `buyNo` through `wallet.burner.send()`

### Phase 3: Private portfolio layer

- store burner-to-user linkage locally
- compute aggregate exposure and PnL in the client
- show private vs public data separately in the dashboard

### Phase 4: Settlement and withdrawal

- add admin resolve action
- add user claim action
- add sweep-back-to-Unlink action
- reflect claim and sweep in history and PnL

### Phase 5: Hardening for demo

- improve error states
- add retry paths for failed transactions
- polish transaction progress and confirmations
- seed one resolved market and one open market for demo realism

## Demo Success Criteria

- A fresh user can create an Unlink wallet and see a private balance.
- The app can derive a burner and display its public address.
- A burner can place a visible public position into a Monad-deployed market.
- The app privately shows aggregate exposure that is not derivable from any single burner.
- A market can be resolved using the documented Pyth MON/USD beta path.
- Winnings can be claimed and swept back into Unlink.

## Main Risks And Mitigations

- Oracle integration risk: keep the contract resolution interface simple and test with one known feed path only.
- Overbuilt contract risk: avoid AMMs and use pari-mutuel accounting.
- Privacy confusion risk: explicitly label what is public and what is private in the UI.
- Indexer schedule risk: treat the indexer as secondary to the end-to-end trade loop.
- Burner key handling risk: derive and manage burners through Unlink APIs only; do not invent a separate wallet flow.

## Stretch Goals After MVP

- multiple concurrent markets
- a market factory for operator-created questions
- richer analytics such as win rate and exposure by time bucket
- optional relayer mode for gas abstraction
- more oracle-backed asset pairs beyond MON/USD
