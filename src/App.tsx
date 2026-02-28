import { useEffect, useState } from "react";
import { useUnlink, useUnlinkHistory } from "@unlink-xyz/react";

import { PriceChart } from "./components/PriceChart";
import { API_BASE_URL, MON_NATIVE_TOKEN } from "./lib/constants";
import masqueradeLogo from "../shared/masquerade.svg";

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
    walletExists,
  } = useUnlink();
  const { history, loading: historyLoading } = useUnlinkHistory();

  const [board, setBoard] = useState<PriceBoardResponse | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState("");
  const [selectedMarketId, setSelectedMarketId] = useState("");
  const [depositAmount, setDepositAmount] = useState("0.50");
  const [importText, setImportText] = useState("");
  const [working, setWorking] = useState(false);

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
  const vaultBalance = balances[MON_NATIVE_TOKEN] ?? 0n;
  const totalPendingJobs = pendingDeposits.length + pendingWithdrawals.length;

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
      setWorking(true);
      await createWallet();
    } finally {
      setWorking(false);
    }
  }

  async function handleImportWallet(): Promise<void> {
    if (!importText.trim()) {
      return;
    }

    try {
      setWorking(true);
      await importWallet(importText.trim());
      setImportText("");
    } finally {
      setWorking(false);
    }
  }

  async function handleCreateAccount(): Promise<void> {
    try {
      setWorking(true);
      await createAccount();
    } finally {
      setWorking(false);
    }
  }

  async function handleDeposit(): Promise<void> {
    if (!activeAccount || !window.ethereum) {
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

      if (!depositor.startsWith("0x")) {
        throw new Error("No injected EOA available for deposit.");
      }

      const relay = await requestDeposit([
        {
          token: MON_NATIVE_TOKEN,
          amount: parseMon(depositAmount),
          depositor,
        },
      ]);

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
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <div className="brand-lockup">
            <img className="brand-mark" src={masqueradeLogo} alt="" aria-hidden="true" />
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

      <main className="layout-grid">
        <aside className="sidebar">
          <section className="card">
            <SectionTitle title="Private vault" />
            <div className="detail-list">
              <DetailRow label="Vault MON" value={`${formatMon(vaultBalance)} MON`} />
              <DetailRow label="Pending jobs" value={String(totalPendingJobs)} />
              <DetailRow
                label="Account"
                value={activeAccount ? compactAddress(activeAccount.address) : "Not created"}
              />
            </div>

            {!walletExists ? (
              <div className="form-stack">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || working}
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
                  disabled={busy || working}
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
                disabled={busy || working}
                onClick={() => {
                  void handleCreateAccount();
                }}
              >
                Create account
              </button>
            ) : (
              <div className="form-stack">
                <label className="field-label">Deposit MON</label>
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
                    disabled={busy || working}
                    onClick={() => {
                      void handleDeposit();
                    }}
                  >
                    Deposit
                  </button>
                </div>
              </div>
            )}

            {error ? <p className="error-text">{error.message}</p> : null}
          </section>

          <section className="card">
            <SectionTitle title="Private activity" />
            <div className="history-list">
              {historyLoading ? (
                <p className="muted-line">Syncing history…</p>
              ) : history.length === 0 ? (
                <p className="muted-line">No private activity yet.</p>
              ) : (
                history.slice(0, 6).map((entry) => (
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
          </section>
        </aside>

        <section className="main-panel">
          {boardError ? <p className="error-banner">{boardError}</p> : null}

          <section className="selected-card">
            <div className="selected-head">
              <div>
                <p className="eyebrow">Selected market</p>
                <h2>
                  {selectedMarket
                    ? `${selectedMarket.displaySymbol} 24 hour up/down`
                    : "Loading"}
                </h2>
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
                  height={280}
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
                  <div>
                    <strong>{market.displaySymbol}</strong>
                    <span>{market.asset} 24 hour up/down</span>
                  </div>
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

  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
