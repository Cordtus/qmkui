import { describe, expect, it } from "vitest";
import { viaDefinitionFor } from "./viaDefinition";

describe("VIA definition support", () => {
  it("resolves the bundled V5 Max definition", () => {
    const entry = viaDefinitionFor("keychron/v5_max/ansi_encoder");
    expect(entry?.format).toBe("via-v3");
    expect(entry?.definition.name).toBe("Keychron V5 Max ANSI Knob");
    expect(entry?.definition.vendorId).toBe("0x3434");
    expect(entry?.definition.productId).toBe("0x0950");
    expect(entry?.definition.matrix).toEqual({ rows: 6, cols: 19 });
    expect(entry?.definition.layouts.keymap).toHaveLength(98);
  });

  it("returns undefined for unsupported keyboards", () => {
    expect(viaDefinitionFor("example/keyboard")).toBeUndefined();
  });
});
