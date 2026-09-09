import viaV5Max from "../../../fixtures/via/keychron_v5_max_ansi_encoder.json";

export type ViaDefinition = {
  name: string;
  vendorId: string;
  productId: string;
  matrix: { rows: number; cols: number };
  layouts: { labels: string[]; keymap: Array<[number, number]> };
  customKeycodes: unknown[];
  lighting: string;
  customConfig: unknown[];
  customLayout: unknown[];
  menus: unknown[];
};

export type ViaDefinitionSource = {
  qmkKeyboard: string;
  definition: ViaDefinition;
  format: "via-v3";
};

/**
 * Bundled VIA V3 definitions for supported keyboards, so a board VIA's remote
 * database does not know can still be sideloaded in the VIA Design tab. These
 * are sourced from the pinned firmware's `keyboard.json` and normalized into
 * the V3 shape VIA's Design tab accepts.
 */
const viaDefinitions: ViaDefinitionSource[] = [
  {
    qmkKeyboard: "keychron/v5_max/ansi_encoder",
    definition: viaV5Max as unknown as ViaDefinition,
    format: "via-v3",
  },
];

export function viaDefinitionFor(qmkKeyboard: string): ViaDefinitionSource | undefined {
  return viaDefinitions.find((entry) => entry.qmkKeyboard === qmkKeyboard);
}

export function viaDefinitionJson(qmkKeyboard: string): string | undefined {
  const entry = viaDefinitionFor(qmkKeyboard);
  return entry ? JSON.stringify(entry.definition, null, 2) : undefined;
}

export function isValidViaDefinition(value: unknown): value is ViaDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const definition = value as ViaDefinition;
  return (
    typeof definition.name === "string" &&
    typeof definition.vendorId === "string" &&
    typeof definition.productId === "string" &&
    typeof definition.matrix?.rows === "number" &&
    typeof definition.matrix?.cols === "number" &&
    Array.isArray(definition.layouts?.keymap) &&
    definition.layouts.keymap.every(
      (position) => Array.isArray(position) && position.length === 2,
    )
  );
}
