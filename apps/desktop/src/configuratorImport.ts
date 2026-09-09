import type { KeyboardDefinition, Project } from "./domain";
import { projectFromQmkKeymap, type QmkLayerSource } from "./qmkMetadata";

export type ConfiguratorKeymap = {
  version: number;
  keyboard: string;
  keymap?: string;
  layout: string;
  layers: string[][];
};

export type ConfiguratorImportErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "keyboard-missing"
  | "layout-missing"
  | "no-layers"
  | "layer-mismatch";

export class ConfiguratorImportError extends Error {
  constructor(
    readonly code: ConfiguratorImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConfiguratorImportError";
  }
}

/**
 * Imports a QMK Configurator `keymap.json` export into a native project. The
 * `layers` arrays are positional against the referenced layout's keys; the
 * keyboard must resolve through `resolveKeyboard` (the bundled catalog) or the
 * import reports structured incompatibility.
 */
export function importConfiguratorKeymap(
  json: string,
  resolveKeyboard: (qmkKeyboard: string) => KeyboardDefinition | undefined,
): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ConfiguratorImportError("invalid-json", "keymap.json is not valid JSON.");
  }
  if (!isConfiguratorKeymap(parsed)) {
    throw new ConfiguratorImportError(
      "invalid-json",
      "keymap.json is missing keyboard, layout, or layers.",
    );
  }
  if (parsed.version !== 1) {
    throw new ConfiguratorImportError(
      "unsupported-version",
      `keymap.json version ${parsed.version} is not supported.`,
    );
  }
  const keyboard = resolveKeyboard(parsed.keyboard);
  if (!keyboard) {
    throw new ConfiguratorImportError(
      "keyboard-missing",
      `Keyboard ${parsed.keyboard} is not bundled.`,
    );
  }
  const layout = keyboard.layouts.find((item) => item.id === parsed.layout);
  if (!layout) {
    throw new ConfiguratorImportError(
      "layout-missing",
      `Layout ${parsed.layout} is not available for ${parsed.keyboard}.`,
    );
  }
  if (parsed.layers.length === 0) {
    throw new ConfiguratorImportError("no-layers", "keymap.json has no layers.");
  }
  const mismatchedLayer = parsed.layers.findIndex(
    (layer) => layer.length !== layout.keys.length,
  );
  if (mismatchedLayer !== -1) {
    throw new ConfiguratorImportError(
      "layer-mismatch",
      `Layer ${mismatchedLayer} has ${parsed.layers[mismatchedLayer]?.length ?? 0} keycodes for ${layout.keys.length} layout keys.`,
    );
  }

  const layers: QmkLayerSource[] = parsed.layers.map((keycodes, index) => ({
    id: `layer_${index}`,
    index,
    name: `Layer ${index}`,
    keycodes,
  }));

  return projectFromQmkKeymap({
    id: `project_${parsed.keyboard.replaceAll("/", "_")}`,
    name: `${keyboard.displayName} (${parsed.keymap ?? "imported"})`,
    keyboard,
    layoutId: parsed.layout,
    layers,
    keymapName: parsed.keymap ?? "default",
    catalogVersion: keyboard.source?.version ?? "",
  });
}

function isConfiguratorKeymap(value: unknown): value is ConfiguratorKeymap {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ConfiguratorKeymap).keyboard === "string" &&
    typeof (value as ConfiguratorKeymap).layout === "string" &&
    Array.isArray((value as ConfiguratorKeymap).layers)
  );
}
