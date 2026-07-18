import { describe, expect, it } from "vitest";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import { createSafetyLedgerStorage } from "./safetyStorage";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("safety ledger storage", () => {
  it("persists append-only backup and decline records across storage instances", () => {
    const storage = createMemoryStorage();
    const first = createSafetyLedgerStorage(storage);

    first.append(
      "backupConfirmed",
      keychronV5MaxProject,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );
    const second = createSafetyLedgerStorage(storage);
    second.append(
      "backupDeclined",
      keychronV5MaxProject,
      keychronV5MaxKeyboard,
      "2026-07-17T20:01:00.000Z",
    );

    expect(second.load().events).toEqual([
      expect.objectContaining({ sequence: 1, kind: "backupConfirmed" }),
      expect.objectContaining({ sequence: 2, kind: "backupDeclined" }),
    ]);
  });

  it("treats malformed local data as an empty ledger", () => {
    const storage = createMemoryStorage();
    storage.setItem("qmkui.safety-ledger.v1", "not-json");

    expect(createSafetyLedgerStorage(storage).load()).toEqual({ version: 1, events: [] });
  });

  it("reports unavailable or corrupt storage so future write preparation can fail closed", () => {
    const corruptStorage = createMemoryStorage();
    corruptStorage.setItem("qmkui.safety-ledger.v1", "not-json");
    const unavailableStorage: Storage = {
      ...createMemoryStorage(),
      getItem: () => {
        throw new Error("storage disabled");
      },
    };

    const corruptLedger = createSafetyLedgerStorage(corruptStorage);
    const unavailableLedger = createSafetyLedgerStorage(unavailableStorage);
    corruptLedger.load();
    unavailableLedger.load();

    expect(corruptLedger.availability()).toBe("corrupt");
    expect(unavailableLedger.availability()).toBe("unavailable");
  });
});
