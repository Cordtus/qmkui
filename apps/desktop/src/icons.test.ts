// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { icon } from "./icons";

describe("icon", () => {
  it("renders a decorative library glyph", () => {
    const svg = icon("keyboard");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 256 256");
    expect(svg.querySelector("path")).not.toBeNull();
  });

  it("takes an accessible name when asked", () => {
    const svg = icon("lock", { label: "Writes armed", size: 20 });
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Writes armed");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
  });
});
