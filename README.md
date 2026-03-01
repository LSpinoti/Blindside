# Blindside

Blindside is a private prediction market terminal for Monad testnet.

- `Unlink` is the private vault.
- `Burners` are disposable public execution accounts.
- `BinaryPriceMarket` is the onchain settlement contract.
- `Pyth` provides the price resolution payloads.

## Tracked deployments

The tracked BTC, ETH, SOL, and XRP market addresses are written to
`contracts/deployments/tracked-markets.json` whenever you run `pnpm deploy:market`.

## Local commands

```bash
pnpm dev
pnpm dev:no-agents
pnpm build
pnpm deploy:market
pnpm resolve:market <market-address>
```

## Services

- `frontend`: Vite + React terminal UI in `src/`
- `api`: Express metadata and Pyth payload API in `server/`
- `db`: Postgres service reserved for the next indexing pass via Docker
- `contracts`: Foundry project in `contracts/`

## Demo liquidity

The API process now starts two tiny demo agents in the background whenever a live
market address is configured. Their keys live in `server/demo-agent-wallets.json`
so you can fund them directly with MON on testnet before a demo.

- `pnpm dev` or `pnpm dev:with-agents`: run the full app with demo agents enabled
- `pnpm dev:no-agents`: run the full app with demo agents disabled
- `pnpm start:api:with-agents`: run only the built API with demo agents enabled
- `pnpm start:api:no-agents`: run only the built API with demo agents disabled

## Docker

```bash
docker compose up --build
```
