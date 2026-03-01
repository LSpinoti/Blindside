# Project Demo Script

## Opening

Today I am showing how this product delivers fast trading while separating a user's public identity from the wallet that actually interacts inside the app.

The experience is built around four pieces working together: Unlink for privacy separation, Privy for embedded execution, Monad for speed, and Pyth for live pricing and settlement.

## Walkthrough Script

First, the user starts with a normal public MetaMask wallet. That is the familiar wallet they already control and the public entry point into the flow.

Next, Unlink sits between that public MetaMask wallet and the identity-decoupled, public-facing Privy wallet used inside the product. The purpose of Unlink is to create a separation layer, so the wallet the app uses for execution is not directly exposing the user's primary public identity.

Then, once the user is inside the app, Privy gives us an embedded wallet experience. The purpose of Privy is to keep trading responsive, because users do not need to leave the interface or approve every action through a slower external wallet loop.

Under the hood, Monad is what makes the experience feel immediate. With sub-second block times, around 400ms, the purpose of Monad is to reduce slippage, shrink the window for mempool frontrunning, and make order placement and settlement feel much more responsive.

Pyth supports the product in two distinct ways. First, we use Pyth as an API to display live price feed data directly in the interface, so users can see the market in real time. Second, we use Pyth as the oracle for the market itself, where it sets the strike price when the market is created and provides the settle price when the market resolves.

## Closing

So the key idea is: Unlink protects the relationship between the user's public wallet and the wallet used in-app, Privy keeps execution embedded and smooth, Monad makes the trading loop extremely fast, and Pyth gives us both the live data feed and the trusted price source for resolution.

That combination lets us deliver a private, fast, and credible trading experience without sacrificing usability.
