import { describe, expect, it } from "vitest";
import { keyboardFromQmkMetadata, projectFromQmkKeymap } from "./qmkMetadata";

describe("QMK metadata conversion", () => {
  it("builds visual keys and normalized assignments from QMK/VIA-style metadata", () => {
    const keyboard = keyboardFromQmkMetadata(
      {
        id: "example/source",
        qmkKeyboard: "example/source",
        displayName: "Source Board",
        layout: {
          id: "LAYOUT",
          qmkLayoutMacro: "LAYOUT",
          displayName: "Layout",
          keys: [
            { matrix: [0, 0], x: 0, y: 0 },
            { matrix: [0, 1], x: 1, y: 0, w: 2 },
          ],
        },
        keyIdPrefix: "src",
      },
      ["KC_ESC", "KC_BSPC"],
    );

    const project = projectFromQmkKeymap({
      id: "project_source",
      name: "Source Project",
      keyboard,
      layoutId: "LAYOUT",
      keymapName: "source",
      catalogVersion: "fixture",
      layers: [{ id: "layer_0", index: 0, name: "Base", keycodes: ["KC_ESC", "_______"] }],
    });

    expect(keyboard.layouts[0].keys[1]).toMatchObject({
      id: "src_001",
      matrix: { row: 0, col: 1 },
      w: 2,
    });
    expect(project.layers[0].assignments[1]).toMatchObject({
      visualKeyId: "src_001",
      kind: "transparent",
      qmk: "KC_TRNS",
    });
  });

  it("rejects keymap layers that do not match layout key count", () => {
    const keyboard = keyboardFromQmkMetadata(
      {
        id: "example/source",
        qmkKeyboard: "example/source",
        displayName: "Source Board",
        layout: {
          id: "LAYOUT",
          qmkLayoutMacro: "LAYOUT",
          displayName: "Layout",
          keys: [{ matrix: [0, 0], x: 0, y: 0 }],
        },
        keyIdPrefix: "src",
      },
      ["KC_ESC"],
    );

    expect(() =>
      projectFromQmkKeymap({
        id: "project_source",
        name: "Source Project",
        keyboard,
        layoutId: "LAYOUT",
        keymapName: "source",
        catalogVersion: "fixture",
        layers: [{ id: "layer_0", index: 0, name: "Base", keycodes: [] }],
      }),
    ).toThrow("has 0 keycodes for 1 layout keys");
  });

  it("uses the dedicated Fn lighting color when building default profiles", () => {
    const keyboard = keyboardFromQmkMetadata(
      {
        id: "example/source",
        qmkKeyboard: "example/source",
        displayName: "Source Board",
        layout: {
          id: "LAYOUT",
          qmkLayoutMacro: "LAYOUT",
          displayName: "Layout",
          keys: [{ matrix: [0, 0], x: 0, y: 0 }],
        },
        keyIdPrefix: "src",
      },
      ["MO(1)"],
    );

    const project = projectFromQmkKeymap({
      id: "project_source",
      name: "Source Project",
      keyboard,
      layoutId: "LAYOUT",
      keymapName: "source",
      catalogVersion: "fixture",
      layers: [{ id: "layer_0", index: 0, name: "Base", keycodes: ["MO(1)"] }],
    });

    expect(project.lightingProfiles?.[0]?.perKey.src_000).toBe("#f2c94c");
  });
});
