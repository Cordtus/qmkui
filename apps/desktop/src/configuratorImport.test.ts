import { describe, expect, it } from "vitest";
import catalog from "../../../fixtures/catalog/keyboards.json";
import { ConfiguratorImportError, importConfiguratorKeymap } from "./configuratorImport";

const resolve = (qmkKeyboard: string) =>
  (catalog as unknown as Array<{ qmkKeyboard: string }>).find(
    (keyboard) => keyboard.qmkKeyboard === qmkKeyboard,
  );

describe("QMK Configurator keymap import", () => {
  it("imports a valid keymap into a native project", () => {
    const project = importConfiguratorKeymap(
      JSON.stringify({
        version: 1,
        keyboard: "example/keyboard",
        keymap: "test",
        layout: "LAYOUT",
        layers: [
          ["KC_ESC", "KC_A", "MO(1)"],
          ["KC_TRNS", "KC_B", "KC_TRNS"],
        ],
      }),
      resolve as never,
    );

    expect(project.schemaVersion).toBe("0.1.0");
    expect(project.target.qmkKeyboard).toBe("example/keyboard");
    expect(project.target.layoutId).toBe("LAYOUT");
    expect(project.layers).toHaveLength(2);
    expect(project.layers[0]?.assignments).toHaveLength(3);
    expect(project.layers[0]?.assignments[0]?.qmk).toBe("KC_ESC");
    expect(project.layers[0]?.assignments[2]?.qmk).toBe("MO(1)");
    expect(project.layers[1]?.assignments[1]?.qmk).toBe("KC_B");
  });

  it("rejects malformed JSON", () => {
    expect(() => importConfiguratorKeymap("{bad", resolve as never)).toThrowError(
      new ConfiguratorImportError("invalid-json", "keymap.json is not valid JSON."),
    );
  });

  it("rejects a payload missing required fields", () => {
    expect(() => importConfiguratorKeymap(JSON.stringify({ version: 1 }), resolve as never)).toThrowError(
      new ConfiguratorImportError("invalid-json", "keymap.json is missing keyboard, layout, or layers."),
    );
  });

  it("rejects an unsupported keymap version", () => {
    expect(() =>
      importConfiguratorKeymap(
        JSON.stringify({ version: 2, keyboard: "example/keyboard", layout: "LAYOUT", layers: [[]] }),
        resolve as never,
      ),
    ).toThrowError(
      new ConfiguratorImportError("unsupported-version", "keymap.json version 2 is not supported."),
    );
  });

  it("reports when the keyboard is not bundled", () => {
    expect(() =>
      importConfiguratorKeymap(
        JSON.stringify({ version: 1, keyboard: "missing/board", layout: "LAYOUT", layers: [[]] }),
        resolve as never,
      ),
    ).toThrowError(
      new ConfiguratorImportError("keyboard-missing", "Keyboard missing/board is not bundled."),
    );
  });

  it("reports when the layout is unavailable", () => {
    expect(() =>
      importConfiguratorKeymap(
        JSON.stringify({ version: 1, keyboard: "example/keyboard", layout: "NOPE", layers: [[]] }),
        resolve as never,
      ),
    ).toThrowError(
      new ConfiguratorImportError(
        "layout-missing",
        "Layout NOPE is not available for example/keyboard.",
      ),
    );
  });

  it("rejects a layer whose keycode count does not match the layout", () => {
    expect(() =>
      importConfiguratorKeymap(
        JSON.stringify({
          version: 1,
          keyboard: "example/keyboard",
          layout: "LAYOUT",
          layers: [["KC_ESC", "KC_A"]],
        }),
        resolve as never,
      ),
    ).toThrowError(
      new ConfiguratorImportError(
        "layer-mismatch",
        "Layer 0 has 2 keycodes for 3 layout keys.",
      ),
    );
  });

  it("rejects a keymap with no layers", () => {
    expect(() =>
      importConfiguratorKeymap(
        JSON.stringify({ version: 1, keyboard: "example/keyboard", layout: "LAYOUT", layers: [] }),
        resolve as never,
      ),
    ).toThrowError(new ConfiguratorImportError("no-layers", "keymap.json has no layers."));
  });
});
