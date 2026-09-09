import { describe, expect, it } from "vitest";
import {
  decodeHardwareKeycode,
  formatKeycap,
  isSysRqKeycode,
  keycodeValue,
  kindForKeycode,
} from "./keycodes";

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

describe("hardware keycode decoding", () => {
  it("decodes basic HID keycodes as stored by VIA", () => {
    expect(decodeHardwareKeycode(0x0004)).toBe("A");
    expect(decodeHardwareKeycode(0x0029)).toBe("Esc");
    expect(decodeHardwareKeycode(0x0028)).toBe("Enter");
    expect(decodeHardwareKeycode(0x0045)).toBe("F12");
    expect(decodeHardwareKeycode(0x00a9)).toBe("Vol+");
    expect(decodeHardwareKeycode(0x00e2)).toBe("Alt");
    expect(decodeHardwareKeycode(0x0000)).toBe("None");
    expect(decodeHardwareKeycode(0x0001)).toBe("Transparent");
  });

  it("decodes layer, modifier, and lighting keycodes", () => {
    expect(decodeHardwareKeycode(0x5221)).toBe("Fn");
    expect(decodeHardwareKeycode(0x5260)).toBe("TG(0)");
    expect(decodeHardwareKeycode(0x0104)).toBe("Ctrl+A");
    expect(decodeHardwareKeycode(0x2104)).toBe("Ctrl/A");
    expect(decodeHardwareKeycode(0x7c00)).toBe("Boot");
    expect(decodeHardwareKeycode(0x7820)).toBe("RGB");
    expect(decodeHardwareKeycode(0x7785)).toBe("2.4G");
  });

  it("falls back to the raw hex value for unknown keycodes", () => {
    expect(decodeHardwareKeycode(0x7777)).toBe("0x7777");
  });

  it("recognizes Print Screen as the Linux Magic SysRq key", () => {
    expect(isSysRqKeycode(0x0046)).toBe(true);
    expect(isSysRqKeycode(0x0044)).toBe(false);
    expect(isSysRqKeycode(0x009a)).toBe(false);
  });
});

describe("keycode value mapping", () => {
  it("maps basic HID keycodes and modifiers", () => {
    expect(keycodeValue("KC_A")).toBe(0x04);
    expect(keycodeValue("KC_ESC")).toBe(0x29);
    expect(keycodeValue("KC_F13")).toBe(0x68);
    expect(keycodeValue("KC_PSCR")).toBe(0x0046);
    expect(keycodeValue("KC_LCTL")).toBe(0xe0);
    expect(keycodeValue("KC_TRNS")).toBe(0x0001);
    expect(keycodeValue("KC_NO")).toBe(0x0000);
  });

  it("maps layer and mod-tap wrappers", () => {
    expect(keycodeValue("MO(1)")).toBe(0x5221);
    expect(keycodeValue("TG(3)")).toBe(0x5263);
    expect(keycodeValue("LT(1, KC_SPC)")).toBe(0x4000 | (1 << 8) | 0x2c);
    expect(keycodeValue("LCTL_T(KC_ESC)")).toBe(0x2000 | (0x01 << 8) | 0x29);
  });

  it("returns undefined for unmappable keycodes", () => {
    expect(keycodeValue("RGB_TOG")).toBeUndefined();
    expect(keycodeValue("QK_BOOT")).toBeUndefined();
    expect(keycodeValue("BT_HST1")).toBeUndefined();
  });
});
