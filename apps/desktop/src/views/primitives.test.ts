import { describe, expect, it } from "vitest";
import { hsvFromWheelPoint } from "./primitives";

describe("colour wheel geometry", () => {
  it("maps the cardinal directions to hue and the rim to full saturation", () => {
    // 0° is up: red; 90° right: yellow-ish; 180° down; 270° left.
    expect(hsvFromWheelPoint(0, -10, 10)).toEqual({ h: 0, s: 1 });
    expect(hsvFromWheelPoint(10, 0, 10)).toEqual({ h: 90, s: 1 });
    expect(hsvFromWheelPoint(0, 10, 10)).toEqual({ h: 180, s: 1 });
    expect(hsvFromWheelPoint(-10, 0, 10)).toEqual({ h: 270, s: 1 });
  });

  it("treats the centre as white and clamps outside the rim", () => {
    expect(hsvFromWheelPoint(0, 0, 10)).toEqual({ h: 0, s: 0 });
    expect(hsvFromWheelPoint(100, 0, 10).s).toBe(1);
  });

  it("handles a zero radius without dividing by zero", () => {
    expect(hsvFromWheelPoint(5, 5, 0)).toEqual({ h: 0, s: 0 });
  });
});
