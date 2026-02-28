import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UnlinkProvider } from "@unlink-xyz/react";

import App from "./App";
import {
  MONAD_CHAIN_ID,
  UNLINK_ARTIFACT_VERSION,
  UNLINK_GATEWAY_URL,
  UNLINK_POOL_ADDRESS,
} from "./lib/constants";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
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
  </StrictMode>,
);
