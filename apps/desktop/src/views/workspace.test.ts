import { describe, expect, it } from "vitest";
import { lightingForKey } from "../keyDetails";
import { dimHex } from "./workspace";

describe("keymap lighting mirror", () => {
  it("dims a key color toward the board base as brightness falls", () => {
    expect(dimHex("#5fb99a", 1)).toBe("#5fb99a");
    expect(dimHex("#5fb99a", 0)).toBe("#182631");
    // clamped out-of-range factors
    expect(dimHex("#5fb99a", 2)).toBe("#5fb99a");
    expect(dimHex("#5fb99a", -1)).toBe("#182631");
    expect(dimHex("not-a-color", 0.5)).toBe("not-a-color");
  });

  it("exposes the profile brightness, defaulting and clamping it", () => {
    expect(lightingForKey({ id: "p", name: "P", mode: "static", perKey: {} }, "k").brightness).toBe(180);
    expect(
      lightingForKey({ id: "p", name: "P", mode: "static", perKey: {}, global: { brightness: 40 } }, "k")
        .brightness,
    ).toBe(40);
    expect(
      lightingForKey({ id: "p", name: "P", mode: "static", perKey: {}, global: { brightness: 999 } }, "k")
        .brightness,
    ).toBe(255);
  });
});
