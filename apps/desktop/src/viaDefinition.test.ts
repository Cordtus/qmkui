import { describe, expect, it } from "vitest";
import { resolveRgbMatrixEffect, rgbMatrixEffectId, rgbMatrixEffectsFor, viaDefinitionFor } from "./viaDefinition";

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

  it("exposes the board's full RGB-matrix effect list from its VIA menu", () => {
    const effects = rgbMatrixEffectsFor("keychron/v5_max/ansi_encoder");
    expect(effects).toHaveLength(23);
    expect(effects[0]).toEqual({ id: 0, name: "None" });
    expect(effects[1]).toEqual({ id: 1, name: "Solid Color" });
    expect(effects[18]).toEqual({ id: 18, name: "Reactive Simple" });
    expect(effects[22]).toEqual({ id: 22, name: "Solid Splash" });
  });

  it("returns no effects for an unsupported keyboard", () => {
    expect(rgbMatrixEffectsFor("example/keyboard")).toEqual([]);
  });

  it("resolves stored effect ids, legacy names, and numeric strings", () => {
    expect(rgbMatrixEffectId(4)).toBe(4);
    expect(rgbMatrixEffectId("solid")).toBe(1);
    expect(rgbMatrixEffectId("breathing")).toBe(2);
    expect(rgbMatrixEffectId("18")).toBe(18);
    expect(rgbMatrixEffectId(undefined)).toBeUndefined();
    expect(rgbMatrixEffectId("nonsense")).toBeUndefined();
    // Blank strings must not coerce to 0 (None) and turn the lighting off.
    expect(rgbMatrixEffectId("")).toBeUndefined();
    expect(rgbMatrixEffectId("   ")).toBeUndefined();
  });

  it("resolves an effect to a declared mode, defaulting to Solid", () => {
    const effects = rgbMatrixEffectsFor("keychron/v5_max/ansi_encoder");
    expect(resolveRgbMatrixEffect(18, effects)).toBe(18);
    expect(resolveRgbMatrixEffect("breathing", effects)).toBe(2);
    // Explicit None (0) is a real, declared choice and must be honoured.
    expect(resolveRgbMatrixEffect(0, effects)).toBe(0);
    // Not a declared mode -> Solid, never None.
    expect(resolveRgbMatrixEffect(999, effects)).toBe(1);
    expect(resolveRgbMatrixEffect(undefined, effects)).toBe(1);
    // A board with no declared effects has nothing to validate against.
    expect(resolveRgbMatrixEffect(undefined, [])).toBeUndefined();
    expect(resolveRgbMatrixEffect(18, [])).toBeUndefined();
  });
});
