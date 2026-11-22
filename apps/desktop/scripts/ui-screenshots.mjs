#!/usr/bin/env node
// Capture the main surfaces at three widths for design review.
// Output: apps/desktop/.local/ui-screens (gitignored).
import { rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const desktop = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(desktop, ".local", "ui-screens");
const views = ["keymap", "device", "firmware"];
const widths = [1440, 1024, 768];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const server = await createServer({
  root: desktop,
  configFile: path.join(desktop, "vite.config.ts"),
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const base = server.resolvedUrls?.local?.[0];
if (!base) {
  await server.close();
  throw new Error("vite did not expose a local URL");
}

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.QMKUI_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 980 });

    await page.goto(base);
    await page.locator("[data-connection-screen]").waitFor();
    await page.screenshot({ path: path.join(output, `${width}-connection.png`) });

    await page.goto(`${base}?demo`);
    await page.locator("[data-view=keymap]").waitFor();
    for (const view of views) {
      await page.click(`[data-view="${view}"]`);
      if (view === "keymap") {
        await page.click('[data-keymap-tab="lighting"]');
        await page.screenshot({ path: path.join(output, `${width}-keymap-lighting.png`) });
        for (const tab of ["key", "layer"]) {
          await page.click(`[data-keymap-tab="${tab}"]`);
          await page.screenshot({ path: path.join(output, `${width}-keymap-${tab}.png`) });
        }
      } else {
        await page.screenshot({ path: path.join(output, `${width}-${view}.png`) });
      }
    }
    if (width === 1440) {
      await page.click("[data-command-palette-open]");
      await page.locator("[data-focus-id=command-search]").waitFor();
      await page.screenshot({ path: path.join(output, "1440-command-palette.png") });
      await page.keyboard.press("Escape");
      await page.click("[data-board-picker-open]");
      await page.locator("[data-focus-id=catalog-search]").waitFor();
      await page.screenshot({ path: path.join(output, "1440-board-picker.png") });
      await page.keyboard.press("Escape");
    }
  }
  console.log(`wrote screenshots to ${output}`);
} finally {
  await browser?.close();
  await server.close();
}
