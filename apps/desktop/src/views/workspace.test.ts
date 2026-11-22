import { describe, expect, it } from "vitest";
import { lightingForKey } from "../keyDetails";

describe("keymap lighting mirror", () => {
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

  it("mirrors the device illumination when there is no per-key override", () => {
    const base = { color: "#1bc88d", brightness: 200, source: "RGB Matrix" };
    const lighting = lightingForKey({ id: "p", name: "P", mode: "reactive", perKey: {} }, "k", base);
    expect(lighting).toMatchObject({
      color: "#1bc88d",
      brightness: 200,
      mode: "reactive",
      source: "device",
    });
  });

  it("lights keys from a configured board colour with no device read", () => {
    const lighting = lightingForKey(
      { id: "p", name: "P", mode: "static", perKey: {}, global: { color: "#ff8800" } },
      "k",
    );
    expect(lighting).toMatchObject({
      color: "#ff8800",
      mode: "static",
      source: "profile",
    });
  });

  it("prefers a profile brightness draft over the board value", () => {
    const base = { color: "#1bc88d", brightness: 200, source: "RGB Matrix" };
    const lighting = lightingForKey(
      { id: "p", name: "P", mode: "static", perKey: {}, global: { brightness: 40 } },
      "k",
      base,
    );
    expect(lighting.brightness).toBe(40);
  });

  it("prefers a per-key override over the device illumination", () => {
    const base = { color: "#1bc88d", brightness: 200, source: "RGB Matrix" };
    const lighting = lightingForKey(
      { id: "p", name: "P", mode: "reactive", perKey: { k: "#ff0000" } },
      "k",
      base,
    );
    expect(lighting.color).toBe("#ff0000");
    expect(lighting.source).toBe("override");
  });

  it("is unlit with no override and no device read", () => {
    const lighting = lightingForKey({ id: "p", name: "P", mode: "reactive", perKey: {} }, "k");
    expect(lighting).toMatchObject({ color: "", mode: "off", source: "none" });
  });
});
