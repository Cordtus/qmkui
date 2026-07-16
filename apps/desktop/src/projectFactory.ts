import type { Assignment, KeyboardDefinition, Layer, Project, VisualKey } from "./domain";
import { kindForKeycode } from "./keycodes";

export function createProjectFromKeyboard(
  keyboard: KeyboardDefinition,
  layoutId = keyboard.layouts[0]?.id,
): Project {
  const layout = keyboard.layouts.find((item) => item.id === layoutId) ?? keyboard.layouts[0];
  if (!layout) {
    throw new Error(`Keyboard ${keyboard.id} has no layouts`);
  }

  const keymapName = keymapNameForKeyboard(keyboard);
  const baseAssignments = layout.keys.map((key, index) => assignmentFromVisualKey(key, 0, index));
  const layers: Layer[] = [
    {
      id: "layer_0",
      index: 0,
      name: "Base",
      enabled: true,
      assignments: baseAssignments,
    },
  ];

  if (baseAssignments.some((assignment) => assignment.qmk === "MO(1)")) {
    layers.push({
      id: "layer_1",
      index: 1,
      name: "Fn",
      enabled: true,
      assignments: layout.keys.map((key, index) => transparentAssignment(key, 1, index)),
    });
  }

  return {
    schemaVersion: "0.1.0",
    id: `proj_${keymapName}`,
    name: keyboard.displayName,
    target: {
      keyboardId: keyboard.id,
      qmkKeyboard: keyboard.qmkKeyboard,
      layoutId: layout.id,
      qmkLayoutMacro: layout.qmkLayoutMacro,
      catalogVersion: keyboard.source?.version,
    },
    layers,
    build: {
      mode: "localCli",
      keymapName,
      outputPreference: "json",
    },
    macros: [],
    combos: [],
    tapDances: [],
    encoders: [],
    lightingProfiles: [
      {
        id: "profile_default",
        name: "Default",
        mode: "static",
        perKey: {},
      },
    ],
  };
}

function assignmentFromVisualKey(key: VisualKey, layerIndex: number, keyIndex: number): Assignment {
  const qmk = qmkFromLabel(key.label);
  return {
    id: `layer_${layerIndex}_${keyIndex}`,
    visualKeyId: key.id,
    kind: kindForKeycode(qmk),
    qmk,
  };
}

function transparentAssignment(key: VisualKey, layerIndex: number, keyIndex: number): Assignment {
  return {
    id: `layer_${layerIndex}_${keyIndex}`,
    visualKeyId: key.id,
    kind: "transparent",
    qmk: "KC_TRNS",
  };
}

function qmkFromLabel(label: string | undefined): string {
  const normalized = (label ?? "").trim();
  const mapped = labelToQmk[normalized.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  if (/^[a-z]$/i.test(normalized)) {
    return `KC_${normalized.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(normalized)) {
    return `KC_${normalized}`;
  }
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(normalized)) {
    return `KC_${normalized.toUpperCase()}`;
  }

  return "KC_NO";
}

function keymapNameForKeyboard(keyboard: KeyboardDefinition): string {
  return keyboard.id
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const labelToQmk: Record<string, string> = {
  "`": "KC_GRV",
  "-": "KC_MINS",
  "=": "KC_EQL",
  "[": "KC_LBRC",
  "]": "KC_RBRC",
  "\\": "KC_BSLS",
  ";": "KC_SCLN",
  "'": "KC_QUOT",
  ",": "KC_COMM",
  ".": "KC_DOT",
  "/": "KC_SLSH",
  alt: "KC_LALT",
  backspace: "KC_BSPC",
  caps: "KC_CAPS",
  ctrl: "KC_LCTL",
  del: "KC_DEL",
  end: "KC_END",
  enter: "KC_ENT",
  esc: "KC_ESC",
  fn: "MO(1)",
  home: "KC_HOME",
  menu: "KC_APP",
  num: "KC_NUM",
  opt: "KC_LALT",
  shift: "KC_LSFT",
  space: "KC_SPC",
  tab: "KC_TAB",
  win: "KC_LGUI",
  "↑": "KC_UP",
  "↓": "KC_DOWN",
  "←": "KC_LEFT",
  "→": "KC_RGHT",
};
