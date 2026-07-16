import type {
  FeatureCapabilities,
  KeyboardDefinition,
  LightingCondition,
  Project,
  VisualKey,
} from "./domain";
import { formatKeycap, kindForKeycode } from "./keycodes";

export type QmkLayoutKey = {
  matrix: [number, number];
  x: number;
  y: number;
  w?: number;
  h?: number;
};

export type QmkLayerSource = {
  id: string;
  index: number;
  name: string;
  keycodes: string[];
};

export type QmkKeyboardSource = {
  id: string;
  qmkKeyboard: string;
  displayName: string;
  manufacturer?: string;
  aliases?: string[];
  usb?: { vid: string; pid: string };
  features?: FeatureCapabilities;
  source?: { kind: string; version?: string };
  layout: {
    id: string;
    qmkLayoutMacro: string;
    displayName: string;
    keys: QmkLayoutKey[];
  };
  keyIdPrefix: string;
};

export type QmkProjectSource = {
  id: string;
  name: string;
  keyboard: KeyboardDefinition;
  layoutId: string;
  layers: QmkLayerSource[];
  keymapName: string;
  catalogVersion: string;
  lightingConditions?: LightingCondition[];
};

export function keyboardFromQmkMetadata(
  source: QmkKeyboardSource,
  labelKeycodes: string[],
): KeyboardDefinition {
  return {
    id: source.id,
    qmkKeyboard: source.qmkKeyboard,
    displayName: source.displayName,
    manufacturer: source.manufacturer,
    aliases: source.aliases,
    usb: source.usb,
    features: source.features,
    source: source.source,
    layouts: [
      {
        id: source.layout.id,
        qmkLayoutMacro: source.layout.qmkLayoutMacro,
        displayName: source.layout.displayName,
        keys: source.layout.keys.map((key, index) =>
          visualKeyFromQmkKey(source, key, index, labelKeycodes[index]),
        ),
      },
    ],
  };
}

export function projectFromQmkKeymap(source: QmkProjectSource): Project {
  const layout = source.keyboard.layouts.find((item) => item.id === source.layoutId);
  if (!layout) {
    throw new Error(`Layout ${source.layoutId} is missing`);
  }

  return {
    schemaVersion: "0.1.0",
    id: source.id,
    name: source.name,
    target: {
      keyboardId: source.keyboard.id,
      qmkKeyboard: source.keyboard.qmkKeyboard,
      layoutId: layout.id,
      qmkLayoutMacro: layout.qmkLayoutMacro,
      catalogVersion: source.catalogVersion,
    },
    layers: source.layers.map((layer) => layerFromQmkKeycodes(layout.keys, layer)),
    build: {
      mode: "localCli",
      keymapName: source.keymapName,
      outputPreference: "json",
    },
    lightingProfiles: [defaultLightingProfile(layout.keys, source.lightingConditions ?? [])],
  };
}

function visualKeyFromQmkKey(
  source: QmkKeyboardSource,
  key: QmkLayoutKey,
  index: number,
  qmk: string | undefined,
): VisualKey {
  const [row, col] = key.matrix;
  return {
    id: visualKeyId(source.keyIdPrefix, index),
    label: formatKeycap(normalizeKeycode(qmk ?? "KC_NO")),
    x: key.x,
    y: key.y,
    w: key.w,
    h: key.h,
    matrix: { row, col },
  };
}

function layerFromQmkKeycodes(keys: VisualKey[], layer: QmkLayerSource) {
  if (layer.keycodes.length !== keys.length) {
    throw new Error(
      `Layer ${layer.name} has ${layer.keycodes.length} keycodes for ${keys.length} layout keys`,
    );
  }

  return {
    id: layer.id,
    index: layer.index,
    name: layer.name,
    enabled: true,
    assignments: keys.map((key, index) => {
      const qmk = normalizeKeycode(layer.keycodes[index] ?? "KC_NO");
      return {
        id: `${layer.id}_${key.id}`,
        visualKeyId: key.id,
        kind: kindForKeycode(qmk),
        qmk,
      };
    }),
  };
}

function defaultLightingProfile(keys: VisualKey[], conditions: LightingCondition[]) {
  return {
    id: "profile_default_reactive",
    name: "Reactive Map",
    mode: "reactive" as const,
    perKey: Object.fromEntries(keys.map((key) => [key.id, defaultColorFor(key)])),
    conditions,
  };
}

function defaultColorFor(key: VisualKey): string {
  const label = key.label ?? "";
  if (label === "Fn") {
    return "#f2c94c";
  }
  if (["Ctrl", "Shift", "Alt", "Win", "Fn"].includes(label)) {
    return "#6aa6ff";
  }
  if (["Mute", "Vol+", "Vol-", "Play", "Prev", "Next"].includes(label)) {
    return "#ff7a90";
  }
  if (key.matrix && key.matrix.col >= 15) {
    return "#66d9a8";
  }
  return "#5fb99a";
}

function normalizeKeycode(qmk: string): string {
  if (qmk === "_______" || qmk === "KC_TRANSPARENT") {
    return "KC_TRNS";
  }
  if (qmk === "XXXXXXX") {
    return "KC_NO";
  }
  return qmk;
}

function visualKeyId(prefix: string, index: number): string {
  return `${prefix}_${String(index).padStart(3, "0")}`;
}
