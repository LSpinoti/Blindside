import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { UnlinkProvider } from "@unlink-xyz/react";

import App from "./App";
import {
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
  UNLINK_ARTIFACT_VERSION,
  UNLINK_GATEWAY_URL,
  UNLINK_POOL_ADDRESS,
} from "./lib/constants";
import "./styles.css";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
const privyClientId = import.meta.env.VITE_PRIVY_CLIENT_ID;

if (!privyAppId) {
  throw new Error("Missing VITE_PRIVY_APP_ID.");
}

if (!privyClientId) {
  throw new Error("Missing VITE_PRIVY_CLIENT_ID.");
}

const monadTestnet = {
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  network: "monad-testnet",
  nativeCurrency: {
    name: "Monad",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [MONAD_RPC_URL],
    },
    privyWalletOverride: {
      http: [MONAD_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
} as const;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={privyAppId}
      clientId={privyClientId}
      config={{
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
          showWalletUIs: false,
        },
      }}
    >
      <UnlinkProvider
        chainId={MONAD_CHAIN_ID}
        gatewayUrl={UNLINK_GATEWAY_URL}
        poolAddress={UNLINK_POOL_ADDRESS}
        prover={{
          artifactSource: {
            version: UNLINK_ARTIFACT_VERSION,
          },
        }}
      >
        <App />
      </UnlinkProvider>
    </PrivyProvider>
  </StrictMode>,
);
