/**
 * Hex <-> HSV conversions shared by the lighting preview and the colour picker.
 * Hue is 0-360; saturation and value are 0-1. Invalid input is passed through
 * as a neutral grey so callers never crash on a half-typed hex field.
 */

export type Hsv = { h: number; s: number; v: number };

export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) {
    return null;
  }
  const raw = match[1]!;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((character) => character + character)
          .join("")
      : raw;
  return `#${full.toLowerCase()}`;
}

export function hexToHsv(input: string): Hsv {
  const hex = normalizeHex(input) ?? "#808080";
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
  }

  return { h: Math.round((h * 60 + 360) % 360), s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp01(s);
  const value = clamp01(v);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[r, g, b]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Convert the 0-255 hue/saturation/value triple the VIA protocol reports. */
export function hsv255ToHex(hue: number, saturation: number, value: number): string {
  return hsvToHex((hue / 255) * 360, saturation / 255, value / 255);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
