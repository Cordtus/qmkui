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

export type ViaRgbMatrixEffect = {
  /** Firmware RGB-matrix mode id (the value VIA writes to channel 3 / id 2). */
  id: number;
  name: string;
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

/**
 * The RGB-matrix effect list a keyboard's VIA definition exposes, read from its
 * lighting menu (`id_qmk_rgb_matrix_effect`, channel 3, value id 2). This is the
 * board's own source of truth for mode ids, so the UI never hardcodes them.
 */
export function rgbMatrixEffectsFor(qmkKeyboard: string): ViaRgbMatrixEffect[] {
  const definition = viaDefinitions.find((entry) => entry.qmkKeyboard === qmkKeyboard)?.definition;
  return definition ? rgbMatrixEffects(definition) : [];
}

function rgbMatrixEffects(definition: ViaDefinition): ViaRgbMatrixEffect[] {
  const options = findRgbMatrixEffectOptions(definition.menus);
  return options.flatMap((option) => {
    if (!Array.isArray(option) || option.length < 2) {
      return [];
    }
    const [name, id] = option;
    return typeof id === "number" && typeof name === "string" ? [{ id, name }] : [];
  });
}

/**
 * Resolve a profile's stored effect to a firmware mode id. Current projects
 * store the numeric id; projects saved before ids used these four names.
 * Returns undefined when nothing usable is stored.
 */
export function rgbMatrixEffectId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    const legacy = LEGACY_EFFECT_IDS[trimmed];
    if (legacy !== undefined) {
      return legacy;
    }
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

const LEGACY_EFFECT_IDS: Record<string, number> = {
  solid: 1,
  breathing: 2,
  cycle: 4,
  reactive: 18,
};

/**
 * Resolve the effect to show/write: the stored value when it maps to a mode the
 * board declares, otherwise Solid (id 1) so a write never turns the lighting
 * off by default. Returns undefined when the board declares no effects (nothing
 * to validate against, so the write leaves the device's effect untouched).
 */
export function resolveRgbMatrixEffect(
  stored: unknown,
  effects: readonly ViaRgbMatrixEffect[],
): number | undefined {
  if (effects.length === 0) {
    return undefined;
  }
  const explicit = rgbMatrixEffectId(stored);
  if (explicit !== undefined && effects.some((effect) => effect.id === explicit)) {
    return explicit;
  }
  if (effects.some((effect) => effect.id === 1)) {
    return 1;
  }
  return effects[0]?.id;
}

/** Depth-first search for the dropdown bound to `id_qmk_rgb_matrix_effect`. */
function findRgbMatrixEffectOptions(nodes: unknown): unknown[] {
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      const found = findRgbMatrixEffectOptions(node);
      if (found.length) {
        return found;
      }
    }
    return [];
  }
  if (nodes && typeof nodes === "object") {
    const record = nodes as Record<string, unknown>;
    if (
      Array.isArray(record.content) &&
      record.content[0] === "id_qmk_rgb_matrix_effect" &&
      Array.isArray(record.options)
    ) {
      return record.options;
    }
    return findRgbMatrixEffectOptions(record.content);
  }
  return [];
}
