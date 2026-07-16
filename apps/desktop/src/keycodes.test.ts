import { describe, expect, it } from "vitest";
import { formatKeycap, kindForKeycode } from "./keycodes";

describe("keycode display", () => {
  it("formats mod-tap assignments without changing their QMK source", () => {
    expect(kindForKeycode("MT(MOD_LCTL, KC_ESC)")).toBe("modTap");
    expect(formatKeycap("MT(MOD_LCTL, KC_ESC)")).toBe("Ctrl/Esc");
    expect(formatKeycap("MT(MOD_LCTL|MOD_LSFT, KC_TAB)")).toBe("Ctrl+Shift/Tab");
  });

  it("formats QMK tap-hold aliases and modifier wrappers for visual labels", () => {
    expect(formatKeycap("LCTL_T(KC_ESC)")).toBe("Ctrl/Esc");
    expect(formatKeycap("RSFT_T(KC_ENT)")).toBe("Shift/Enter");
    expect(formatKeycap("C(KC_C)")).toBe("Ctrl+C");
    expect(formatKeycap("G(KC_SPC)")).toBe("Win+Space");
  });

  it("uses compact labels for crowded keyboard keys", () => {
    expect(formatKeycap("KC_BRID", { compact: true })).toBe("Br-");
    expect(formatKeycap("KC_BRIU", { compact: true })).toBe("Br+");
    expect(formatKeycap("KC_BSPC", { compact: true })).toBe("⟵");
    expect(formatKeycap("LT(3, KC_SPC)", { compact: true })).toBe("L3/Spc");
    expect(formatKeycap("KC_AUDIO_VOL_UP", { compact: true })).toBe("Audio Vol Up");
  });
});
