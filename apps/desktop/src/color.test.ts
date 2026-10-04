import { describe, expect, it } from "vitest";
import { hexToHsv, hsv255ToHex, hsvToHex, normalizeHex } from "./color";

describe("colour conversions", () => {
  it("normalizes 3- and 6-digit hex", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("ff0000")).toBe("#ff0000");
    expect(normalizeHex("nope")).toBeNull();
  });

  it("round-trips a hex through HSV", () => {
    for (const hex of ["#5fb99a", "#000000", "#ffffff", "#f2c94c", "#1e88e5"]) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });

  it("maps the 0-255 VIA triple onto hex", () => {
    // Full saturation, mid value, hue 0 -> pure red at 50% value.
    expect(hsv255ToHex(0, 255, 128)).toBe("#800000");
    expect(hsv255ToHex(255, 0, 255)).toBe("#ffffff");
  });
});
