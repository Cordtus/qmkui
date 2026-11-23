import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) {
    throw new Error(`missing colour token --${name}`);
  }
  return match[1]!;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const bright = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (bright + 0.05) / (dark + 0.05);
}

describe("theme contrast", () => {
  it("keeps body, dim, and faint text above 4.5:1 on panels", () => {
    for (const background of ["bg", "panel", "panel-2"]) {
      for (const foreground of ["text", "text-dim", "text-faint"]) {
        expect(
          contrast(token(foreground), token(background)),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps accent, warning, and danger above 3:1 on panels", () => {
    for (const background of ["panel", "panel-2"]) {
      for (const foreground of ["accent", "warn", "danger"]) {
        expect(
          contrast(token(foreground), token(background)),
          `${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps accent ink readable on the accent fill", () => {
    expect(contrast(token("accent-ink"), token("accent"))).toBeGreaterThanOrEqual(4.5);
  });
});
