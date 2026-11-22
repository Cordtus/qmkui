import { describe, expect, it } from "vitest";
import type { KeyboardDefinition, Project } from "./domain";
import { generateLightingRulesC, lightingRulesCFileName } from "./lightingRules";

const keys: KeyboardDefinition["layouts"][number]["keys"] = [
  { id: "esc", label: "Esc", x: 0, y: 0, matrix: { row: 0, col: 0 } },
  { id: "caps", label: "Caps", x: 1, y: 0, matrix: { row: 2, col: 0 } },
  { id: "fn", label: "Fn", x: 2, y: 0, matrix: { row: 5, col: 10 } },
  { id: "spc", label: "Space", x: 3, y: 0, matrix: { row: 5, col: 5 } },
  { id: "weird", label: "bad */ label\\", x: 4, y: 0, matrix: { row: 3, col: 3 } },
  { id: "knob", label: "Knob", x: 5, y: 0 },
];

const keyboard: KeyboardDefinition = {
  id: "test-keyboard",
  displayName: "Test Keyboard",
  qmkKeyboard: "test/keyboard",
  matrix: { rows: 6, cols: 19 },
  layouts: [
    {
      id: "LAYOUT_test",
      qmkLayoutMacro: "LAYOUT_test",
      displayName: "Test",
      keys,
    },
  ],
};

function project(): Project {
  return {
    schemaVersion: "0.1.0",
    id: "project",
    name: "Test",
    target: {
      keyboardId: keyboard.id,
      qmkKeyboard: keyboard.qmkKeyboard,
      layoutId: "LAYOUT_test",
      qmkLayoutMacro: "LAYOUT_test",
    },
    layers: [],
    build: { mode: "localCli", keymapName: "test map", outputPreference: "json" },
    lightingProfiles: [
      {
        id: "profile",
        name: "Default",
        mode: "static",
        perKey: { esc: "#ff0000", knob: "#00ff00", weird: "#ffffff" },
      },
    ],
    lightingRules: [
      {
        id: "caps-lock",
        targetKeyId: "caps",
        color: "#00ff00",
        trigger: { kind: "lock", lock: "capsLock" },
      },
      {
        id: "layer-two",
        targetKeyId: "fn",
        color: "#0000ff",
        trigger: { kind: "layer", layerIndex: 2 },
      },
      {
        id: "layer-zero",
        targetKeyId: "caps",
        color: "#abcdef",
        trigger: { kind: "layer", layerIndex: 0 },
      },
      {
        id: "space-held",
        targetKeyId: "fn",
        color: "#ffffff",
        trigger: { kind: "held", keyId: "spc" },
      },
      {
        id: "disabled",
        targetKeyId: "caps",
        color: "#123456",
        trigger: { kind: "lock", lock: "numLock" },
        enabled: false,
      },
    ],
  };
}

describe("lighting rules C export", () => {
  it("emits guarded per-key colours and state rules", () => {
    const code = generateLightingRulesC(project(), keyboard)!;

    expect(code).toContain("bool rgb_matrix_indicators_advanced_user(");
    expect(code).toContain("RGB_MATRIX_INDICATOR_SET_COLOR(led, r, g, b)");
    expect(code).toContain("qmkui_set_key_color(led_min, led_max, 0, 0, 255, 0, 0);");
    expect(code).toContain("if (host_keyboard_led_state().caps_lock) {");
    expect(code).toContain("qmkui_set_key_color(led_min, led_max, 2, 0, 0, 255, 0); // Caps");
    expect(code).toContain("if (layer_state_is(2)) {");
    expect(code).toContain("qmkui_set_key_color(led_min, led_max, 5, 10, 0, 0, 255); // Fn");
    expect(code).toContain("if (get_highest_layer(layer_state) == 0) {");
    expect(code).toContain("qmkui_set_key_color(led_min, led_max, 5, 10, 255, 255, 255); // Fn");
    expect(code).toContain("if (matrix_is_on(5, 5)) {");
  });

  it("never writes an LED outside the indicator range", () => {
    const code = generateLightingRulesC(project(), keyboard)!;

    expect(code).not.toMatch(/[^_]rgb_matrix_set_color\(/);
    expect(code.match(/RGB_MATRIX_INDICATOR_SET_COLOR/g)).toHaveLength(1);
  });

  it("skips disabled rules and keys without a matrix position", () => {
    const code = generateLightingRulesC(project(), keyboard)!;

    expect(code).not.toContain("(2, 0, 18, 52, 86)");
    expect(code).not.toContain("num_lock");
    expect(code).not.toContain("(5, 0,");
  });

  it("escapes key labels so a comment cannot absorb the next line", () => {
    const code = generateLightingRulesC(project(), keyboard)!;

    expect(code).toContain("qmkui_set_key_color(led_min, led_max, 3, 3, 255, 255, 255);");
    expect(code).not.toContain("*/");
    expect(code).not.toContain("\\");
  });

  it("returns null when the project layout does not match the keyboard", () => {
    const mismatched = project();
    mismatched.target.layoutId = "LAYOUT_other";

    expect(generateLightingRulesC(mismatched, keyboard)).toBeNull();
  });

  it("names the export after the keymap", () => {
    expect(lightingRulesCFileName(project())).toBe("test-map-lighting-rules.c");
  });
});
