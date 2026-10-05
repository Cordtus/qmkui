import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicDir = new URL("../public/", import.meta.url);
const manifestUrl = new URL("../public/manifest.json", import.meta.url);
const indexUrl = new URL("../index.html", import.meta.url);

type Manifest = {
  name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: Array<{ src: string; sizes: string; purpose: string }>;
};

const manifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as Manifest;

describe("web app manifest", () => {
  it("declares an installable standalone app", () => {
    expect(manifest.name).toBe("QMKUI");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
  });

  it("ships 192 and 512 icons and every icon file exists", () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const icon of manifest.icons) {
      expect(existsSync(new URL(icon.src, manifestUrl)), icon.src).toBe(true);
    }
  });

  it("is linked from index.html with a relative path", () => {
    const html = readFileSync(indexUrl, "utf8");
    expect(html).toContain('href="./manifest.json"');
    expect(html).toContain('rel="icon"');
    expect(existsSync(new URL("icon.svg", publicDir))).toBe(true);
  });
});
