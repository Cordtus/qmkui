import type { KeyboardDefinition, Project } from "./domain";
import {
  appendSafetyEvent,
  createEmptySafetyLedger,
  parseSafetyLedger,
  type SafetyEventKind,
  type SafetyLedgerAvailability,
  type SafetyLedger,
} from "./safety";

const SAFETY_LEDGER_STORAGE_KEY = "qmkui.safety-ledger.v1";

type LocalStoragePort = Pick<Storage, "getItem" | "setItem">;

export type SafetyLedgerStorage = {
  load(): SafetyLedger;
  availability(): SafetyLedgerAvailability;
  save(ledger: SafetyLedger): void;
  append(
    kind: SafetyEventKind,
    project: Project,
    keyboard: KeyboardDefinition,
    occurredAt: string,
  ): SafetyLedger;
};

export function createSafetyLedgerStorage(
  storage: LocalStoragePort,
  initialAvailability: SafetyLedgerAvailability = "available",
): SafetyLedgerStorage {
  let availability = initialAvailability;

  return {
    load() {
      if (availability !== "available") {
        return createEmptySafetyLedger();
      }

      let serialized: string | null;
      try {
        serialized = storage.getItem(SAFETY_LEDGER_STORAGE_KEY);
      } catch {
        availability = "unavailable";
        return createEmptySafetyLedger();
      }
      if (!serialized) {
        return createEmptySafetyLedger();
      }

      try {
        return parseSafetyLedger(JSON.parse(serialized));
      } catch {
        availability = "corrupt";
        return createEmptySafetyLedger();
      }
    },
    availability() {
      return availability;
    },
    save(ledger) {
      if (availability !== "available") {
        throw new Error("Safety ledger storage is unavailable");
      }
      try {
        storage.setItem(SAFETY_LEDGER_STORAGE_KEY, JSON.stringify(ledger));
      } catch {
        availability = "unavailable";
        throw new Error("Safety ledger storage is unavailable");
      }
    },
    append(kind, project, keyboard, occurredAt) {
      const ledger = appendSafetyEvent(this.load(), kind, project, keyboard, occurredAt);
      this.save(ledger);
      return ledger;
    },
  };
}

export function createMemorySafetyLedgerStorage(): SafetyLedgerStorage {
  const values = new Map<string, string>();
  return createSafetyLedgerStorage(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    "unavailable",
  );
}
