# Blindside

Blindside is a private prediction market terminal for Monad testnet.

- `Unlink` is the private vault.
- `Burners` are disposable public execution accounts.
- `BinaryPriceMarket` is the onchain settlement contract.
- `Pyth` provides the MON/USD resolution payload.

## Live deployment

- Contract: `0x27Cf059b318C287684992a5bae7919fdaff5D205`
- Question: `Will MON/USD settle above $0.0210 at 2026-03-31 16:00 UTC?`

Verification:

- MonadVision: https://testnet.monadvision.com/address/0x27Cf059b318C287684992a5bae7919fdaff5D205
- SocialScan: https://monad-testnet.socialscan.io/address/0x27Cf059b318C287684992a5bae7919fdaff5D205
- Monadscan: https://testnet.monadscan.com/address/0x27Cf059b318C287684992a5bae7919fdaff5D205

## Local commands

```bash
pnpm dev
pnpm build
pnpm deploy:market
pnpm resolve:market
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
