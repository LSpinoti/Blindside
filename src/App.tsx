import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import {
  useTxStatus,
  useUnlink,
  useUnlinkHistory,
} from "@unlink-xyz/react";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  parseEther,
  type Address,
} from "viem";
import { monadTestnet } from "viem/chains";

import { binaryPriceMarketAbi } from "./lib/abi";
import {
  API_BASE_URL,
  MONAD_CHAIN_ID,
  MONAD_RPC_URL,
  MON_NATIVE_TOKEN,
  type BlindsideActivity,
  type BlindsideMarket,
  type BlindsideSide,
  type BurnerLifecycle,
  type BurnerPosition,
  type RouteKey,
  UNLINK_POOL_ADDRESS,
  ZERO_ADDRESS,
} from "./lib/constants";
import { createClientId, readRegistry, writeRegistry } from "./lib/storage";

type ResolverPreview = {
  generatedAt: string;
  marketId: string;
  marketAddress: string;
  pythContract: string;
  updateDataHex: string[];
  latestPriceE8: number;
  latestPriceDisplay: string;
  exponent: number;
  publishTime: number | null;
  strikeE8: number;
  strikeDisplay: string;
  resolvesYes: boolean;
};

type MarketsResponse = {
  markets: BlindsideMarket[];
};

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC_URL),
});

