import { useEffect, useState } from "react";
import {
  type ConnectedWallet,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useUnlink, useUnlinkHistory } from "@unlink-xyz/react";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";

import { PriceChart } from "./components/PriceChart";
import {
  API_BASE_URL,
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
  MON_NATIVE_TOKEN,
} from "./lib/constants";
import bitcoinLogo from "../shared/bitcoin.png";
import ethereumLogo from "../shared/ethereum.png";
import masqueradeLogo from "../shared/masquerade.svg";
import monadLogo from "../shared/monad.png";
import solanaLogo from "../shared/solana.png";

type PriceBoardMarket = {
  id: string;
  asset: string;
  displaySymbol: string;
  ticker: string;
  feedId: string;
  accent: string;
  currentPrice: number;
  targetPrice: number;
  highPrice: number;
  lowPrice: number;
  movePct: number;
  moveDirection: "UP" | "DOWN" | "FLAT";
  targetTimestamp: number;
  series: Array<{ time: number; value: number }>;
  historical: Array<{
    date: string;
    label: string;
    targetPrice: number;
    settlePrice: number;
    high: number;
    low: number;
    outcome: "UP" | "DOWN" | "FLAT";
    deltaPct: number;
  }>;
};

type PriceBoardResponse = {
  generatedAt: string;
  markets: PriceBoardMarket[];
};

type OrderBookLevel = {
  price: number;
  size: number;
};

type SignedOrderTicket = {
  id: string;
  marketId: string;
  marketLabel: string;
  side: "YES" | "NO";
  limitPrice: number;
  size: number;
  submittedAt: number;
  walletAddress: string;
  signature: string;
};

type WalletAsset = {
  symbol: string;
  label: string;
  balance: string;
};

type CopyToast = {
  id: number;
  message: string;
};

const MONAD_USDC_TOKEN = "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;
const trackedPrivyAssets = [
  {
    symbol: "MON",
    label: "Native",
    decimals: 18,
  },
  {
    symbol: "USDC",
    label: "ERC-20",
    decimals: 6,
    address: MONAD_USDC_TOKEN,
  },
] as const;
const erc20BalanceAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);
const monadPublicClient = createPublicClient({
  transport: http(MONAD_RPC_URL),
});
const marketLogoByAsset: Record<string, string> = {
  BTC: bitcoinLogo,
  ETH: ethereumLogo,
  MON: monadLogo,
  SOL: solanaLogo,
};

