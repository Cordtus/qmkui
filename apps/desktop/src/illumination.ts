import { hsv255ToHex } from "./color";
import type { GenericViaStandardState } from "./devices/genericViaReader";
import type { KeychronV5MaxReadSnapshot } from "./devices/keychronV5MaxReader";

/**
 * The colour a connected board is actually lit with, as far as VIA exposes it.
 * VIA reports only global RGB-matrix state (hue/saturation/brightness) — there
 * is no per-LED colour map — so every key shares this colour unless the project
 * overrides it per key.
 */
export type IlluminationBase = {
  color: string;
  brightness: number;
  /** Human-readable source, e.g. "RGB Matrix" or "RGB Light". */
  source: string;
};

type Snapshot = KeychronV5MaxReadSnapshot | GenericViaStandardState | undefined;

export function illuminationBase(snapshot: Snapshot): IlluminationBase | null {
  if (!snapshot) {
    return null;
  }
  if ("capabilities" in snapshot) {
    if (snapshot.lighting.state !== "available") {
      return null;
    }
    const { hue, saturation, brightness } = snapshot.lighting.value;
    return { color: hsv255ToHex(hue, saturation, brightness), brightness, source: "RGB Matrix" };
  }

  const matrix = rgbChannels(snapshot.lighting.rgbMatrixHue, snapshot.lighting.rgbMatrixSaturation, snapshot.lighting.rgbMatrixBrightness);
  if (matrix) {
    return { ...matrix, source: "RGB Matrix" };
  }
  const light = rgbChannels(snapshot.lighting.rgblightHue, snapshot.lighting.rgblightSaturation, snapshot.lighting.rgblightBrightness);
  if (light) {
    return { ...light, source: "RGB Light" };
  }
  return null;
}

function rgbChannels(
  hue: { state: string; value?: number },
  saturation: { state: string; value?: number },
  brightness: { state: string; value?: number },
): { color: string; brightness: number } | null {
  if (hue.state !== "available" || saturation.state !== "available" || brightness.state !== "available") {
    return null;
  }
  const h = hue.value ?? 0;
  const s = saturation.value ?? 0;
  const v = brightness.value ?? 0;
  return { color: hsv255ToHex(h, s, v), brightness: v };
}
