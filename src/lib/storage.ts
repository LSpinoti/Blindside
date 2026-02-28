import type { PrivateRegistry } from "./constants";

const STORAGE_KEY = "blindside-private-registry/v1";

export function readRegistry(): PrivateRegistry {
  if (typeof window === "undefined") {
    return createEmptyRegistry();
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return createEmptyRegistry();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<PrivateRegistry>;

    return {
      version: 1,
      nextBurnerIndex:
        typeof parsed.nextBurnerIndex === "number" ? parsed.nextBurnerIndex : 0,
      positions: Array.isArray(parsed.positions) ? parsed.positions : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      createdWalletAt:
        typeof parsed.createdWalletAt === "string"
          ? parsed.createdWalletAt
          : undefined,
      importedWalletAt:
        typeof parsed.importedWalletAt === "string"
          ? parsed.importedWalletAt
          : undefined,
    };
  } catch {
    return createEmptyRegistry();
  }
}

export function writeRegistry(registry: PrivateRegistry): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
}

export function createClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createEmptyRegistry(): PrivateRegistry {
  return {
    version: 1,
    nextBurnerIndex: 0,
    positions: [],
    activity: [],
  };
}
