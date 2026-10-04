import { describe, expect, it } from "vitest";
import { isKeychronVendor, viaModelFor } from "./keychronModels";

describe("VIA model registry", () => {
  it("resolves the bundled V5 Max definition by VID/PID", () => {
    const model = viaModelFor(0x3434, 0x0950);
    expect(model?.qmkKeyboard).toBe("keychron/v5_max/ansi_encoder");
    expect(model?.matrix).toEqual({ rows: 6, cols: 19 });
  });

  it("returns undefined for an unknown product id", () => {
    expect(viaModelFor(0x3434, 0xffff)).toBeUndefined();
  });

  it("recognises the Keychron vendor id for any product", () => {
    expect(isKeychronVendor(0x3434)).toBe(true);
    expect(isKeychronVendor(0x1234)).toBe(false);
  });
});
