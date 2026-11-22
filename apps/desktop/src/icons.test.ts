// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { icon, type IconName } from "./icons";

describe("icon", () => {
  it("renders a decorative library glyph", () => {
    const svg = icon("keyboard");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 256 256");
    expect(svg.querySelector("path")).not.toBeNull();
  });

  it("covers every icon with a parseable glyph and default size", () => {
    const names = [
      "arrow-fat-line-up","arrow-u-up-left","arrow-u-up-right","arrows-clockwise",
      "caret-down","check-circle","copy","cursor-click","dots-three","download-simple",
      "eye","file-code","floppy-disk","hammer","key","keyboard","lightbulb","lightning",
      "lock","magnifying-glass","minus","paint-brush","plug","plus","stack","sun","usb",
      "warning","x","x-circle",
    ] satisfies IconName[];
    for (const name of names) {
      const svg = icon(name, { className: "extra" });
      expect(svg.querySelector("path, rect, circle"), name).not.toBeNull();
      expect(svg.getAttribute("width")).toBe("16");
      expect(svg.classList.contains("extra")).toBe(true);
    }
  });

  it("takes an accessible name when asked", () => {
    const svg = icon("lock", { label: "Writes armed", size: 20 });
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Writes armed");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
  });
});
