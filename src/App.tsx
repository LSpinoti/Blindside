import { useEffect, useState } from "react";
import {
  type ConnectedWallet,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useUnlink, useUnlinkHistory } from "@unlink-xyz/react";
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  isAddress,
  parseAbi,
} from "viem";

import { PriceChart } from "./components/PriceChart";
import { binaryPriceMarketAbi } from "./lib/abi";
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
  contractAddress: string;
  question: string;
  strikeE8: number;
  cutoffTime: number;
  pythAddress: string;
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
  priceBps: number;
  sizeWei: bigint;
};

type MarketDepthSnapshot = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBidBps: number | null;
  bestAskBps: number | null;
  yesPoolWei: bigint;
  noPoolWei: bigint;
};

type SubmittedOrderTicket = {
  id: string;
  marketId: string;
  marketLabel: string;
  side: "YES" | "NO";
  limitPrice: number;
  amountWei: bigint;
  submittedAt: number;
  walletAddress: string;
  txHash: string;
};

type WalletMarketPosition = {
  marketId: string;
  marketLabel: string;
  contractAddress: string;
  yesAmountWei: bigint;
  noAmountWei: bigint;
  claimableWei: bigint;
  openYesWei: bigint;
  openNoWei: bigint;
  totalLockedWei: bigint;
  alreadyClaimed: boolean;
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
    linkWallet,
    logout,
    ready: privyReady,
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
  const [orderSize, setOrderSize] = useState("0.25");
  const [walletWorking, setWalletWorking] = useState(false);
  const [tradeWorking, setTradeWorking] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletStatus, setWalletStatus] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [tradeStatus, setTradeStatus] = useState("");
  const [loadingPrivyAssets, setLoadingPrivyAssets] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [privyAssets, setPrivyAssets] = useState<WalletAsset[]>(() =>
    buildDefaultWalletAssets(),
  );
  const [marketDepth, setMarketDepth] = useState<Record<string, MarketDepthSnapshot>>(
    {},
  );
  const [walletPositions, setWalletPositions] = useState<WalletMarketPosition[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [recentOrders, setRecentOrders] = useState<SubmittedOrderTicket[]>([]);
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
    }, 10000);

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
  const marketIdsKey =
    board?.markets
      .map((market) => `${market.id}:${market.contractAddress}`)
      .join("|") ?? "";

  useEffect(() => {
    if (!selectedMarket) {
      return;
    }

    setLimitPrice(
      formatProbability(
        computeSuggestedLimitPrice(
          selectedMarket,
          marketDepth[selectedMarket.id] ?? null,
        ),
      ),
    );
  }, [selectedMarketId]);

  const embeddedWallet = getEmbeddedWallet(wallets);
  const selectedDepth = selectedMarket
    ? marketDepth[selectedMarket.id] ?? createEmptyMarketDepth()
    : null;
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
  const assetsTooltip = embeddedWallet
    ? loadingPrivyAssets
      ? "Refreshing balances..."
      : "Tracked balances refresh every 30 seconds."
    : "Connect Privy to view MON and USDC balances.";
  const tradeTicketTooltip =
    "Orders post directly to the selected market contract in MON. The transaction hash is stored below after each submission.";
  const isHistoryBootstrapping = historyLoading && history.length === 0;
  const visibleHistory = showAllHistory ? history : history.slice(0, 2);
  const hiddenHistoryCount = Math.max(history.length - 2, 0);
  const visibleWalletPositions = walletPositions.filter(hasVisiblePosition);

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

  useEffect(() => {
    if (!board?.markets.length) {
      setMarketDepth({});
      return;
    }

    let cancelled = false;

    const refreshDepth = async () => {
      const nextDepth = await loadMarketDepth(board.markets);
      if (!cancelled) {
        setMarketDepth(nextDepth);
      }
    };

    void refreshDepth();

    const timer = window.setInterval(() => {
      void refreshDepth();
    }, 6000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [marketIdsKey]);

  useEffect(() => {
    if (!embeddedWallet || !board?.markets.length) {
      setWalletPositions([]);
      setLoadingPositions(false);
      return;
    }

    let cancelled = false;

    const refreshPositions = async () => {
      setLoadingPositions(true);

      try {
        const nextPositions = await loadWalletPositionsForAddress(
          embeddedWallet.address,
          board.markets,
        );

        if (!cancelled) {
          setWalletPositions(nextPositions);
        }
      } finally {
        if (!cancelled) {
          setLoadingPositions(false);
        }
      }
    };

    void refreshPositions();

    const timer = window.setInterval(() => {
      void refreshPositions();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [embeddedWallet?.address, marketIdsKey]);

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

  async function loadMarketDepth(
    markets: PriceBoardMarket[],
  ): Promise<Record<string, MarketDepthSnapshot>> {
    const entries = await Promise.all(
      markets.map(async (market): Promise<[string, MarketDepthSnapshot]> => {
        if (!isLiveContractAddress(market.contractAddress)) {
          return [market.id, createEmptyMarketDepth()];
        }

        try {
          const [yesPoolWei, noPoolWei, orderBook] = await Promise.all([
            monadPublicClient.readContract({
              address: market.contractAddress as `0x${string}`,
              abi: binaryPriceMarketAbi,
              functionName: "yesPool",
            }),
            monadPublicClient.readContract({
              address: market.contractAddress as `0x${string}`,
              abi: binaryPriceMarketAbi,
              functionName: "noPool",
            }),
            monadPublicClient.readContract({
              address: market.contractAddress as `0x${string}`,
              abi: binaryPriceMarketAbi,
              functionName: "getOrderBook",
            }),
          ]);

          const [bidPrices, bidSizes, askPrices, askSizes] = orderBook;

          return [
            market.id,
            {
              bids: buildBookSide(
                Array.from(bidPrices, (value) => Number(value)),
                Array.from(bidSizes),
              ),
              asks: buildBookSide(
                Array.from(askPrices, (value) => Number(value)),
                Array.from(askSizes),
              ),
              bestBidBps: firstActivePrice(Array.from(bidPrices, (value) => Number(value))),
              bestAskBps: firstActivePrice(Array.from(askPrices, (value) => Number(value))),
              yesPoolWei,
              noPoolWei,
            },
          ];
        } catch {
          return [market.id, createEmptyMarketDepth()];
        }
      }),
    );

    return Object.fromEntries(entries);
  }

  async function loadWalletPositionsForAddress(
    address: string,
    markets: PriceBoardMarket[],
  ): Promise<WalletMarketPosition[]> {
    return Promise.all(
      markets.map(async (market) => {
        const emptyPosition: WalletMarketPosition = {
          marketId: market.id,
          marketLabel: market.displaySymbol,
          contractAddress: market.contractAddress,
          yesAmountWei: 0n,
          noAmountWei: 0n,
          claimableWei: 0n,
          openYesWei: 0n,
          openNoWei: 0n,
          totalLockedWei: 0n,
          alreadyClaimed: false,
        };

        if (!isLiveContractAddress(market.contractAddress)) {
          return emptyPosition;
        }

        try {
          const [position, openOrders] = await Promise.all([
            monadPublicClient.readContract({
              address: market.contractAddress as `0x${string}`,
              abi: binaryPriceMarketAbi,
              functionName: "positionOf",
              args: [address as `0x${string}`],
            }),
            monadPublicClient.readContract({
              address: market.contractAddress as `0x${string}`,
              abi: binaryPriceMarketAbi,
              functionName: "openOrderSummaryOf",
              args: [address as `0x${string}`],
            }),
          ]);

          const [yesAmountWei, noAmountWei, alreadyClaimed, claimableWei] = position;
          const [openYesWei, openNoWei, totalLockedWei] = openOrders;

          return {
            ...emptyPosition,
            yesAmountWei,
            noAmountWei,
            claimableWei,
            openYesWei,
            openNoWei,
            totalLockedWei,
            alreadyClaimed,
          };
        } catch {
          return emptyPosition;
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
    if (!isLiveContractAddress(selectedMarket.contractAddress)) {
      setTradeError("The selected market has not been deployed yet.");
      setTradeStatus("");
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
    const collateralWei = parseMon(orderSize);

    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0 || parsedLimit >= 1) {
      setTradeError("Limit price must be between 0.01 and 0.99.");
      setTradeStatus("");
      return;
    }

    if (collateralWei <= 0n) {
      setTradeError("Order size must be greater than 0 MON.");
      setTradeStatus("");
      return;
    }

    try {
      setTradeWorking(true);
      setTradeError("");
      setTradeStatus("");

      const normalizedLimit = roundProbability(parsedLimit);
      const limitPriceBps = Math.round(normalizedLimit * 100);

      await embeddedWallet.switchChain(MONAD_CHAIN_ID);
      const provider = await embeddedWallet.getEthereumProvider();

      const txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: selectedMarket.contractAddress,
            from: embeddedWallet.address,
            data: encodeFunctionData({
              abi: binaryPriceMarketAbi,
              functionName: "placeLimitOrder",
              args: [side === "YES", limitPriceBps],
            }),
            value: toHexValue(collateralWei),
          },
        ],
      })) as string;

      const baseTicket = {
        id: `${selectedMarket.id}-${side}-${Date.now()}`,
        marketId: selectedMarket.id,
        marketLabel: selectedMarket.displaySymbol,
        side,
        limitPrice: normalizedLimit,
        amountWei: collateralWei,
        submittedAt: Date.now(),
        walletAddress: embeddedWallet.address,
        txHash,
      };

      setRecentOrders((current) => [baseTicket, ...current].slice(0, 6));
      setTradeStatus(
        `${side} order submitted to ${compactAddress(selectedMarket.contractAddress)}.`,
      );

      void monadPublicClient
        .waitForTransactionReceipt({
          hash: txHash as `0x${string}`,
        })
        .then(async () => {
          if (board?.markets.length) {
            setMarketDepth(await loadMarketDepth(board.markets));
          }

          if (embeddedWallet.address && board?.markets.length) {
            setWalletPositions(
              await loadWalletPositionsForAddress(
                embeddedWallet.address,
                board.markets,
              ),
            );
          }
        })
        .catch(() => undefined);
    } catch (placeError) {
      setTradeError(
        placeError instanceof Error ? placeError.message : "Order submission failed.",
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
                {isHistoryBootstrapping ? (
                  <p className="muted-line">Syncing history...</p>
                ) : history.length === 0 ? (
                  <p className="muted-line">No private activity yet.</p>
                ) : (
                  visibleHistory.map((entry) => {
                    const primaryAmount = entry.amounts[0];

                    return (
                      <div key={entry.id} className="history-item">
                        <HistoryDirectionIcon direction={getHistoryDirection(entry)} />
                        <div className="history-copy">
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
                              {primaryAmount
                                ? `${primaryAmount.delta.startsWith("-") ? "" : "+"}${formatMon(
                                    BigInt(primaryAmount.delta),
                                  )} MON`
                                : "Vault update"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {hiddenHistoryCount > 0 ? (
                <button
                  type="button"
                  className="secondary-button history-toggle"
                  aria-expanded={showAllHistory}
                  onClick={() => {
                    setShowAllHistory((current) => !current);
                  }}
                >
                  {showAllHistory ? "Show less" : `Show ${hiddenHistoryCount} more`}
                </button>
              ) : null}
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
                  if (authenticated) {
                    linkWallet();
                    return;
                  }

                  connectOrCreateWallet();
                }}
              >
                {authenticated ? "Link Wallet" : "Connect Privy"}
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
              <div className="subsection-title-row">
                <div className="subsection-title">Assets</div>
                <InfoTooltip label="Assets note" text={assetsTooltip} align="start" />
              </div>
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
            </div>

            <div className="subsection">
              <div className="subsection-title">Current positions</div>
              {!embeddedWallet ? (
                <p className="muted-line">Connect Privy to load onchain positions.</p>
              ) : loadingPositions ? (
                <p className="muted-line">Refreshing positions...</p>
              ) : visibleWalletPositions.length === 0 ? (
                <p className="muted-line">No positions or resting orders yet.</p>
              ) : (
                <div className="position-list">
                  {visibleWalletPositions.map((position) => (
                    <div key={position.marketId} className="position-card">
                      <div className="history-line">
                        <strong>{position.marketLabel}</strong>
                        <span>{compactAddress(position.contractAddress)}</span>
                      </div>
                      <div className="position-grid">
                        <span>YES {formatMonCompact(position.yesAmountWei)} MON</span>
                        <span>NO {formatMonCompact(position.noAmountWei)} MON</span>
                        <span>Open YES {formatMonCompact(position.openYesWei)} MON</span>
                        <span>Open NO {formatMonCompact(position.openNoWei)} MON</span>
                        <span>
                          Locked {formatMonCompact(position.totalLockedWei)} MON
                        </span>
                        <span>
                          Claimable {formatMonCompact(position.claimableWei)} MON
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

                <div className="market-contract-row">
                  <span>Contract</span>
                  <strong>{formatContractLabel(market.contractAddress)}</strong>
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

            {selectedMarket && selectedDepth ? (
              <>
                <div className="trade-stats">
                  <StatBlock
                    label="YES pool"
                    value={`${formatMonCompact(selectedDepth.yesPoolWei)} MON`}
                  />
                  <StatBlock
                    label="NO pool"
                    value={`${formatMonCompact(selectedDepth.noPoolWei)} MON`}
                  />
                  <StatBlock
                    label="Best YES bid"
                    value={formatPriceFromBps(selectedDepth.bestBidBps)}
                  />
                  <StatBlock
                    label="Best YES ask"
                    value={formatPriceFromBps(selectedDepth.bestAskBps)}
                  />
                </div>

                {isLiveContractAddress(selectedMarket.contractAddress) ? (
                  <div className="orderbook">
                    <div className="book-header-row">
                      <span>Bid YES</span>
                      <span>Size</span>
                      <span>Ask YES</span>
                      <span>Size</span>
                    </div>
                    {selectedDepth.bids.map((bid, index) => {
                      const ask = selectedDepth.asks[index];
                      return (
                        <div
                          key={`${selectedMarket.id}-${index}`}
                          className="book-row"
                        >
                          <span className="book-price bid">
                            {formatLevelPrice(bid.priceBps)}
                          </span>
                          <span>{formatMonCompact(bid.sizeWei)}</span>
                          <span className="book-price ask">
                            {formatLevelPrice(ask.priceBps)}
                          </span>
                          <span>{formatMonCompact(ask.sizeWei)}</span>
                        </div>
                      );
                    })}
                    <div className="midpoint-row">
                      Spread {formatPriceFromBps(selectedDepth.bestBidBps)} /{" "}
                      {formatPriceFromBps(selectedDepth.bestAskBps)}
                    </div>
                  </div>
                ) : (
                  <p className="muted-line">Deploy this market to view live depth.</p>
                )}
              </>
            ) : (
              <p className="muted-line">Select a market to view liquidity.</p>
            )}
          </section>

          <section className="card trade-ticket">
            <SectionTitle title="Fast limit order" note={tradeTicketTooltip} />

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
                <label className="field-label">Order size (MON)</label>
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
                {tradeWorking ? "Posting..." : "Place YES"}
              </button>
              <button
                type="button"
                className="secondary-button no-button"
                disabled={tradeWorking || !selectedMarket}
                onClick={() => {
                  void handlePlaceOrder("NO");
                }}
              >
                {tradeWorking ? "Posting..." : "Place NO"}
              </button>
            </div>

            {tradeError ? <p className="error-text">{tradeError}</p> : null}
            {tradeStatus ? <p className="muted-line">{tradeStatus}</p> : null}

            {recentOrders.length > 0 ? (
              <div className="receipt-list">
                {recentOrders.map((order) => (
                  <div key={order.id} className="ticket-receipt">
                    <div className="history-line">
                      <strong>
                        {order.side} {order.marketLabel}
                      </strong>
                      <span>{formatTimestamp(order.submittedAt)}</span>
                    </div>
                    <div className="history-line muted">
                      <span>
                        {formatProbability(order.limitPrice)} x{" "}
                        {formatMonCompact(order.amountWei)} MON
                      </span>
                      <span>{compactAddress(order.walletAddress)}</span>
                    </div>
                    <div className="receipt-actions">
                      <span className="signature-preview">
                        Tx {compactTxHash(order.txHash)}
                      </span>
                      <button
                        type="button"
                        className="wallet-summary-button receipt-copy-button"
                        onClick={() => {
                          handleCopyAddress("Transaction id", order.txHash);
                        }}
                      >
                        Copy tx id
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </main>
    </div>
  );
}

function SectionTitle({ note, title }: { note?: string; title: string }) {
  return (
    <div className="section-title">
      <strong>{title}</strong>
      {note ? <InfoTooltip label={`${title} note`} text={note} /> : null}
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

function InfoTooltip({
  align = "end",
  label,
  text,
}: {
  align?: "end" | "start";
  label: string;
  text: string;
}) {
  return (
    <span className="tooltip-wrap">
      <button type="button" className="tooltip-trigger" aria-label={label}>
        i
      </button>
      <span
        className={`tooltip-bubble${align === "start" ? " tooltip-bubble-start" : ""}`}
        role="tooltip"
      >
        {text}
      </span>
    </span>
  );
}

function HistoryDirectionIcon({
  direction,
}: {
  direction: "inbound" | "outbound";
}) {
  const path =
    direction === "outbound" ? "M3 13L13 3M8 3h5v5" : "M13 3L3 13M3 8v5h5";

  return (
    <span className={`history-direction ${direction}`} aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path d={path} />
      </svg>
    </span>
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

function getHistoryDirection(entry: {
  amounts: Array<{ delta: string }>;
  kind: string;
}): "inbound" | "outbound" {
  const primaryAmount = entry.amounts[0];
  if (primaryAmount) {
    return primaryAmount.delta.startsWith("-") ? "outbound" : "inbound";
  }

  const normalizedKind = entry.kind.toLowerCase();
  if (
    normalizedKind.includes("send") ||
    normalizedKind.includes("withdraw") ||
    normalizedKind.includes("out")
  ) {
    return "outbound";
  }

  return "inbound";
}

function parseMon(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d*(\.\d*)?$/.test(normalized)) {
    return 0n;
  }

  const [wholeRaw, fracRaw = ""] = normalized.split(".");
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

function formatMonCompact(amount: bigint): string {
  const [whole, fraction = ""] = formatMon(amount).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
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

function compactTxHash(value: string): string {
  if (!value || value.length < 18) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatContractLabel(value: string): string {
  return isLiveContractAddress(value) ? value : "Pending deploy";
}

function formatPriceFromBps(value: number | null): string {
  if (!value) {
    return "--";
  }

  return (value / 100).toFixed(2);
}

function formatLevelPrice(value: number): string {
  if (value <= 0) {
    return "--";
  }

  return (value / 100).toFixed(2);
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

function createEmptyMarketDepth(): MarketDepthSnapshot {
  return {
    bids: Array.from({ length: 4 }, () => ({ priceBps: 0, sizeWei: 0n })),
    asks: Array.from({ length: 4 }, () => ({ priceBps: 0, sizeWei: 0n })),
    bestBidBps: null,
    bestAskBps: null,
    yesPoolWei: 0n,
    noPoolWei: 0n,
  };
}

function buildBookSide(
  prices: number[],
  sizes: bigint[],
): OrderBookLevel[] {
  return Array.from({ length: 4 }, (_, index) => ({
    priceBps: prices[index] ?? 0,
    sizeWei: sizes[index] ?? 0n,
  }));
}

function firstActivePrice(levels: number[]): number | null {
  for (const level of levels) {
    if (level > 0) {
      return level;
    }
  }

  return null;
}

function computeImpliedYesPrice(market: PriceBoardMarket): number {
  const relativeDrift =
    market.targetPrice === 0
      ? 0
      : (market.currentPrice - market.targetPrice) / market.targetPrice;

  return roundProbability(0.5 + relativeDrift * 2.4 + (market.movePct / 100) * 1.8);
}

function computeSuggestedLimitPrice(
  market: PriceBoardMarket,
  depth: MarketDepthSnapshot | null,
): number {
  if (depth?.bestBidBps && depth.bestAskBps) {
    return roundProbability((depth.bestBidBps + depth.bestAskBps) / 200);
  }

  return computeImpliedYesPrice(market);
}

function roundProbability(value: number): number {
  return Math.min(0.99, Math.max(0.01, Math.round(value * 100) / 100));
}

function isLiveContractAddress(value: string): boolean {
  return (
    isAddress(value) &&
    value.toLowerCase() !== "0x0000000000000000000000000000000000000000"
  );
}

function hasVisiblePosition(position: WalletMarketPosition): boolean {
  return (
    position.yesAmountWei > 0n ||
    position.noAmountWei > 0n ||
    position.openYesWei > 0n ||
    position.openNoWei > 0n ||
    position.claimableWei > 0n
  );
}

function formatTokenBalance(amount: bigint, decimals: number): string {
  const formatted = formatUnits(amount, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const visibleFraction = fraction
    .slice(0, decimals === 6 ? 2 : 4)
    .replace(/0+$/, "");

  return visibleFraction ? `${whole}.${visibleFraction}` : whole;
}