const routeOptions: Array<{ key: RouteKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "markets", label: "Markets" },
  { key: "activity", label: "Activity" },
  { key: "resolve", label: "Admin Resolve" },
];

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
    ready,
    requestDeposit,
    waitForConfirmation,
    wallet,
    walletExists,
  } = useUnlink();
  const { history, loading: historyLoading, refresh: refreshHistory } =
    useUnlinkHistory();

  const [registry, setRegistry] = useState(() => readRegistry());
  const [markets, setMarkets] = useState<BlindsideMarket[]>([]);
  const [route, setRoute] = useState<RouteKey>("dashboard");
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [marketFilter, setMarketFilter] = useState("");
  const [depositAmount, setDepositAmount] = useState("0.50");
  const [tradeAmount, setTradeAmount] = useState("0.10");
  const [side, setSide] = useState<BlindsideSide>("YES");
  const [relayId, setRelayId] = useState<string | null>(null);
  const [timelineStage, setTimelineStage] = useState(0);
  const [actionMessage, setActionMessage] = useState(
    "Blindside is ready to map private Unlink funding to public burner trades.",
  );
  const [working, setWorking] = useState(false);
  const [importText, setImportText] = useState("");
  const [resolverPreview, setResolverPreview] = useState<ResolverPreview | null>(
    null,
  );
  const [resolverLoading, setResolverLoading] = useState(false);

  const deferredMarketFilter = useDeferredValue(marketFilter);
  const relayStatus = useTxStatus(relayId);

  useEffect(() => {
    writeRegistry(registry);
  }, [registry]);

  useEffect(() => {
    void loadMarkets();

    const handle = window.setInterval(() => {
      void loadMarkets(false);
    }, 20000);

    return () => {
      window.clearInterval(handle);
    };
  }, []);

  useEffect(() => {
    if (!selectedMarketId && markets[0]) {
      setSelectedMarketId(markets[0].id);
    }
  }, [markets, selectedMarketId]);

  useEffect(() => {
    if (relayStatus.state === "succeeded") {
      void refreshHistory();
    }
  }, [refreshHistory, relayStatus.state]);

  const selectedMarket =
    markets.find((market) => market.id === selectedMarketId) ?? markets[0] ?? null;

  const filteredMarkets = markets.filter((market) => {
    if (!deferredMarketFilter.trim()) {
      return true;
    }

    const normalized = deferredMarketFilter.toLowerCase();
    return (
      market.question.toLowerCase().includes(normalized) ||
      market.status.toLowerCase().includes(normalized)
    );
  });

  const vaultBalance = balances[MON_NATIVE_TOKEN] ?? 0n;
  const positionsForSelectedMarket = selectedMarket
    ? registry.positions.filter((position) => position.marketId === selectedMarket.id)
    : [];

  let openExposure = 0n;
  let realizedPnl = 0n;
  let claimableValue = 0n;
  const burnerIds = new Set<number>();

  for (const position of registry.positions) {
    const market = markets.find((entry) => entry.id === position.marketId) ?? null;
    const lifecycle = resolveLifecycle(position, market);
    const stake = BigInt(position.amountWei);
    const payout = position.payoutWei
      ? BigInt(position.payoutWei)
      : estimatePayout(position, market);

    burnerIds.add(position.burnerIndex);

    if (lifecycle !== "swept") {
      openExposure += stake;
    }

    if (lifecycle === "claimable") {
      claimableValue += payout;
    }

    if (position.state === "swept" && position.payoutWei) {
      realizedPnl += payout - stake;
    }
  }

  const privateNav = vaultBalance + claimableValue;
  const relayStateLabel = relayStatus.state ?? "idle";
  const activeBurnerLabel = `B-${String(registry.nextBurnerIndex).padStart(2, "0")}`;
  const timelineSteps = [
    "Preparing in Unlink",
    "Funding burner",
    "Broadcasting public tx",
    "Confirmed on Monad",
    "Position recorded",
  ];

  const activityRows: BlindsideActivity[] = [
    ...registry.activity,
    ...history.map((entry) => ({
      id: `history-${entry.id}`,
      timestamp: new Date(entry.timestamp ?? 0).toISOString(),
      action: entry.kind,
      marketId: undefined,
      scope: "Private vault",
      source: "Private" as const,
      publicAddress: undefined,
      privateImpact:
        entry.amounts[0] != null
          ? `${entry.amounts[0].delta.startsWith("-") ? "" : "+"}${formatMonFromDelta(
              entry.amounts[0].delta,
            )} MON`
          : "Vault mutation",
      status: entry.status,
      txRef: entry.txHash,
    })),
  ]
    .sort((left, right) => {
      return (
        Date.parse(right.timestamp || "1970-01-01T00:00:00.000Z") -
        Date.parse(left.timestamp || "1970-01-01T00:00:00.000Z")
      );
    })
    .slice(0, route === "activity" ? 60 : 18);

  async function loadMarkets(useTransition = true): Promise<void> {
    try {
      const response = await fetch(apiUrl("/api/markets"));
      if (!response.ok) {
        throw new Error(`Markets API responded with ${response.status}.`);
      }

      const payload = (await response.json()) as MarketsResponse;
      const hydrated = await Promise.all(
        payload.markets.map((market) => hydrateMarketWithChain(market)),
      );

      if (useTransition) {
        startTransition(() => {
          setMarkets(hydrated);
        });
      } else {
        setMarkets(hydrated);
      }
    } catch (loadError) {
      if (loadError instanceof Error) {
        setActionMessage(loadError.message);
      }
    }
  }

  async function handleCreateWallet(): Promise<void> {
    try {
      setWorking(true);
      await createWallet();
      setRegistry((current) => ({
        ...current,
        createdWalletAt: new Date().toISOString(),
      }));
      setActionMessage(
        "Private wallet created. Create an account next so the vault has an address.",
      );
    } catch (createError) {
      setActionMessage(
        createError instanceof Error
          ? createError.message
          : "Wallet creation failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleImportWallet(): Promise<void> {
    if (!importText.trim()) {
      setActionMessage("Paste a recovery phrase before importing.");
      return;
    }

    try {
      setWorking(true);
      await importWallet(importText.trim());
      setRegistry((current) => ({
        ...current,
        importedWalletAt: new Date().toISOString(),
      }));
      setImportText("");
      setActionMessage(
        "Mnemonic imported. Create or switch into an account to trade.",
      );
    } catch (importError) {
      setActionMessage(
        importError instanceof Error
          ? importError.message
          : "Wallet import failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleCreateAccount(): Promise<void> {
    try {
      setWorking(true);
      await createAccount();
      setActionMessage(
        "Blindside account ready. You can now fund the private vault and derive burners.",
      );
    } catch (accountError) {
      setActionMessage(
        accountError instanceof Error
          ? accountError.message
          : "Account creation failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleDeposit(): Promise<void> {
    if (!activeAccount) {
      setActionMessage("Create or import an account before requesting a deposit.");
      return;
    }

    if (!window.ethereum) {
      setActionMessage(
        "An injected EVM wallet is required to submit the MON deposit transaction.",
      );
      return;
    }

    try {
      setWorking(true);
      const requested = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const depositor = Array.isArray(requested)
        ? String(requested[0] ?? "")
        : "";

      if (!isAddress(depositor)) {
        throw new Error("No depositor address is available from the wallet.");
      }

      const amount = parseEther(depositAmount || "0");
      const relay = await requestDeposit([
        { token: MON_NATIVE_TOKEN, amount, depositor },
      ]);
      setRelayId(relay.relayId);

      await window.ethereum.request({
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

      setRegistry((current) => ({
        ...current,
        activity: appendActivity(current.activity, {
          action: "Deposit requested",
          scope: "Private vault",
          source: "Private",
          privateImpact: `+${formatMon(amount)} MON pending into vault`,
          status: "submitted",
          txRef: relay.relayId,
        }),
      }));

      setActionMessage(
        "Deposit submitted. Track the relay in the right rail until it settles.",
      );
    } catch (depositError) {
      setActionMessage(
        depositError instanceof Error
          ? depositError.message
          : "Deposit request failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleTrade(): Promise<void> {
    if (!wallet || !selectedMarket) {
      setActionMessage("Load a market and initialize the private wallet first.");
      return;
    }

    if (!isConfiguredAddress(selectedMarket.contractAddress)) {
      setActionMessage(
        "Set BLINDSIDE_MARKET_ADDRESS after deployment so burner trades can target the live contract.",
      );
      return;
    }

    try {
      setWorking(true);
      setTimelineStage(1);

      const amount = parseEther(tradeAmount || "0");
      const burnerIndex = registry.nextBurnerIndex;
      const burner = await wallet.burner.addressOf(burnerIndex);
      const positionId = createClientId("pos");

      setRegistry((current) => ({
        ...current,
        nextBurnerIndex: current.nextBurnerIndex + 1,
        positions: [
          {
            id: positionId,
            marketId: selectedMarket.id,
            burnerIndex,
            burnerAddress: burner.address,
            side,
            amountWei: amount.toString(),
            placedAt: new Date().toISOString(),
            state: "idle",
          },
          ...current.positions,
        ],
        activity: appendActivity(current.activity, {
          action: "Burner derived",
          marketId: selectedMarket.id,
          scope: "Derived privately",
          source: "Derived privately",
          publicAddress: burner.address,
          privateImpact: `${activeBurnerLabel} linked privately to ${selectedMarket.id}`,
          status: "ready",
        }),
      }));

      setTimelineStage(2);
      const fundResult = await wallet.burner.fund(burnerIndex, {
        chainId: MONAD_CHAIN_ID,
        poolAddress: UNLINK_POOL_ADDRESS,
        token: MON_NATIVE_TOKEN,
        amount,
      });
      setRelayId(fundResult.relayId);
      await waitForConfirmation(fundResult.relayId, { timeout: 300000 });

      setRegistry((current) => ({
        ...current,
        positions: current.positions.map((position) =>
          position.id === positionId
            ? { ...position, state: "funded", fundRelayId: fundResult.relayId }
            : position,
        ),
        activity: appendActivity(current.activity, {
          action: "Burner funded",
          marketId: selectedMarket.id,
          scope: "Burner funding",
          source: "Private",
          publicAddress: burner.address,
          privateImpact: `-${formatMon(amount)} MON from vault into burner ${labelBurner(
            burnerIndex,
          )}`,
          status: "succeeded",
          txRef: fundResult.relayId,
        }),
      }));

      const functionName = side === "YES" ? "buyYes" : "buyNo";
      const calldata = encodeFunctionData({
        abi: binaryPriceMarketAbi,
        functionName,
      });

      setTimelineStage(3);
      const tradeResult = await wallet.burner.send(burnerIndex, {
        to: selectedMarket.contractAddress as Address,
        data: calldata,
        value: amount,
      });

      setTimelineStage(4);
      setRegistry((current) => ({
        ...current,
        positions: current.positions.map((position) =>
          position.id === positionId
            ? {
                ...position,
                state: "in-market",
                tradeTxHash: tradeResult.txHash,
              }
            : position,
        ),
        activity: appendActivity(current.activity, {
          action: `${side} trade placed`,
          marketId: selectedMarket.id,
          scope: "Market trade",
          source: "Public",
          publicAddress: burner.address,
          privateImpact: `${formatMon(amount)} MON added to ${side} exposure`,
          status: "broadcast",
          txRef: tradeResult.txHash,
        }),
      }));

      setTimelineStage(5);
      setActionMessage(
        `Trade sent from ${labelBurner(
          burnerIndex,
        )}. Blindside now maps that public fill back to your private account.`,
      );
      void loadMarkets(false);
    } catch (tradeError) {
      setActionMessage(
        tradeError instanceof Error ? tradeError.message : "Trade submission failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleClaim(position: BurnerPosition): Promise<void> {
    if (!wallet || !selectedMarket) {
      return;
    }

    if (!isConfiguredAddress(selectedMarket.contractAddress)) {
      setActionMessage("A live market address is required before claiming.");
      return;
    }

    try {
      setWorking(true);
      setTimelineStage(3);

      const claimTx = await wallet.burner.send(position.burnerIndex, {
        to: selectedMarket.contractAddress as Address,
        data: encodeFunctionData({
          abi: binaryPriceMarketAbi,
          functionName: "claim",
        }),
      });

      const estimatedPayout = estimatePayout(position, selectedMarket);
      const sweepTx = await wallet.burner.sweepToPool(position.burnerIndex, {
        chainId: MONAD_CHAIN_ID,
        poolAddress: UNLINK_POOL_ADDRESS,
        token: MON_NATIVE_TOKEN,
      });

      setTimelineStage(5);
      setRegistry((current) => ({
        ...current,
        positions: current.positions.map((entry) =>
          entry.id === position.id
            ? {
                ...entry,
                state: "swept",
                claimTxHash: claimTx.txHash,
                sweepTxHash: sweepTx.txHash,
                payoutWei: estimatedPayout.toString(),
              }
            : entry,
        ),
        activity: appendActivity(
          appendActivity(current.activity, {
            action: "Claim broadcast",
            marketId: position.marketId,
            scope: "Claim",
            source: "Public",
            publicAddress: position.burnerAddress,
            privateImpact: "Winning claim sent from burner",
            status: "broadcast",
            txRef: claimTx.txHash,
          }),
          {
            action: "Sweep to vault",
            marketId: position.marketId,
            scope: "Sweep",
            source: "Private",
            publicAddress: position.burnerAddress,
            privateImpact: `+${formatMon(estimatedPayout)} MON back into private vault`,
            status: "broadcast",
            txRef: sweepTx.txHash,
          },
        ),
      }));
      setActionMessage(
        `${labelBurner(position.burnerIndex)} claimed and swept back into the private pool.`,
      );
    } catch (claimError) {
      setActionMessage(
        claimError instanceof Error ? claimError.message : "Claim flow failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function handleFetchResolverPreview(): Promise<void> {
    if (!selectedMarket) {
      return;
    }

    try {
      setResolverLoading(true);
      const response = await fetch(
        apiUrl(`/api/admin/pyth-update?marketId=${selectedMarket.id}`),
      );

      if (!response.ok) {
        throw new Error(`Resolver preview responded with ${response.status}.`);
      }

      const payload = (await response.json()) as ResolverPreview;
      setResolverPreview(payload);
      setActionMessage(
        "Fresh Pyth payload loaded. The operator can now call resolve() with the returned update data.",
      );
    } catch (previewError) {
      setActionMessage(
        previewError instanceof Error
          ? previewError.message
          : "Resolver preview failed.",
      );
    } finally {
      setResolverLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Blindside / Monad Testnet</p>
          <h1>Private prediction execution terminal</h1>
          <p className="subtle">
            Unlink funds the private vault. Burners execute publicly. Blindside
            privately recombines the exposure.
          </p>
        </div>
        <div className="header-meta">
          <span className="pill private">Private funding via Unlink</span>
          <span className="pill public">Public execution via burner</span>
          <span className="pill derived">Derived privately</span>
        </div>
      </header>

      <main className="terminal-grid">
        <aside className="panel rail">
          <section className="card">
            <div className="section-head">
              <span className="eyebrow">Wallet</span>
              <span className={`status-chip ${ready ? "good" : "muted"}`}>
                {ready ? "Ready" : "Booting"}
              </span>
            </div>
            <div className="stack">
              <div className="keyline">
                <span>Private address</span>
                <strong className="mono">
                  {activeAccount?.address ?? "No Unlink account"}
                </strong>
              </div>
              <div className="keyline">
                <span>Vault MON</span>
                <strong>{formatMon(vaultBalance)} MON</strong>
              </div>
              <div className="keyline">
                <span>Pending private jobs</span>
                <strong>
                  {pendingDeposits.length + pendingWithdrawals.length} queued
                </strong>
              </div>
              {error ? (
                <p className="error-text">{error.message}</p>
              ) : null}
            </div>

            {!walletExists ? (
              <div className="stack">
                <button
                  className="primary-button"
                  disabled={busy || working}
                  onClick={() => {
                    void handleCreateWallet();
                  }}
                >
                  Create private wallet
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
                  className="secondary-button"
                  disabled={busy || working}
                  onClick={() => {
                    void handleImportWallet();
                  }}
                >
                  Import wallet
                </button>
              </div>
            ) : !activeAccount ? (
              <button
                className="primary-button"
                disabled={busy || working}
                onClick={() => {
                  void handleCreateAccount();
                }}
              >
                Create first account
              </button>
            ) : (
              <div className="stack">
                <label className="field-label">Deposit MON to private vault</label>
                <div className="inline-field">
                  <input
                    className="terminal-input"
                    value={depositAmount}
                    onChange={(event) => {
                      setDepositAmount(event.target.value);
                    }}
                  />
                  <button
                    className="secondary-button"
                    disabled={busy || working}
                    onClick={() => {
                      void handleDeposit();
                    }}
                  >
                    Request deposit
                  </button>
                </div>
                <p className="helper">
                  Public: the depositor EOA and pool deposit tx. Private: the
                  new vault balance and note ownership.
                </p>
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-head">
              <span className="eyebrow">Privacy rail</span>
            </div>
            <div className="rail-map">
              <div className="map-node">
                <span className="pill private">Private</span>
                <strong>Unlink vault</strong>
                <span>{formatMon(vaultBalance)} MON shielded</span>
              </div>
              <div className="map-node">
                <span className="pill derived">Derived privately</span>
                <strong>Active burner</strong>
                <span>{activeBurnerLabel}</span>
              </div>
              <div className="map-node">
                <span className="pill public">Public</span>
                <strong>Market contract</strong>
                <span className="mono">
                  {selectedMarket
                    ? compactAddress(selectedMarket.contractAddress)
                    : "Not loaded"}
                </span>
              </div>
              <div className="map-node">
                <span className="pill private">Private</span>
                <strong>Return path</strong>
                <span>Claim to burner, sweep to pool</span>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <span className="eyebrow">Burner registry</span>
              <span className="mono">{burnerIds.size} in use</span>
            </div>
            <div className="list-stack">
              {registry.positions.length === 0 ? (
                <p className="helper">No burners linked yet.</p>
              ) : (
                registry.positions.slice(0, 8).map((position) => {
                  const market =
                    markets.find((entry) => entry.id === position.marketId) ?? null;
                  const lifecycle = resolveLifecycle(position, market);

                  return (
                    <button
                      key={position.id}
                      className="list-row ghost-button"
                      onClick={() => {
                        startTransition(() => {
                          setSelectedMarketId(position.marketId);
                          setRoute("markets");
                        });
                      }}
                    >
                      <div>
                        <strong>{labelBurner(position.burnerIndex)}</strong>
                        <span className="mono">{compactAddress(position.burnerAddress)}</span>
                      </div>
                      <div className="align-right">
                        <span>{lifecycle}</span>
                        <span>
                          {formatMon(BigInt(position.amountWei))} MON {position.side}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </aside>

        <section className="panel center">
          <section className="hero-banner">
            <p>
              Your positions execute publicly from burners. Only this app maps
              them back to your Unlink vault, your aggregate exposure, and your
              cost basis.
            </p>
          </section>

          <nav className="route-tabs">
            {routeOptions.map((option) => (
              <button
                key={option.key}
                className={option.key === route ? "tab active" : "tab"}
                onClick={() => {
                  setRoute(option.key);
                }}
              >
                {option.label}
              </button>
            ))}
          </nav>

          <section className="metric-grid">
            <MetricCard
              label="Private NAV"
              value={`${formatMon(privateNav)} MON`}
              note="Vault balance + claimable winning exposure"
              tone="private"
            />
            <MetricCard
              label="Open Exposure"
              value={`${formatMon(openExposure)} MON`}
              note="Unswept capital currently linked to burners"
              tone="derived"
            />
            <MetricCard
              label="Realized PnL"
              value={`${formatSignedMon(realizedPnl)} MON`}
              note="Claims already swept back to the vault"
              tone="private"
            />
            <MetricCard
              label="Burners In Use"
              value={String(burnerIds.size)}
              note="Disposable public execution accounts"
              tone="public"
            />
          </section>

          {route === "dashboard" ? (
            <>
              <section className="card split-grid">
                <div>
                  <div className="section-head">
                    <span className="eyebrow">Private</span>
                    <strong>Your aggregate state</strong>
                  </div>
                  <div className="detail-stack">
                    <div className="keyline">
                      <span>Vault balance</span>
                      <strong>{formatMon(vaultBalance)} MON</strong>
                    </div>
                    <div className="keyline">
                      <span>Claimable winners</span>
                      <strong>{formatMon(claimableValue)} MON</strong>
                    </div>
                    <div className="keyline">
                      <span>Open market links</span>
                      <strong>{registry.positions.length}</strong>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="section-head">
                    <span className="eyebrow">Public</span>
                    <strong>Selected market snapshot</strong>
                  </div>
                  {selectedMarket ? (
                    <div className="detail-stack">
                      <div className="keyline">
                        <span>Question</span>
                        <strong>{selectedMarket.question}</strong>
                      </div>
                      <div className="keyline">
                        <span>YES pool</span>
                        <strong>{formatMon(BigInt(selectedMarket.yesPoolWei))} MON</strong>
                      </div>
                      <div className="keyline">
                        <span>NO pool</span>
                        <strong>{formatMon(BigInt(selectedMarket.noPoolWei))} MON</strong>
                      </div>
                    </div>
                  ) : (
                    <p className="helper">No market loaded.</p>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="section-head">
                  <span className="eyebrow">Open Markets</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Cutoff</th>
                        <th>Public split</th>
                        <th>Your exposure</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {markets.map((market) => {
                        const exposure = registry.positions
                          .filter((position) => position.marketId === market.id)
                          .reduce((sum, position) => sum + BigInt(position.amountWei), 0n);

                        return (
                          <tr
                            key={market.id}
                            className={market.id === selectedMarket?.id ? "selected-row" : ""}
                            onClick={() => {
                              startTransition(() => {
                                setSelectedMarketId(market.id);
                                setRoute("markets");
                              });
                            }}
                          >
                            <td>{market.question}</td>
                            <td>{formatDate(market.cutoffTime)}</td>
                            <td>
                              {formatSplit(
                                BigInt(market.yesPoolWei),
                                BigInt(market.noPoolWei),
                              )}
                            </td>
                            <td>{formatMon(exposure)} MON</td>
                            <td>{market.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {route === "markets" ? (
            <>
              <section className="card">
                <div className="section-head">
                  <span className="eyebrow">Market list</span>
                  <input
                    className="terminal-input search"
                    placeholder="Filter markets"
                    value={marketFilter}
                    onChange={(event) => {
                      setMarketFilter(event.target.value);
                    }}
                  />
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Question</th>
                        <th>Strike</th>
                        <th>Cutoff</th>
                        <th>Your exposure</th>
                        <th>Oracle</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMarkets.map((market) => {
                        const exposure = registry.positions
                          .filter((position) => position.marketId === market.id)
                          .reduce((sum, position) => sum + BigInt(position.amountWei), 0n);

                        return (
                          <tr
                            key={market.id}
                            className={market.id === selectedMarket?.id ? "selected-row" : ""}
                            onClick={() => {
                              startTransition(() => {
                                setSelectedMarketId(market.id);
                              });
                            }}
                          >
                            <td>{market.question}</td>
                            <td>${market.strikeDisplay}</td>
                            <td>{formatDate(market.cutoffTime)}</td>
                            <td>{formatMon(exposure)} MON</td>
                            <td>{market.resolveSource}</td>
                            <td>{market.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card split-grid">
                <div>
                  <div className="section-head">
                    <span className="eyebrow">Public Market View</span>
                  </div>
                  {selectedMarket ? (
                    <div className="detail-stack">
                      <div className="keyline">
                        <span>Market</span>
                        <strong>{selectedMarket.question}</strong>
                      </div>
                      <div className="keyline">
                        <span>Contract</span>
                        <strong className="mono">
                          {selectedMarket.contractAddress}
                        </strong>
                      </div>
                      <div className="keyline">
                        <span>YES / NO pools</span>
                        <strong>
                          {formatMon(BigInt(selectedMarket.yesPoolWei))} /{" "}
                          {formatMon(BigInt(selectedMarket.noPoolWei))} MON
                        </strong>
                      </div>
                      <div className="keyline">
                        <span>Pyth source</span>
                        <strong className="mono">
                          {compactAddress(selectedMarket.pythBetaAddress)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <p className="helper">Select a market to inspect it.</p>
                  )}
                </div>

                <div>
                  <div className="section-head">
                    <span className="eyebrow">Your Private View</span>
                  </div>
                  {positionsForSelectedMarket.length === 0 ? (
                    <p className="helper">
                      No private positions are linked to this market yet.
                    </p>
                  ) : (
                    <div className="list-stack">
                      {positionsForSelectedMarket.map((position) => {
                        const lifecycle = resolveLifecycle(position, selectedMarket);
                        const claimable = estimatePayout(position, selectedMarket);

                        return (
                          <div key={position.id} className="list-row static-row">
                            <div>
                              <strong>{labelBurner(position.burnerIndex)}</strong>
                              <span className="mono">
                                {compactAddress(position.burnerAddress)}
                              </span>
                            </div>
                            <div className="align-right">
                              <span>
                                {formatMon(BigInt(position.amountWei))} MON {position.side}
                              </span>
                              <span>{lifecycle}</span>
                            </div>
                            {lifecycle === "claimable" ? (
                              <button
                                className="secondary-button tight-button"
                                disabled={busy || working}
                                onClick={() => {
                                  void handleClaim(position);
                                }}
                              >
                                Claim + sweep {formatMon(claimable)} MON
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : null}

          {route === "activity" ? (
            <section className="card">
              <div className="section-head">
                <span className="eyebrow">Activity</span>
                <span className="mono">
                  {historyLoading ? "Refreshing private history" : "Live"}
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Source</th>
                      <th>Public address</th>
                      <th>Private impact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.timestamp)}</td>
                        <td>{entry.action}</td>
                        <td>{entry.source}</td>
                        <td className="mono">
                          {entry.publicAddress ? compactAddress(entry.publicAddress) : "Private"}
                        </td>
                        <td>{entry.privateImpact}</td>
                        <td>{entry.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {route === "resolve" ? (
            <section className="card">
              <div className="section-head">
                <span className="eyebrow">Operator resolve</span>
                <button
                  className="secondary-button"
                  disabled={resolverLoading}
                  onClick={() => {
                    void handleFetchResolverPreview();
                  }}
                >
                  {resolverLoading ? "Fetching Pyth payload" : "Load Pyth payload"}
                </button>
              </div>
              {resolverPreview ? (
                <div className="detail-stack">
                  <div className="keyline">
                    <span>Latest MON/USD</span>
                    <strong>${resolverPreview.latestPriceDisplay}</strong>
                  </div>
                  <div className="keyline">
                    <span>Settlement preview</span>
                    <strong>
                      {resolverPreview.resolvesYes
                        ? "YES resolves above strike"
                        : "NO resolves below strike"}
                    </strong>
                  </div>
                  <div className="keyline">
                    <span>Publish time</span>
                    <strong>
                      {resolverPreview.publishTime
                        ? formatDate(new Date(resolverPreview.publishTime * 1000).toISOString())
                        : "n/a"}
                    </strong>
                  </div>
                  <div className="code-block">
                    <code>pnpm resolve:market</code>
                  </div>
                  <div className="code-block">
                    <code>{resolverPreview.updateDataHex[0] ?? "0x"}</code>
                  </div>
                </div>
              ) : (
                <p className="helper">
                  Fetch the beta Hermes payload, then submit it with the included
                  TypeScript resolver script.
                </p>
              )}
            </section>
          ) : null}
        </section>

        <aside className="panel rail">
          <section className="card">
            <div className="section-head">
              <span className="eyebrow">Trade ticket</span>
              <span className={`status-chip ${selectedMarket?.status === "Open" ? "good" : "warn"}`}>
                {selectedMarket?.status ?? "No market"}
              </span>
            </div>

            {selectedMarket ? (
              <div className="stack">
                <p className="trade-question">{selectedMarket.question}</p>

                <div className="segmented">
                  <button
                    className={side === "YES" ? "segment active" : "segment"}
                    onClick={() => {
                      setSide("YES");
                    }}
                  >
                    YES
                  </button>
                  <button
                    className={side === "NO" ? "segment active" : "segment"}
                    onClick={() => {
                      setSide("NO");
                    }}
                  >
                    NO
                  </button>
                </div>

                <label className="field-label">MON amount</label>
                <input
                  className="terminal-input"
                  value={tradeAmount}
                  onChange={(event) => {
                    setTradeAmount(event.target.value);
                  }}
                />

                <div className="visibility-box">
                  <div>
                    <span className="pill public">Public</span>
                    <p>Burner address, trade side, size, contract call.</p>
                  </div>
                  <div>
                    <span className="pill private">Private</span>
                    <p>Vault linkage, portfolio totals, cost basis, and NAV.</p>
                  </div>
                </div>

                <div className="detail-stack compact">
                  <div className="keyline">
                    <span>Funding source</span>
                    <strong>Unlink vault</strong>
                  </div>
                  <div className="keyline">
                    <span>Execution address</span>
                    <strong>{activeBurnerLabel}</strong>
                  </div>
                </div>

                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    working ||
                    !ready ||
                    !activeAccount ||
                    selectedMarket.status !== "Open"
                  }
                  onClick={() => {
                    void handleTrade();
                  }}
                >
                  Fund burner + place trade
                </button>
              </div>
            ) : (
              <p className="helper">No market selected.</p>
            )}
          </section>

          <section className="card">
            <div className="section-head">
              <span className="eyebrow">Transaction timeline</span>
              <span className="mono">{relayStateLabel}</span>
            </div>
            <div className="list-stack">
              {timelineSteps.map((step, index) => (
                <div key={step} className="timeline-row">
                  <span
                    className={
                      index + 1 <= timelineStage
                        ? "timeline-dot active"
                        : "timeline-dot"
                    }
                  />
                  <span>{step}</span>
                </div>
              ))}
            </div>
            {relayStatus.txHash ? (
              <div className="keyline">
                <span>Relay hash</span>
                <strong className="mono">{compactAddress(relayStatus.txHash)}</strong>
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="section-head">
              <span className="eyebrow">Operator + notes</span>
            </div>
            <div className="detail-stack">
              <div className="keyline">
                <span>Oracle contract</span>
                <strong className="mono">
                  {selectedMarket
                    ? compactAddress(selectedMarket.pythBetaAddress)
                    : "n/a"}
                </strong>
              </div>
              <div className="keyline">
                <span>Market contract</span>
                <strong className="mono">
                  {selectedMarket
                    ? compactAddress(selectedMarket.contractAddress)
                    : "n/a"}
                </strong>
              </div>
              <div className="keyline">
                <span>Cutoff</span>
                <strong>
                  {selectedMarket ? formatDate(selectedMarket.cutoffTime) : "n/a"}
                </strong>
              </div>
              <p className="helper">{actionMessage}</p>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "private" | "public" | "derived";
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  );
}

function apiUrl(pathname: string): string {
  return `${API_BASE_URL}${pathname}`;
}

async function hydrateMarketWithChain(
  market: BlindsideMarket,
): Promise<BlindsideMarket> {
  if (!isConfiguredAddress(market.contractAddress)) {
    return market;
  }

  try {
    const [yesPool, noPool, cutoffTime, resolved, resolvedOutcome, settlementPrice] =
      await Promise.all([
        publicClient.readContract({
          address: market.contractAddress as Address,
          abi: binaryPriceMarketAbi,
          functionName: "yesPool",
        }),
        publicClient.readContract({
          address: market.contractAddress as Address,
          abi: binaryPriceMarketAbi,
          functionName: "noPool",
        }),
        publicClient.readContract({
          address: market.contractAddress as Address,
          abi: binaryPriceMarketAbi,
          functionName: "cutoffTime",
        }),
        publicClient.readContract({
          address: market.contractAddress as Address,
          abi: binaryPriceMarketAbi,
          functionName: "resolved",
        }),
        publicClient.readContract({
          address: market.contractAddress as Address,
          abi: binaryPriceMarketAbi,
          functionName: "resolvedOutcome",
        }),
        publicClient.readContract({
          address: market.contractAddress as Address,
          abi: binaryPriceMarketAbi,
          functionName: "settlementPrice",
        }),
      ]);

    return {
      ...market,
      yesPoolWei: yesPool.toString(),
      noPoolWei: noPool.toString(),
      cutoffTime: new Date(Number(cutoffTime) * 1000).toISOString(),
      status: resolved
        ? "Resolved"
        : Date.now() >= Number(cutoffTime) * 1000
          ? "Locked"
          : "Open",
      resolvedOutcome: resolved ? Boolean(resolvedOutcome) : null,
      settlementPriceE8: resolved ? Number(settlementPrice) : null,
      settlementTimestamp: resolved ? new Date().toISOString() : null,
    };
  } catch {
    return market;
  }
}

function appendActivity(
  current: BlindsideActivity[],
  partial: Omit<BlindsideActivity, "id" | "timestamp">,
): BlindsideActivity[] {
  return [
    {
      ...partial,
      id: createClientId("act"),
      timestamp: new Date().toISOString(),
    },
    ...current,
  ].slice(0, 120);
}

function estimatePayout(
  position: BurnerPosition,
  market: BlindsideMarket | null,
): bigint {
  if (!market || market.status !== "Resolved" || market.resolvedOutcome == null) {
    return 0n;
  }

  const yesPool = BigInt(market.yesPoolWei);
  const noPool = BigInt(market.noPoolWei);
  const totalPool = yesPool + noPool;
  const winningPool = market.resolvedOutcome ? yesPool : noPool;
  const isWinner =
    (market.resolvedOutcome && position.side === "YES") ||
    (!market.resolvedOutcome && position.side === "NO");

  if (!isWinner || winningPool === 0n) {
    return 0n;
  }

  return (BigInt(position.amountWei) * totalPool) / winningPool;
}

function resolveLifecycle(
  position: BurnerPosition,
  market: BlindsideMarket | null,
): BurnerLifecycle {
  if (position.state === "swept") {
    return "swept";
  }

  if (
    position.state === "in-market" &&
    market?.status === "Resolved" &&
    estimatePayout(position, market) > 0n
  ) {
    return "claimable";
  }

  return position.state;
}

function isConfiguredAddress(value: string): boolean {
  return isAddress(value) && value.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

function formatMon(amount: bigint): string {
  const [whole, fraction = ""] = formatEther(amount).split(".");
  return `${whole}.${fraction.padEnd(4, "0").slice(0, 4)}`;
}

function formatSignedMon(amount: bigint): string {
  if (amount === 0n) {
    return "0.0000";
  }

  return `${amount > 0n ? "+" : "-"}${formatMon(amount > 0n ? amount : -amount)}`;
}

function formatMonFromDelta(delta: string): string {
  const value = BigInt(delta);
  const absolute = value >= 0n ? value : -value;
  return formatMon(absolute);
}

function formatSplit(yesPool: bigint, noPool: bigint): string {
  const total = yesPool + noPool;
  if (total === 0n) {
    return "0% / 0%";
  }

  const yesPercent = Number((yesPool * 10000n) / total) / 100;
  const noPercent = 100 - yesPercent;
  return `${yesPercent.toFixed(2)}% / ${noPercent.toFixed(2)}%`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelBurner(index: number): string {
  return `B-${String(index).padStart(2, "0")}`;
}

function compactAddress(value: string): string {
  if (!value || value.length < 12) {
    return value;
  }

  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function toHexValue(value: bigint): string {
  if (value === 0n) {
    return "0x0";
  }

  return `0x${value.toString(16)}`;
}
