import type { FeatureRecord } from "./domain";

export type MacroRecord = FeatureRecord & { actions?: string };

const JSON_MACRO_TOKEN = /^(TAP|HOLD) [A-Z0-9_]+$/;
const DELAY_TOKEN = /^DELAY \d+$/;

/**
 * A macro is JSON-exportable when its action timeline is only simple
 * `TAP`/`HOLD` keycodes and `DELAY` steps; anything else (mod-taps, Unicode,
 * conditionals) requires generated C and blocks JSON export.
 */
export function macroExportMode(actions: string): "json" | "c" {
  const tokens = actions.trim().split(/\s+(?=(?:TAP|HOLD|DELAY)\b)/);
  if (tokens.length === 0 || tokens.every((token) => token.trim() === "")) {
    return "c";
  }
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!JSON_MACRO_TOKEN.test(trimmed) && !DELAY_TOKEN.test(trimmed)) {
      return "c";
    }
  }
  return "json";
}

export function createMacroRecord(name: string, actions: string): MacroRecord {
  return {
    id: `macro_${crypto.randomUUID()}`,
    name: name.trim() || "Untitled",
    exportMode: macroExportMode(actions),
    enabled: true,
    actions,
  };
}
