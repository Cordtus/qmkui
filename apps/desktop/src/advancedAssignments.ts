import type { Project } from "./domain";
import { keycodeCategories } from "./keycodes";

export type LayerAssignmentAction = "MO" | "TG" | "TO" | "DF" | "OSL" | "TT";

export type AdvancedAssignment =
  | {
      kind: "layer";
      action: LayerAssignmentAction;
      targetLayerIndex: number;
      qmk: string;
    }
  | {
      kind: "layerTap";
      targetLayerIndex: number;
      tapKey: string;
      qmk: string;
    }
  | {
      kind: "modTap";
      modifier: string;
      tapKey: string;
      qmk: string;
    };

export const layerAssignmentActions: Array<{ value: LayerAssignmentAction; label: string }> = [
  { value: "MO", label: "Hold" },
  { value: "TG", label: "Toggle" },
  { value: "TO", label: "Switch" },
  { value: "DF", label: "Default" },
  { value: "OSL", label: "One-shot" },
  { value: "TT", label: "Tap-toggle" },
];

export const modTapModifiers: Array<{ value: string; label: string }> = [
  { value: "MOD_LCTL", label: "Ctrl" },
  { value: "MOD_LSFT", label: "Shift" },
  { value: "MOD_LALT", label: "Alt" },
  { value: "MOD_LGUI", label: "Win" },
  { value: "MOD_RCTL", label: "Ctrl R" },
  { value: "MOD_RSFT", label: "Shift R" },
  { value: "MOD_RALT", label: "Alt R" },
  { value: "MOD_RGUI", label: "Win R" },
];

const layerActionValues = new Set(layerAssignmentActions.map((action) => action.value));
const modTapModifierValues = new Set(modTapModifiers.map((modifier) => modifier.value));
const supportedTapKeys = new Set(
  keycodeCategories
    .flatMap((category) => category.entries)
    .filter((entry) => ["basic", "navigation", "modifier"].includes(entry.kind))
    .map((entry) => entry.qmk),
);

export function parseAdvancedAssignment(qmk: string): AdvancedAssignment | null {
  const trimmed = qmk.trim();
  const alias = parseModTapAlias(trimmed);
  if (alias) {
    return alias;
  }

  const call = parseCall(trimmed);
  if (!call) {
    return null;
  }

  if (layerActionValues.has(call.name as LayerAssignmentAction) && call.args.length === 1) {
    const targetLayerIndex = parseLayerIndex(call.args[0]);
    if (targetLayerIndex === null) {
      return null;
    }
    return {
      kind: "layer",
      action: call.name as LayerAssignmentAction,
      targetLayerIndex,
      qmk: layerKeycode(call.name as LayerAssignmentAction, targetLayerIndex),
    };
  }

  if (call.name === "LT" && call.args.length === 2) {
    const targetLayerIndex = parseLayerIndex(call.args[0]);
    const tapKey = normalizeTapKey(call.args[1]);
    if (targetLayerIndex === null || !tapKey) {
      return null;
    }
    return {
      kind: "layerTap",
      targetLayerIndex,
      tapKey,
      qmk: layerTapKeycode(targetLayerIndex, tapKey),
    };
  }

  if (call.name === "MT" && call.args.length === 2) {
    const modifier = normalizeModifier(call.args[0]);
    const tapKey = normalizeTapKey(call.args[1]);
    if (!modifier || !tapKey) {
      return null;
    }
    return {
      kind: "modTap",
      modifier,
      tapKey,
      qmk: modTapKeycode(modifier, tapKey),
    };
  }

  return null;
}

export function layerKeycode(action: LayerAssignmentAction, targetLayerIndex: number): string {
  return `${action}(${targetLayerIndex})`;
}

export function layerTapKeycode(targetLayerIndex: number, tapKey: string): string {
  return `LT(${targetLayerIndex}, ${normalizeTapKey(tapKey) || "KC_NO"})`;
}

export function modTapKeycode(modifier: string, tapKey: string): string {
  return `MT(${normalizeModifier(modifier) || "MOD_LCTL"}, ${normalizeTapKey(tapKey) || "KC_NO"})`;
}

export function suggestedLayerTarget(project: Project, selectedLayerIndex: number): number {
  const layers = [...project.layers].sort((left, right) => left.index - right.index);
  return (
    layers.find((layer) => layer.index > selectedLayerIndex)?.index ??
    layers.find((layer) => layer.index !== selectedLayerIndex)?.index ??
    layers[0]?.index ??
    0
  );
}

function parseCall(value: string): { name: string; args: string[] } | null {
  const match = /^([A-Z0-9_]+)\((.*)\)$/.exec(value);
  if (!match) {
    return null;
  }

  const args = splitTopLevelArgs(match[2]);
  if (args.some((arg) => arg.length === 0)) {
    return null;
  }

  return { name: match[1], args };
}

function splitTopLevelArgs(value: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  args.push(current.trim());
  return args;
}

function parseLayerIndex(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

function parseModTapAlias(qmk: string): AdvancedAssignment | null {
  const alias = /^(LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI)_T\((.+)\)$/.exec(qmk);
  if (!alias) {
    return null;
  }

  const modifier = `MOD_${alias[1]}`;
  const tapKey = normalizeTapKey(alias[2]);
  if (!tapKey) {
    return null;
  }

  return {
    kind: "modTap",
    modifier,
    tapKey,
    qmk: modTapKeycode(modifier, tapKey),
  };
}

function normalizeTapKey(value: string): string {
  const normalized = value.trim().toUpperCase();
  return supportedTapKeys.has(normalized) ? normalized : "";
}

function normalizeModifier(value: string): string {
  const normalized = value.trim().toUpperCase();
  return modTapModifierValues.has(normalized) ? normalized : "";
}
