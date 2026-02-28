# Notes

## Suggestions

### General

Feel free to read and write to .env . Currently, I have my private key (for smart contract deployment) and OpenAI API key for agents. If you need any other keys (RPC providers, etc), either fill them in yourself in .env and .env.example (if you know them) or leave it blank in .env.example.

Ideally, at least one smart contract is deployed on Monad.

Feel free to download any packages you need using `pnpm`.

The project **must** be holistic, i.e. have no parts that I cannot complete in the short term.

All documentation for Unlink and Monad are available in docs/. `monad-full.md` is a large and comprehensive file of all of Monad's capabilities (1.4MB), so maybe slice through it instead of reading it all at once.

Target Neobank, x402 agents, Stablecoin, or DeFi tracks, not Treasury and Payroll. Make something that goes beyond simple "Ghost Treasury Desk", or "Ghost Payroll Ops", etc.

### UX

The UX should be information dense, and look formal (square or low-radius edges, neutral colours, light and dark mode) rather than vibe-codey (overuse of gradients, large margins, draft submission boxes, etc.). Remember, Unlink is sponsoring this hackathon because they want to be a compliant and formal privacy provider. Since this is a hackathon and I will be demoing, the project should be almost centered around having strong UX that shows how Unlink is being used. Maybe having a list of addresses you own, some highlighted if they are private and on Unlink. Just spitballing.

### Services

Should use Docker for dedicated services, such as an agent service, db service (always running in the background), indexer service, frontend service, backend/api service.

## Features

Any project idea **must** be built using all of the features listed for each technology listed below. For example, it is **critical** that the project takes advantage of Monad's fast block time and finality. In the README.md you make, highlight how each technology is used.

### Unlink

### Monad

- Fast block time and finality (~400ms block time and ~800ms finality)
  - Note: this is good for x402, since it means APIs can be confident that they're paid a lot quicker and return the data faster
- ERC-8004 Agents
  - Uses both the Identity registry and the Reputation registry