export default function App() {
  const {
    activeAccount,
    balances,
    busy,
    createAccount,
    createWallet,
    error,
    importWallet,
    pendingDeposits,
    pendingWithdrawals,
    ready: unlinkReady,
    requestDeposit,
    requestWithdraw,
    walletExists,
  } = useUnlink();
  const { history, loading: historyLoading } = useUnlinkHistory();
  const {
    authenticated,
    connectOrCreateWallet,
    logout,
    ready: privyReady,
    signMessage,
  } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();

  const [board, setBoard] = useState<PriceBoardResponse | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [depositAmount, setDepositAmount] = useState("0.50");
  const [withdrawAmount, setWithdrawAmount] = useState("0.25");
  const [importText, setImportText] = useState("");
  const [limitPrice, setLimitPrice] = useState("0.58");
  const [orderSize, setOrderSize] = useState("25");
  const [walletWorking, setWalletWorking] = useState(false);
  const [tradeWorking, setTradeWorking] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletStatus, setWalletStatus] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [tradeStatus, setTradeStatus] = useState("");
  const [loadingPrivyAssets, setLoadingPrivyAssets] = useState(false);
  const [privyAssets, setPrivyAssets] = useState<WalletAsset[]>(() =>
    buildDefaultWalletAssets(),
  );
  const [lastSignedOrder, setLastSignedOrder] = useState<SignedOrderTicket | null>(
    null,
  );
  const [copyToast, setCopyToast] = useState<CopyToast | null>(null);

  useEffect(() => {
    if (!copyToast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyToast(null);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copyToast]);

  useEffect(() => {
    void loadBoard();

    const timer = window.setInterval(() => {
      void loadBoard(false);
    }, 60000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedMarketId && board?.markets[0]) {
      setSelectedMarketId(board.markets[0].id);
    }
  }, [board, selectedMarketId]);

  const selectedMarket =
    board?.markets.find((market) => market.id === selectedMarketId) ??
    board?.markets[0] ??
    null;

  useEffect(() => {
    if (!selectedMarket) {
      return;
    }

    setLimitPrice(formatProbability(computeImpliedYesPrice(selectedMarket)));
  }, [selectedMarketId]);

  const embeddedWallet = getEmbeddedWallet(wallets);
  const orderBook = selectedMarket ? buildOrderBook(selectedMarket) : null;
  const vaultBalance = balances[MON_NATIVE_TOKEN.toLowerCase()] ?? 0n;
  const totalPendingJobs = pendingDeposits.length + pendingWithdrawals.length;
  const unlinkSummary = summarizeUnlinkVault(
    unlinkReady,
    walletExists,
    activeAccount?.address,
  );
  const privySummary = summarizePrivyWallet(
    privyReady,
    authenticated,
    embeddedWallet?.address,
  );

  useEffect(() => {
    if (!embeddedWallet) {
      setPrivyAssets(buildDefaultWalletAssets());
      setLoadingPrivyAssets(false);
      return;
    }

    let cancelled = false;

    const refreshAssets = async () => {
      setLoadingPrivyAssets(true);

      try {
        const nextAssets = await loadPrivyAssets(embeddedWallet.address);
        if (!cancelled) {
          setPrivyAssets(nextAssets);
        }
      } finally {
        if (!cancelled) {
          setLoadingPrivyAssets(false);
        }
      }
    };

    void refreshAssets();

    const timer = window.setInterval(() => {
      void refreshAssets();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [embeddedWallet?.address]);

  async function loadPrivyAssets(address: string): Promise<WalletAsset[]> {
    const walletAddress = address as `0x${string}`;

    return Promise.all(
      trackedPrivyAssets.map(async (asset) => {
        try {
          const balance =
            "address" in asset
              ? await monadPublicClient.readContract({
                  address: asset.address,
                  abi: erc20BalanceAbi,
                  functionName: "balanceOf",
                  args: [walletAddress],
                })
              : await monadPublicClient.getBalance({
                  address: walletAddress,
                });

          return {
            symbol: asset.symbol,
            label: asset.label,
            balance: formatTokenBalance(balance, asset.decimals),
          };
        } catch {
          return {
            symbol: asset.symbol,
            label: asset.label,
            balance: "Unavailable",
          };
        }
      }),
    );
  }

  async function loadBoard(markLoading = true): Promise<void> {
    if (markLoading) {
      setLoadingBoard(true);
    }

    try {
      const response = await fetch(apiUrl("/api/price-board"));
      if (!response.ok) {
        throw new Error(`Price board responded with ${response.status}.`);
      }

      const payload = (await response.json()) as PriceBoardResponse;
      setBoard(payload);
      setBoardError("");
    } catch (loadError) {
      setBoardError(
        loadError instanceof Error ? loadError.message : "Failed to load board.",
      );
    } finally {
      if (markLoading) {
        setLoadingBoard(false);
      }
    }
  }

  async function handleCreateWallet(): Promise<void> {
    try {
      setWalletWorking(true);
      await createWallet();
    } finally {
      setWalletWorking(false);
    }
  }

  async function handleImportWallet(): Promise<void> {
    if (!importText.trim()) {
      return;
    }

    try {
      setWalletWorking(true);
      await importWallet(importText.trim());
      setImportText("");
    } finally {
      setWalletWorking(false);
    }
  }

  async function handleCreateAccount(): Promise<void> {
    try {
      setWalletWorking(true);
      await createAccount();
    } finally {
      setWalletWorking(false);
    }
  }

  async function handleDeposit(): Promise<void> {
    if (!activeAccount) {
      return;
    }

    const requestedAmount = parseMon(depositAmount);
    if (requestedAmount <= 0n) {
      return;
    }

    if (!privyReady || !walletsReady) {
      setWalletError("");
      setWalletStatus("Privy wallet is still initializing.");
      return;
    }

    if (!authenticated || !embeddedWallet) {
      setWalletError("");
      setWalletStatus("Connect the Privy wallet, then fund the vault.");
      connectOrCreateWallet();
      return;
    }

    try {
      setWalletWorking(true);
      setWalletError("");
      setWalletStatus("");

      await embeddedWallet.switchChain(MONAD_CHAIN_ID);
      const provider = await embeddedWallet.getEthereumProvider();
      const depositor = embeddedWallet.address;

      const relay = await requestDeposit([
        {
          token: MON_NATIVE_TOKEN,
          amount: requestedAmount,
          depositor,
        },
      ]);

      await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: relay.to,
            from: depositor,
            data: relay.calldata,
            value: toHexValue(relay.value),
          },
        ],
      });

      setWalletStatus(
        `Deposit submitted from ${compactAddress(embeddedWallet.address)}.`,
      );
    } catch (depositError) {
      setWalletError(
        depositError instanceof Error
          ? depositError.message
          : "Funding the private vault failed.",
      );
      setWalletStatus("");
    } finally {
      setWalletWorking(false);
    }
  }

  async function handleWithdraw(): Promise<void> {
    if (!activeAccount) {
      return;
    }

    const requestedAmount = parseMon(withdrawAmount);
    if (requestedAmount <= 0n) {
      return;
    }

    if (requestedAmount > vaultBalance) {
      setWalletError("Withdrawal exceeds the current vault balance.");
      setWalletStatus("");
      return;
    }

    if (!privyReady || !walletsReady) {
      setWalletError("");
      setWalletStatus("Privy wallet is still initializing.");
      return;
    }

    if (!authenticated || !embeddedWallet) {
      setWalletError("");
      setWalletStatus("Connect the Privy wallet before withdrawing.");
      connectOrCreateWallet();
      return;
    }

    try {
      setWalletWorking(true);
      setWalletError("");
      setWalletStatus("");

      const result = await requestWithdraw([
        {
          token: MON_NATIVE_TOKEN,
          amount: requestedAmount,
          recipient: embeddedWallet.address,
        },
      ]);

      setWalletStatus(
        `Withdrawal queued to ${compactAddress(embeddedWallet.address)} (${result.relayId.slice(
          0,
          8,
        )}...).`,
      );
    } catch (withdrawError) {
      setWalletError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "Withdrawal to the Privy wallet failed.",
      );
      setWalletStatus("");
    } finally {
      setWalletWorking(false);
    }
  }

  async function handlePlaceOrder(side: "YES" | "NO"): Promise<void> {
    if (!selectedMarket) {
      return;
    }

    if (!privyReady || !walletsReady) {
      setTradeError("");
      setTradeStatus("Public wallet is still initializing.");
      return;
    }

    if (!authenticated || !embeddedWallet) {
      setTradeError("");
      setTradeStatus("Connect the Privy embedded wallet, then place the order.");
      connectOrCreateWallet();
      return;
    }

    const parsedLimit = Number.parseFloat(limitPrice);
    const parsedSize = Number.parseFloat(orderSize);

    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit >= 1) {
      setTradeError("Limit price must be between 0.01 and 0.99.");
      setTradeStatus("");
      return;
    }

    if (!Number.isFinite(parsedSize) || parsedSize <= 0) {
      setTradeError("Order size must be greater than 0.");
      setTradeStatus("");
      return;
    }

    try {
      setTradeWorking(true);
      setTradeError("");

      const baseTicket = {
        id: `${selectedMarket.id}-${side}-${Date.now()}`,
        marketId: selectedMarket.id,
        marketLabel: selectedMarket.displaySymbol,
        side,
        limitPrice: roundProbability(parsedLimit),
        size: Math.round(parsedSize * 100) / 100,
        submittedAt: Date.now(),
        walletAddress: embeddedWallet.address,
      };

      const { signature } = await signMessage(
        { message: buildOrderMessage(baseTicket) },
        { address: embeddedWallet.address },
      );

      setLastSignedOrder({
        ...baseTicket,
        signature,
      });
      setTradeStatus(
        `${side} limit signed by ${compactAddress(embeddedWallet.address)} and staged locally.`,
      );
    } catch (placeError) {
      setTradeError(
        placeError instanceof Error ? placeError.message : "Order signing failed.",
      );
      setTradeStatus("");
    } finally {
      setTradeWorking(false);
    }
  }

  function showCopyToast(message: string): void {
    setCopyToast({
      id: Date.now(),
      message,
    });
  }

  function handleCopyAddress(label: string, value: string): void {
    const copy = async () => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard unavailable.");
        }

        await navigator.clipboard.writeText(value);
        showCopyToast(`${label} copied.`);
      } catch {
        showCopyToast("Clipboard unavailable.");
      }
    };

    void copy();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <div className="brand-lockup">
            <img
              className="brand-mark"
              src={masqueradeLogo}
              alt=""
              aria-hidden="true"
            />
            <h1>BLINDSIDE</h1>
          </div>
        </div>
        <div className="status-stack">
          <span className="status-pill">
            {!loadingBoard ? <span className="live-dot" aria-hidden="true" /> : null}
            {loadingBoard ? "Refreshing" : "Live"}
          </span>
          <span className="status-pill subtle">
            {board?.generatedAt
              ? `Updated ${formatTimestamp(board.generatedAt)}`
              : "Awaiting feed"}
          </span>
        </div>
      </header>

      {copyToast ? (
        <div className="copy-toast" role="status" aria-live="polite">
          {copyToast.message}
        </div>
      ) : null}

      <main className="layout-grid">
        <aside className="sidebar">
          <section className="card wallet-card">
            <div className="wallet-panel-head">
              <div>
                <p className="eyebrow">Private</p>
                <strong>Unlink vault</strong>
              </div>
              <WalletSummaryMeta
                label="Unlink address"
                value={activeAccount?.address}
                fallback={unlinkSummary}
                onCopy={handleCopyAddress}
              />
            </div>

            <div className="detail-list">
              <DetailRow label="Vault MON" value={`${formatMon(vaultBalance)} MON`} />
              <DetailRow label="Pending jobs" value={String(totalPendingJobs)} />
            </div>

            {!walletExists ? (
              <div className="form-stack">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || walletWorking}
                  onClick={() => {
                    void handleCreateWallet();
                  }}
                >
                  Create wallet
                </button>
                <textarea
                  className="terminal-input textarea"
                  placeholder="Import mnemonic"
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                  }}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy || walletWorking}
                  onClick={() => {
                    void handleImportWallet();
                  }}
                >
                  Import
                </button>
              </div>
            ) : !activeAccount ? (
              <button
                type="button"
                className="primary-button"
                disabled={busy || walletWorking}
                onClick={() => {
                  void handleCreateAccount();
                }}
              >
                Create account
              </button>
            ) : (
              <div className="form-stack">
                <label className="field-label">Fund from Privy wallet</label>
                <div className="inline-field">
                  <input
                    className="terminal-input"
                    value={depositAmount}
                    onChange={(event) => {
                      setDepositAmount(event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || walletWorking}
                    onClick={() => {
                      void handleDeposit();
                    }}
                  >
                    Deposit
                  </button>
                </div>
                <label className="field-label">Withdraw to Privy wallet</label>
                <div className="inline-field">
                  <input
                    className="terminal-input"
                    value={withdrawAmount}
                    onChange={(event) => {
                      setWithdrawAmount(event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || walletWorking}
                    onClick={() => {
                      void handleWithdraw();
                    }}
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            )}

            {walletError ? <p className="error-text">{walletError}</p> : null}
            {walletStatus ? <p className="muted-line">{walletStatus}</p> : null}
            {error ? <p className="error-text">{error.message}</p> : null}

            <div className="subsection">
              <div className="subsection-title">Recent private activity</div>
              <div className="history-list compact-history">
                {historyLoading ? (
                  <p className="muted-line">Syncing history...</p>
                ) : history.length === 0 ? (
                  <p className="muted-line">No private activity yet.</p>
                ) : (
                  history.slice(0, 4).map((entry) => (
                    <div key={entry.id} className="history-item">
                      <div className="history-line">
                        <strong>{entry.kind}</strong>
                        <span>{entry.status}</span>
                      </div>
                      <div className="history-line muted">
                        <span>
                          {entry.timestamp
                            ? formatTimestamp(entry.timestamp)
                            : "Pending"}
                        </span>
                        <span>
                          {entry.amounts[0]
                            ? `${entry.amounts[0].delta.startsWith("-") ? "" : "+"}${formatMon(
                                BigInt(entry.amounts[0].delta),
                              )} MON`
                            : "Vault update"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="card wallet-card">
            <div className="wallet-panel-head">
              <div>
                <p className="eyebrow">Public</p>
                <strong>Privy wallet</strong>
              </div>
              <WalletSummaryMeta
                label="Privy address"
                value={embeddedWallet?.address}
                fallback={privySummary}
                onCopy={handleCopyAddress}
              />
            </div>

            <div className="detail-list">
              <DetailRow
                label="Network"
                value={authenticated ? "Monad testnet" : "Connect first"}
              />
            </div>

            <div className={authenticated ? "wallet-actions" : "form-stack"}>
              <button
                type="button"
                className="primary-button"
                disabled={!privyReady}
                onClick={() => {
                  connectOrCreateWallet();
                }}
              >
                {authenticated ? "Open Privy" : "Connect Privy"}
              </button>
              {authenticated ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void logout();
                  }}
                >
                  Disconnect
                </button>
              ) : null}
            </div>

            <div className="subsection">
              <div className="subsection-title">Assets</div>
              <div className="asset-list">
                {privyAssets.map((asset) => (
                  <div key={asset.symbol} className="asset-row">
                    <div className="asset-meta">
                      <strong className="asset-symbol">{asset.symbol}</strong>
                      <span>{asset.label}</span>
                    </div>
                    <strong className="asset-balance">{asset.balance}</strong>
                  </div>
                ))}
              </div>
              <p className="muted-line">
                {embeddedWallet
                  ? loadingPrivyAssets
                    ? "Refreshing balances..."
                    : "Tracked balances refresh every 30 seconds."
                  : "Connect Privy to view MON and USDC balances."}
              </p>
            </div>
          </section>
        </aside>

        <section className="main-panel">
          {boardError ? <p className="error-banner">{boardError}</p> : null}

          <section className="selected-card">
            <div className="selected-head">
              <div className="selected-title-block">
                <p className="eyebrow">Market focus</p>
                {selectedMarket ? (
                  <MarketIdentity market={selectedMarket} titleTag="h2" variant="large" />
                ) : (
                  <h2>Loading</h2>
                )}
              </div>
              {selectedMarket ? (
                <span
                  className={`direction-pill ${selectedMarket.moveDirection.toLowerCase()}`}
                >
                  <span className="live-dot" aria-hidden="true" />
                  {selectedMarket.moveDirection}
                </span>
              ) : null}
            </div>

            {selectedMarket ? (
              <>
                <div className="selected-stats">
                  <StatBlock
                    label="Current"
                    value={formatUsd(selectedMarket.currentPrice)}
                  />
                  <StatBlock
                    label="Target (00:00 UTC)"
                    value={formatUsd(selectedMarket.targetPrice)}
                  />
                  <StatBlock
                    label="Move"
                    value={`${formatSignedPercent(selectedMarket.movePct)}%`}
                  />
                  <StatBlock
                    label="Range"
                    value={`${formatUsd(selectedMarket.lowPrice)} - ${formatUsd(
                      selectedMarket.highPrice,
                    )}`}
                  />
                </div>
                <PriceChart
                  data={selectedMarket.series}
                  targetPrice={selectedMarket.targetPrice}
                  accent={selectedMarket.accent}
                  height={320}
                />
              </>
            ) : (
              <p className="muted-line">No market selected.</p>
            )}
          </section>

          <section className="market-grid">
            {board?.markets.map((market) => (
              <button
                key={market.id}
                type="button"
                className={
                  market.id === selectedMarket?.id ? "market-card active" : "market-card"
                }
                onClick={() => {
                  setSelectedMarketId(market.id);
                }}
              >
                <div className="market-head">
                  <MarketIdentity market={market} titleTag="strong" />
                  <span
                    className={`direction-pill ${market.moveDirection.toLowerCase()}`}
                  >
                    <span className="live-dot" aria-hidden="true" />
                    {market.moveDirection}
                  </span>
                </div>

                <div className="market-metrics">
                  <div>
                    <span>Current</span>
                    <strong>{formatUsd(market.currentPrice)}</strong>
                  </div>
                  <div>
                    <span>Target</span>
                    <strong>{formatUsd(market.targetPrice)}</strong>
                  </div>
                  <div>
                    <span>Move</span>
                    <strong>{formatSignedPercent(market.movePct)}%</strong>
                  </div>
                </div>

                <PriceChart
                  data={market.series}
                  targetPrice={market.targetPrice}
                  accent={market.accent}
                  height={170}
                />

                <div className="history-table">
                  <div className="history-header-row">
                    <span>Date</span>
                    <span>Target</span>
                    <span>Close</span>
                    <span>Result</span>
                  </div>
                  {market.historical.length === 0 ? (
                    <div className="history-row empty">
                      <span>Pending</span>
                      <span>Awaiting</span>
                      <span>Session</span>
                      <span className="mini-direction flat">FLAT</span>
                    </div>
                  ) : (
                    market.historical.map((entry) => (
                      <div key={entry.date} className="history-row">
                        <span>{entry.label}</span>
                        <span>{formatUsd(entry.targetPrice)}</span>
                        <span>{formatUsd(entry.settlePrice)}</span>
                        <span className={`mini-direction ${entry.outcome.toLowerCase()}`}>
                          {entry.outcome}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </button>
            ))}
          </section>
        </section>

        <aside className="trade-panel">
          <section className="selected-card trade-card">
            <div className="selected-head">
              <div className="selected-title-block">
                <p className="eyebrow">Selected market</p>
                {selectedMarket ? (
                  <MarketIdentity market={selectedMarket} titleTag="h2" variant="large" />
                ) : (
                  <h2>No market</h2>
                )}
              </div>
              {selectedMarket ? (
                <span
                  className={`direction-pill ${selectedMarket.moveDirection.toLowerCase()}`}
                >
                  {selectedMarket.moveDirection}
                </span>
              ) : null}
            </div>

            {selectedMarket && orderBook ? (
              <>
                <div className="trade-stats">
                  <StatBlock
                    label="YES mid"
                    value={formatProbability(orderBook.mid)}
                  />
                  <StatBlock
                    label="NO mid"
                    value={formatProbability(1 - orderBook.mid)}
                  />
                  <StatBlock
                    label="Resolve"
                    value={formatTimestamp(selectedMarket.targetTimestamp)}
                  />
                  <StatBlock
                    label="Current"
                    value={formatUsd(selectedMarket.currentPrice)}
                  />
                </div>

                <div className="orderbook">
                  <div className="book-header-row">
                    <span>Bid YES</span>
                    <span>Size</span>
                    <span>Ask YES</span>
                    <span>Size</span>
                  </div>
                  {orderBook.bids.map((bid, index) => {
                    const ask = orderBook.asks[index];
                    return (
                      <div key={`${bid.price}-${ask.price}`} className="book-row">
                        <span className="book-price bid">{formatProbability(bid.price)}</span>
                        <span>{formatContracts(bid.size)}</span>
                        <span className="book-price ask">{formatProbability(ask.price)}</span>
                        <span>{formatContracts(ask.size)}</span>
                      </div>
                    );
                  })}
                  <div className="midpoint-row">
                    Midpoint YES {formatProbability(orderBook.mid)} / NO{" "}
                    {formatProbability(1 - orderBook.mid)}
                  </div>
                </div>
              </>
            ) : (
              <p className="muted-line">Select a market to view liquidity.</p>
            )}
          </section>

          <section className="card trade-ticket">
            <SectionTitle title="Fast limit order" />
            <p className="muted-line ticket-copy">
              Orders are signed by the Privy embedded wallet so the public side stays
              one tap.
            </p>

            <div className="ticket-grid">
              <div className="form-stack">
                <label className="field-label">YES limit price</label>
                <input
                  className="terminal-input"
                  value={limitPrice}
                  onChange={(event) => {
                    setLimitPrice(event.target.value);
                  }}
                />
              </div>
              <div className="form-stack">
                <label className="field-label">Order size</label>
                <input
                  className="terminal-input"
                  value={orderSize}
                  onChange={(event) => {
                    setOrderSize(event.target.value);
                  }}
                />
              </div>
            </div>

            <div className="ticket-actions">
              <button
                type="button"
                className="primary-button yes-button"
                disabled={tradeWorking || !selectedMarket}
                onClick={() => {
                  void handlePlaceOrder("YES");
                }}
              >
                {tradeWorking ? "Signing..." : "Place YES"}
              </button>
              <button
                type="button"
                className="secondary-button no-button"
                disabled={tradeWorking || !selectedMarket}
                onClick={() => {
                  void handlePlaceOrder("NO");
                }}
              >
                {tradeWorking ? "Signing..." : "Place NO"}
              </button>
            </div>

            {tradeError ? <p className="error-text">{tradeError}</p> : null}
            {tradeStatus ? <p className="muted-line">{tradeStatus}</p> : null}

            {lastSignedOrder ? (
              <div className="ticket-receipt">
                <div className="history-line">
                  <strong>
                    {lastSignedOrder.side} {lastSignedOrder.marketLabel}
                  </strong>
                  <span>{formatTimestamp(lastSignedOrder.submittedAt)}</span>
                </div>
                <div className="history-line muted">
                  <span>
                    {formatProbability(lastSignedOrder.limitPrice)} x{" "}
                    {formatContracts(lastSignedOrder.size)}
                  </span>
                  <span>{compactAddress(lastSignedOrder.walletAddress)}</span>
                </div>
                <div className="signature-preview">
                  {compactSignature(lastSignedOrder.signature)}
                </div>
              </div>
            ) : (
              <p className="muted-line">
                Signed order intents stay local until you wire a matching execution API.
              </p>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="section-title">
      <strong>{title}</strong>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WalletSummaryMeta({
  fallback,
  label,
  onCopy,
  value,
}: {
  fallback: string;
  label: string;
  onCopy(label: string, value: string): void;
  value: string | undefined;
}) {
  if (!value) {
    return <span className="wallet-summary-meta">{fallback}</span>;
  }

  return (
    <button
      type="button"
      className="wallet-summary-button"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      onClick={() => {
        onCopy(label, value);
      }}
    >
      <span className="wallet-summary-meta">{compactAddress(value)}</span>
    </button>
  );
}

function MarketIdentity({
  market,
  titleTag,
  variant = "compact",
}: {
  market: Pick<PriceBoardMarket, "asset" | "displaySymbol">;
  titleTag: "h2" | "strong";
  variant?: "compact" | "large";
}) {
  const logoSrc = getMarketLogoSource(market.asset);

  return (
    <div className={`market-identity ${variant}`}>
      <div className="market-logo-shell" aria-hidden="true">
        {logoSrc ? (
          <img className="market-logo" src={logoSrc} alt="" />
        ) : (
          <span className="market-logo-fallback">{market.asset.slice(0, 1)}</span>
        )}
      </div>
      <div className="market-title-copy">
        {titleTag === "h2" ? (
          <h2>{market.displaySymbol}</h2>
        ) : (
          <strong>{market.displaySymbol}</strong>
        )}
        <span>{formatMarketSubtitle(market.asset)}</span>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function apiUrl(pathname: string): string {
  return `${API_BASE_URL}${pathname}`;
}

function parseMon(value: string): bigint {
  const [wholeRaw, fracRaw = ""] = value.trim().split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const fraction = `${fracRaw}000000000000000000`.slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(fraction || "0");
}

function formatMon(amount: bigint): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = absolute / 10n ** 18n;
  const fraction = absolute % 10n ** 18n;
  const formatted = `${whole}.${fraction
    .toString()
    .padStart(18, "0")
    .slice(0, 4)}`;
  return negative ? `-${formatted}` : formatted;
}

function toHexValue(value: bigint): string {
  if (value === 0n) {
    return "0x0";
  }

  return `0x${value.toString(16)}`;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 999 ? 2 : 4,
  }).format(value);
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatProbability(value: number): string {
  return roundProbability(value).toFixed(2);
}

function formatContracts(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatMarketSubtitle(asset: string): string {
  return `${asset} 24 hour up/down`;
}

function formatTimestamp(value: string | number): string {
  const parsed =
    typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactAddress(value: string): string {
  if (!value || value.length < 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function compactSignature(value: string): string {
  if (!value || value.length < 18) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function buildDefaultWalletAssets(): WalletAsset[] {
  return trackedPrivyAssets.map((asset) => ({
    symbol: asset.symbol,
    label: asset.label,
    balance: "--",
  }));
}

function getMarketLogoSource(asset: string): string | null {
  return marketLogoByAsset[asset.toUpperCase()] ?? null;
}

function summarizeUnlinkVault(
  ready: boolean,
  walletExists: boolean,
  address: string | undefined,
): string {
  if (!ready) {
    return "Syncing";
  }

  if (address) {
    return compactAddress(address);
  }

  return walletExists ? "Create account" : "No vault";
}

function summarizePrivyWallet(
  ready: boolean,
  authenticated: boolean,
  address: string | undefined,
): string {
  if (!ready) {
    return "Syncing";
  }

  if (address) {
    return compactAddress(address);
  }

  return authenticated ? "Provisioning" : "Disconnected";
}

function getEmbeddedWallet(wallets: ConnectedWallet[]) {
  return (
    wallets.find(
      (wallet): wallet is Extract<ConnectedWallet, { type: "ethereum" }> =>
        wallet.walletClientType === "privy" && wallet.type === "ethereum",
    ) ?? null
  );
}

function buildOrderBook(market: PriceBoardMarket) {
  const mid = computeImpliedYesPrice(market);
  const bids = createBookLevels(mid, -1, Math.abs(market.movePct));
  const asks = createBookLevels(mid, 1, Math.abs(market.movePct));

  return {
    bids,
    asks,
    mid,
  };
}

function createBookLevels(
  midpoint: number,
  direction: -1 | 1,
  moveMagnitude: number,
): OrderBookLevel[] {
  return Array.from({ length: 4 }, (_, index) => {
    const distance = 0.02 + index * 0.015;
    const rawPrice = midpoint + distance * direction;
    const depthBase = 140 - index * 18 + moveMagnitude * 5;

    return {
      price: roundProbability(rawPrice),
      size: Math.max(8, Math.round(depthBase)),
    };
  });
}

function computeImpliedYesPrice(market: PriceBoardMarket): number {
  const relativeDrift =
    market.targetPrice === 0
      ? 0
      : (market.currentPrice - market.targetPrice) / market.targetPrice;

  return roundProbability(0.5 + relativeDrift * 2.4 + (market.movePct / 100) * 1.8);
}

function roundProbability(value: number): number {
  return Math.min(0.99, Math.max(0.01, Math.round(value * 100) / 100));
}

function buildOrderMessage(
  ticket: Omit<SignedOrderTicket, "signature">,
): string {
  return [
    "BLINDSIDE LIMIT ORDER",
    `market=${ticket.marketId}`,
    `symbol=${ticket.marketLabel}`,
    `side=${ticket.side}`,
    `limit=${formatProbability(ticket.limitPrice)}`,
    `size=${ticket.size}`,
    `wallet=${ticket.walletAddress}`,
    `timestamp=${new Date(ticket.submittedAt).toISOString()}`,
  ].join("\n");
}

function formatTokenBalance(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const visibleFraction = fraction
    .slice(0, decimals === 6 ? 2 : 4)
    .replace(/0+$/, "");

  return visibleFraction ? `${whole}.${visibleFraction}` : whole;
}
