import { describe, expect, it } from "vitest";
import {
  isValidViaDefinition,
  viaDefinitionFor,
  viaDefinitionJson,
} from "./viaDefinition";

describe("VIA definition support", () => {
  it("resolves the bundled V5 Max definition and serializes it", () => {
    const entry = viaDefinitionFor("keychron/v5_max/ansi_encoder");
    expect(entry?.format).toBe("via-v3");
    expect(entry?.definition.name).toBe("Keychron V5 Max ANSI Knob");
    expect(entry?.definition.vendorId).toBe("0x3434");
    expect(entry?.definition.productId).toBe("0x0950");
    expect(entry?.definition.matrix).toEqual({ rows: 6, cols: 19 });
    expect(entry?.definition.layouts.keymap).toHaveLength(98);

    const json = viaDefinitionJson("keychron/v5_max/ansi_encoder");
    expect(json).toContain('"vendorId": "0x3434"');
    expect(isValidViaDefinition(JSON.parse(json ?? "{}"))).toBe(true);
  });

  it("returns undefined for unsupported keyboards", () => {
    expect(viaDefinitionFor("example/keyboard")).toBeUndefined();
    expect(viaDefinitionJson("example/keyboard")).toBeUndefined();
  });

  it("validates the V3 shape", () => {
    expect(
      isValidViaDefinition({
        name: "X",
        vendorId: "0x0000",
        productId: "0x0000",
        matrix: { rows: 1, cols: 1 },
        layouts: { labels: [], keymap: [[0, 0]] },
      }),
    ).toBe(true);
    expect(isValidViaDefinition({ name: "X" })).toBe(false);
    expect(isValidViaDefinition(null)).toBe(false);
  });
});
