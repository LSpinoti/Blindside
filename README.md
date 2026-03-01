# Blindside

Blindside is a private prediction market terminal for Monad testnet.

- `Unlink` is the private vault.
- `Burners` are disposable public execution accounts.
- `BinaryPriceMarket` is the onchain settlement contract.
- `Pyth` provides the MON/USD resolution payload.

## Tracked deployments

The tracked BTC, ETH, SOL, and MON market addresses are written to
`contracts/deployments/tracked-markets.json` whenever you run `pnpm deploy:market`.

## Local commands

```bash
pnpm dev
pnpm build
pnpm deploy:market
pnpm resolve:market <market-address>
```

## Services

- `frontend`: Vite + React terminal UI in `src/`
- `api`: Express metadata and Pyth payload API in `server/`
- `db`: Postgres service reserved for the next indexing pass via Docker
- `contracts`: Foundry project in `contracts/`

## Docker

```bash
docker compose up --build
```
