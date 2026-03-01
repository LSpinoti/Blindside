# Blindside 3-Minute Demo Script

Estimated runtime: about 3 minutes

## Script

Today I am showing **Blindside**, a private prediction market terminal built on **Monad testnet**. Before the product itself, the motivation is important: a professional trader may need to protect an active strategy, a founder or executive may need to avoid signaling, a treasury manager may need to keep risk exposure private, and any high-visibility operator may need to avoid leaking every move on a public ledger.

The core idea is simple: we want the speed of onchain trading, but without forcing the user's primary public wallet to be the wallet that visibly interacts with the market.

The flow starts with a normal **MetaMask** wallet. That is the familiar wallet the user already has, and in our product it acts as the public funding entry point, not the trading identity.

From there, **Unlink** is the privacy vault. In this codebase, the user funds an **Unlink vault** from MetaMask first, and that is stronger than treating privacy as a simple pass-through layer. A pass-through layer can still leave a clearer visual connection between the input wallet and the output wallet. A vault model is better because value enters one private store first, and then funds can be withdrawn out to the execution wallet separately, which does more to hide the direct relationship between where funds came from and where they end up being used.

So the purpose of **Unlink** is not just to sit in the middle. It acts as a vault that breaks the obvious onchain linkage between the public MetaMask wallet and the identity-decoupled, public-facing wallet we use in the app. The user's main wallet is still how value enters the system, but it is not the wallet that has to become the visible trading identity.

Once the funds are in that private layer, the app can move value out to the in-app execution wallet, and that is where **Privy** comes in. In the frontend, Privy is configured as an embedded wallet on **Monad Testnet**, so users can connect and trade without being kicked out into a slower extension flow every time they want to act. The purpose of **Privy** is responsiveness. It gives the product an embedded wallet that feels native to the interface, which means placing trades, checking balances, and managing positions can all happen inside one tight loop.

That embedded experience matters even more because of the chain underneath it. **Monad** is what makes the trading loop feel immediate. This repo is wired directly to Monad testnet, and the value proposition here is the chain's very fast block times, roughly **400 milliseconds**, or **0.4 seconds**. The purpose of **Monad** is to make the market feel more real-time: faster inclusion means lower slippage, a smaller window to get exposed in the mempool, a lower chance of getting frontrun, and a noticeably more responsive experience when a user places or resolves trades.

Then we use **Pyth** in two distinct ways.

First, **Pyth as a live data API**. The backend builds the price board by pulling live and recent price history for assets like BTC, ETH, SOL, and XRP, and the frontend uses that to render the live market view and chart. The purpose of Pyth here is to power the interface with current pricing, so users can see the market move in real time before they place an order.

Second, **Pyth as the settlement oracle**. In this project, Pyth is not just display data. The deployment flow fetches the timed Pyth price at the start of the hour to set the market's **strike price**, and when the hour ends, the resolver fetches another timed Pyth update to determine the **settle price**. The smart contract then resolves the market from that oracle update. So the purpose of **Pyth** here is to be the trusted source for both setting the strike and settling the outcome.

So the full stack works like this: **MetaMask** is the public funding source, **Unlink** separates identity and capital flow, **Privy** gives us an embedded execution wallet, **Monad** gives us speed, and **Pyth** gives us both live market data and a credible oracle for resolution.

That combination is what makes Blindside interesting: private by design, fast enough to feel usable, and anchored to an external price source for market integrity.

## Technology Roles

- **Unlink**: privacy vault that better hides the connection between the user's public funding wallet and the identity-decoupled public-facing Privy wallet used in-app.
- **Monad**: high-speed execution layer, around 400ms block times, improving responsiveness while reducing slippage and frontrun exposure.
- **Privy**: embedded wallet layer that keeps trading inside the product instead of pushing users through a slower external-wallet loop.
- **Pyth**: used both for live price display data in the UI and as the oracle for setting strike prices and resolving settlement prices.
