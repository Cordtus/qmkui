import { describe, expect, it } from "vitest";
import {
  layerKeycode,
  layerTapKeycode,
  modTapKeycode,
  parseAdvancedAssignment,
  suggestedLayerTarget,
} from "./advancedAssignments";
import { keychronV5MaxProject } from "./presets";

describe("advanced assignment parsing", () => {
  it("parses layer actions and formats them without changing QMK semantics", () => {
    expect(parseAdvancedAssignment("MO(3)")).toMatchObject({
      kind: "layer",
      action: "MO",
      targetLayerIndex: 3,
      qmk: "MO(3)",
    });

    expect(layerKeycode("TG", 1)).toBe("TG(1)");
  });

  it("parses layer tap and preserves the tap key", () => {
    expect(parseAdvancedAssignment("LT(2, KC_SPC)")).toMatchObject({
      kind: "layerTap",
      targetLayerIndex: 2,
      tapKey: "KC_SPC",
      qmk: "LT(2, KC_SPC)",
    });

    expect(layerTapKeycode(3, "kc_esc")).toBe("LT(3, KC_ESC)");
  });

  it("parses explicit and alias mod-taps into a common MT form", () => {
    expect(parseAdvancedAssignment("MT(MOD_LCTL, KC_ESC)")).toMatchObject({
      kind: "modTap",
      modifier: "MOD_LCTL",
      tapKey: "KC_ESC",
      qmk: "MT(MOD_LCTL, KC_ESC)",
    });
    expect(parseAdvancedAssignment("LCTL_T(KC_ESC)")).toMatchObject({
      kind: "modTap",
      modifier: "MOD_LCTL",
      tapKey: "KC_ESC",
      qmk: "MT(MOD_LCTL, KC_ESC)",
    });

    expect(modTapKeycode("mod_lsft", "kc_tab")).toBe("MT(MOD_LSFT, KC_TAB)");
  });

  it("rejects unsupported mod-tap modifiers", () => {
    expect(parseAdvancedAssignment("MT(NOT_A_MOD, KC_ESC)")).toBeNull();
    expect(parseAdvancedAssignment("MT(MOD_LCTL, MO(1))")).toBeNull();
    expect(parseAdvancedAssignment("LT(1, LCTL(KC_A))")).toBeNull();
    expect(parseAdvancedAssignment("MT(MOD_LCTL, KC_TILD)")).toBeNull();
    expect(parseAdvancedAssignment("LT(1, KC_DQUO)")).toBeNull();
    expect(parseAdvancedAssignment("LT(1, MT(MOD_LCTL, KC_ESC))")).toBeNull();
    expect(parseAdvancedAssignment("MT(MOD_LCTL, LT(1, KC_SPC))")).toBeNull();
    expect(layerTapKeycode(1, "KC_DQUO")).toBe("LT(1, KC_NO)");
    expect(layerTapKeycode(1, "MT(MOD_LCTL, KC_ESC)")).toBe("LT(1, KC_NO)");
    expect(modTapKeycode("MOD_LCTL", "KC_TILD")).toBe("MT(MOD_LCTL, KC_NO)");
    expect(modTapKeycode("MOD_LCTL", "LT(1, KC_SPC)")).toBe("MT(MOD_LCTL, KC_NO)");
  });

  it("selects a nearby existing layer as the default target", () => {
    expect(suggestedLayerTarget(keychronV5MaxProject, 2)).toBe(3);
    expect(suggestedLayerTarget(keychronV5MaxProject, 3)).toBe(0);
  });
});
