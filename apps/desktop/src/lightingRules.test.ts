import { describe, expect, it } from "vitest";
import type { KeyboardDefinition, Project } from "./domain";
import { generateLightingRulesC, lightingRulesCFileName } from "./lightingRules";

const keys: KeyboardDefinition["layouts"][number]["keys"] = [
  { id: "esc", label: "Esc", x: 0, y: 0, matrix: { row: 0, col: 0 } },
  { id: "caps", label: "Caps", x: 1, y: 0, matrix: { row: 2, col: 0 } },
  { id: "fn", label: "Fn", x: 2, y: 0, matrix: { row: 5, col: 10 } },
  { id: "spc", label: "Space", x: 3, y: 0, matrix: { row: 5, col: 5 } },
  { id: "knob", label: "bad */ label", x: 4, y: 0 },
];

const keyboard: KeyboardDefinition = {
  id: "test-keyboard",
  displayName: "Test Keyboard",
  qmkKeyboard: "test/keyboard",
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
    schemaVersion: "1.0",
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
        perKey: { esc: "#ff0000", knob: "#00ff00" },
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
  it("emits static per-key colours and guarded state rules", () => {
    const code = generateLightingRulesC(project(), keyboard);

    expect(code).toContain("bool rgb_matrix_indicators_advanced_user(");
    expect(code).toContain("qmkui_set_key_color(0, 0, 255, 0, 0);");
    expect(code).toContain("if (host_keyboard_led_state().caps_lock) {");
    expect(code).toContain("qmkui_set_key_color(2, 0, 0, 255, 0); // Caps");
    expect(code).toContain("if (layer_state_is(2)) {");
    expect(code).toContain("qmkui_set_key_color(5, 10, 0, 0, 255); // Fn");
    expect(code).toContain("if (matrix_is_on(5, 5)) {");
    expect(code).toContain("qmkui_set_key_color(5, 10, 255, 255, 255); // Fn");
  });

  it("skips disabled rules and keys without a matrix position", () => {
    const code = generateLightingRulesC(project(), keyboard);

    expect(code).not.toContain("#123456");
    expect(code).not.toContain("num_lock");
    expect(code).not.toContain("(4, 0,");
  });

  it("does not let a key label break out of a C comment", () => {
    const withRule = project();
    withRule.lightingRules = [
      {
        id: "held",
        targetKeyId: "knob",
        color: "#ffffff",
        trigger: { kind: "held", keyId: "spc" },
      },
    ];

    const code = generateLightingRulesC(withRule, keyboard);
    // The knob has no matrix, so the rule is skipped entirely; the static
    // per-key colour for it is skipped too. No `*/` leaks from the label.
    expect(code).not.toContain("*/ label");
    expect(code).not.toContain("*/");
  });

  it("names the export after the keymap", () => {
    expect(lightingRulesCFileName(project())).toBe("test-map-lighting-rules.c");
  });
});
