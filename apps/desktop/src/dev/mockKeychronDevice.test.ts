// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundledViaModels } from "../appState";
import {
  discoverAuthorizedBrowserKeyboard,
  type BrowserKeyboardNavigator,
  type BrowserKeyboardSelection,
} from "../devices/browserKeyboardDiscovery";
import { installMockKeychronDevice } from "./mockKeychronDevice";

function recognized(selection: BrowserKeyboardSelection) {
  if (
    selection.state !== "selected" ||
    selection.contract.state !== "via" ||
    !("session" in selection)
  ) {
    throw new Error("expected a recognized VIA selection");
  }
  return selection;
}

describe("mock Keychron V5 Max device", () => {
  beforeEach(() => {
    installMockKeychronDevice();
  });

  afterEach(() => {
    // Leave no fake navigator.hid behind for other tests.
    Reflect.deleteProperty(navigator, "hid");
  });

  it("is discovered and read exactly like the real device", async () => {
    const selection = recognized(
      await discoverAuthorizedBrowserKeyboard(navigator as BrowserKeyboardNavigator, {
        models: bundledViaModels,
      }),
    );
    expect(selection.identity).toMatchObject({ vendorId: 0x3434, productId: 0x0950 });
    expect(selection.contract.model?.qmkKeyboard).toBe("keychron/v5_max/ansi_encoder");

    const snapshot = await selection.session.readSnapshot();
    expect(snapshot.identity).toMatchObject({
      state: "available",
      value: { model: "Keychron V5 Max ANSI Knob", defaultLayer: 2 },
    });
    expect(snapshot.capabilities).toMatchObject({
      state: "available",
      value: { featureBitmap: [0, 129] },
    });
    // Captured RGB-matrix state from fixtures/protocol/v5-lighting.json.
    expect(snapshot.lighting).toMatchObject({
      state: "available",
      value: { brightness: 255, effect: 1, effectSpeed: 127, hue: 113, saturation: 221 },
    });
    // Full 4-layer, 6x19 keymap from the bundled stock keymap.
    if (snapshot.keymap.state !== "available") {
      throw new Error("expected an available keymap");
    }
    expect(snapshot.keymap.value.layerCount).toBe(4);
    expect(snapshot.keymap.value.keycodes).toHaveLength(4);
    expect(snapshot.keymap.value.keycodes[0]).toHaveLength(6);
    expect(snapshot.keymap.value.keycodes[0]?.[0]).toHaveLength(19);
    // Layer 0, matrix 0:0 is KC_ESC (0x0029) in the stock keymap.
    expect(snapshot.keymap.value.keycodes[0]?.[0]?.[0]).toBe(0x0029);
  });

  it("accepts a lighting write and reflects it on the next read", async () => {
    const selection = recognized(
      await discoverAuthorizedBrowserKeyboard(navigator as BrowserKeyboardNavigator, {
        models: bundledViaModels,
      }),
    );
    await selection.session.writeRgbMatrix?.({
      brightness: 120,
      effect: 2,
      effectSpeed: 200,
      hue: 10,
      saturation: 20,
    });
    await selection.session.saveLighting?.();

    const snapshot = await selection.session.readSnapshot();
    expect(snapshot.lighting).toMatchObject({
      state: "available",
      value: { brightness: 120, effect: 2, effectSpeed: 200, hue: 10, saturation: 20 },
    });
  });

  it("accepts a keycode write and reflects it on the next read", async () => {
    const selection = recognized(
      await discoverAuthorizedBrowserKeyboard(navigator as BrowserKeyboardNavigator, {
        models: bundledViaModels,
      }),
    );
    await selection.session.writeKeycode?.(0, 0, 0, 0x0046);

    const snapshot = await selection.session.readSnapshot();
    if (snapshot.keymap.state !== "available") {
      throw new Error("expected an available keymap");
    }
    expect(snapshot.keymap.value.keycodes[0]?.[0]?.[0]).toBe(0x0046);
  });
});
