import { describe, expect, it } from "vitest";
import type { DeviceSelectionState } from "./appState";
import { selectionMatchesTarget, writeRefusalReason } from "./appState";
import type { KeyboardDefinition } from "./domain";
import { keychronV5MaxKeyboard } from "./presets";

const selected = {
  state: "selected",
  identity: { vendorId: 0x3434, productId: 0x0950 },
  contract: { state: "via" },
} as unknown as DeviceSelectionState;

function stateFor(keyboard: KeyboardDefinition) {
  return { keyboard, deviceSelection: selected };
}

describe("live write target gate", () => {
  it("accepts the matching keyboard identity", () => {
    expect(selectionMatchesTarget(stateFor(keychronV5MaxKeyboard))).toBe(true);
  });

  it("refuses a keyboard that declares no USB identity", () => {
    const { usb: _usb, ...withoutUsb } = keychronV5MaxKeyboard;
    const state = stateFor(withoutUsb);

    expect(selectionMatchesTarget(state)).toBe(false);
    expect(writeRefusalReason(state)).toContain("no USB id");
  });

  it("refuses a connected device that does not match", () => {
    const wrong = {
      state: "selected",
      identity: { vendorId: 0xfeed, productId: 0x6060 },
      contract: { state: "via" },
    } as unknown as DeviceSelectionState;
    const state = { keyboard: keychronV5MaxKeyboard, deviceSelection: wrong };

    expect(selectionMatchesTarget(state)).toBe(false);
    expect(writeRefusalReason(state)).toContain("does not match");
  });
});
