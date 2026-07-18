import type { KeyboardDefinition, Project } from "./domain";
import {
  appendSafetyEvent,
  createEmptySafetyLedger,
  parseSafetyLedger,
  type SafetyEventKind,
  type SafetyLedger,
} from "./safety";

const SAFETY_LEDGER_STORAGE_KEY = "qmkui.safety-ledger.v1";

type LocalStoragePort = Pick<Storage, "getItem" | "setItem">;

export type SafetyLedgerStorage = {
  load(): SafetyLedger;
  save(ledger: SafetyLedger): void;
  append(
    kind: SafetyEventKind,
    project: Project,
    keyboard: KeyboardDefinition,
    occurredAt: string,
  ): SafetyLedger;
};

export function createSafetyLedgerStorage(storage: LocalStoragePort): SafetyLedgerStorage {
  return {
    load() {
      const serialized = storage.getItem(SAFETY_LEDGER_STORAGE_KEY);
      if (!serialized) {
        return createEmptySafetyLedger();
      }

      try {
        return parseSafetyLedger(JSON.parse(serialized));
      } catch {
        return createEmptySafetyLedger();
      }
    },
    save(ledger) {
      storage.setItem(SAFETY_LEDGER_STORAGE_KEY, JSON.stringify(ledger));
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
  return createSafetyLedgerStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
}
