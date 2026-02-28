# Blindside

Blindside is a private prediction market terminal for Monad testnet.

- `Unlink` is the private vault.
- `Burners` are disposable public execution accounts.
- `BinaryPriceMarket` is the onchain settlement contract.
- `Pyth` provides the MON/USD resolution payload.

## Live deployment

- `MAR 31 / 0.0210`: `0x719BfAdA8caA300A26adfe0eCf54bDF08E1B330E`
- `APR 07 / 0.0235`: `0x17aF654E71AD3bD75d9D81A485a75Ee9dF87ec8A`
- `APR 14 / 0.0260`: `0xc8c4DfEBBfCEFC8faaCD1dD4f11C22E0930ec8aF`

Verification:

- Mar 31:
  https://testnet.monadvision.com/address/0x719BfAdA8caA300A26adfe0eCf54bDF08E1B330E
- Apr 07:
  https://testnet.monadvision.com/address/0x17aF654E71AD3bD75d9D81A485a75Ee9dF87ec8A
- Apr 14:
  https://testnet.monadvision.com/address/0xc8c4DfEBBfCEFC8faaCD1dD4f11C22E0930ec8aF

## Local commands

```bash
pnpm dev
pnpm build
pnpm deploy:market
pnpm resolve:market 0x719BfAdA8caA300A26adfe0eCf54bDF08E1B330E
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
