import { describe, expect, it } from "vitest";
import { illuminationBase } from "./illumination";
import type { GenericViaStandardState } from "./devices/genericViaReader";
import type { KeychronV5MaxReadSnapshot } from "./devices/keychronV5MaxReader";

describe("illuminationBase", () => {
  it("reads the Keychron RGB-matrix colour from the snapshot", () => {
    const base = illuminationBase(v5Snapshot({ brightness: 200, hue: 113, saturation: 221 }));
    expect(base).toMatchObject({ brightness: 200, source: "RGB Matrix" });
    expect(base?.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is null when the Keychron lighting read is not available", () => {
    expect(illuminationBase(v5Snapshot(undefined))).toBeNull();
  });

  it("prefers RGB matrix over RGB light on a generic VIA device", () => {
    const snapshot = genericSnapshot();
    const base = illuminationBase(snapshot);
    expect(base?.source).toBe("RGB Matrix");
    expect(base?.brightness).toBe(200);
  });

  it("falls back to RGB light when RGB matrix is unavailable", () => {
    const snapshot = genericSnapshot();
    snapshot.lighting.rgbMatrixHue = { state: "unavailable", reason: "timeout" };
    const base = illuminationBase(snapshot);
    expect(base?.source).toBe("RGB Light");
    expect(base?.brightness).toBe(180);
  });

  it("is null without a snapshot", () => {
    expect(illuminationBase(undefined)).toBeNull();
  });
});

function v5Snapshot(
  lighting: { brightness: number; hue: number; saturation: number } | undefined,
): KeychronV5MaxReadSnapshot {
  return {
    identity: { state: "unavailable", reason: "not read" },
    capabilities: { state: "unavailable", reason: "not read" },
    keymap: { state: "unavailable", reason: "not read" },
    lighting: lighting
      ? { state: "available", value: { effect: 0, effectSpeed: 0, ...lighting } }
      : { state: "unavailable", reason: "not read" },
    macros: { state: "unavailable", reason: "not read" },
    readAt: "2026-10-04T00:00:00.000Z",
  };
}

function genericSnapshot(): GenericViaStandardState {
  const value = (v: number) => ({ state: "available" as const, value: v });
  return {
    identity: { state: "unavailable", reason: "not read" },
    protocolVersion: value(0x000c),
    uptime: value(1),
    layoutOptions: value(0),
    firmwareVersion: value(1),
    keycodesVersion: value(1),
    layerCount: value(4),
    keymap: { state: "unavailable", reason: "not read" },
    switchMatrix: { state: "unavailable", reason: "not read" },
    lighting: {
      backlightBrightness: value(0),
      backlightEffect: value(0),
      rgblightBrightness: value(180),
      rgblightEffect: value(0),
      rgblightEffectSpeed: value(0),
      rgblightHue: value(113),
      rgblightSaturation: value(221),
      rgbMatrixBrightness: value(200),
      rgbMatrixEffect: value(0),
      rgbMatrixEffectSpeed: value(0),
      rgbMatrixHue: value(113),
      rgbMatrixSaturation: value(221),
      ledMatrixBrightness: value(0),
      ledMatrixEffect: value(0),
      ledMatrixEffectSpeed: value(0),
    },
    readAt: "2026-10-04T00:00:00.000Z",
  };
}
