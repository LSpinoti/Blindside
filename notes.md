# Notes

## Suggestions

### General

Feel free to read and write to .env . Currently, I have my private key (for smart contract deployment) and OpenAI API key for agents. If you need any other keys (RPC providers, etc), either fill them in yourself in .env and .env.example (if you know them) or leave it blank in .env.example.

The main sponsors are Unlink and Monad.

At least one smart contract **must** deployed on Monad using Monad Foundry (see monad-full.md). It is already installed in `~/.foundry/`. 

Feel free to download any packages you need using `pnpm`.

The project **must** be holistic, i.e. have no parts that I cannot complete in the short term.

All documentation for Unlink and Monad are available in docs/. `monad-full.md` is a large and comprehensive file of all of Monad's capabilities (1.4MB), so maybe slice through it instead of reading it all at once.

Target x402 agents, Stablecoin, or DeFi tracks, not Treasury, Payroll, and Neobank. Make something that goes beyond simple "Ghost Treasury Desk", or "Ghost Payroll Ops", etc. Also make it something that a CS student can explain. Going too deep into finance might make me seem incompetent in the demo. Prediction markets are hot. Install any packages you desire; do not limit yourself to the currently installed packages.

### Infra 

Search for infra / tooling ecosystem in monad-full.md before you begin building. Ask me to install it if necessary. Please use these!

Examples:

- Indexers
  - Envio
  - Ponder
  - Goldsky
- Cross-chain token bridges
  - Circle CCTP (USDC)
  - LayerZero (major ERC-20s)
  - Wormhole (SOL)
  - Chainlink CCIP (wrapped assets)
- Cross-chain swaps
  - jumper.exchange
  - Mayan Finance
- Oracles
  - Chainlink
  - Pyth
  - RedStone
- Wallets
  - Trust Wallet
  - MetaMask
  - Phantom (SOL native)
  - Rabby Wallet (EVM Native)
  - Safe (multi-sig)
  - Privy (embedded wallet)
  - thirdweb (embedded wallet)
- Account abstraction
  - Alchemy
  - thirdweb

### UX

The UX should be information dense, and look formal (square or low-radius edges, neutral colours, light and dark mode) rather than vibe-codey (overuse of gradients, large margins, draft submission boxes, etc.). Remember, Unlink is sponsoring this hackathon because they want to be a compliant and formal privacy provider. Since this is a hackathon and I will be demoing, the project should be almost centered around having strong UX that shows how Unlink is being used. Maybe having a list of addresses you own, some highlighted if they are private and on Unlink.

### Services

Should use Docker for dedicated services, such as an agent service, db service (always running in the background), indexer service, frontend service, backend/api service.
