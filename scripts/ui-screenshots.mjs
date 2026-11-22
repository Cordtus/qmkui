#!/usr/bin/env node
// Capture the main surfaces at three widths for design review.
// Output: apps/desktop/.local/ui-screens (gitignored).
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const { chromium } = require("playwright");
const desktop = new URL("../apps/desktop/", import.meta.url).pathname;
const output = path.join(desktop, ".local", "ui-screens");
const port = Number(process.env.QMKUI_SCREENSHOT_PORT ?? 5198);
const base = `http://127.0.0.1:${port}`;

const server = spawn(
  "npm",
  ["run", "dev", "--", "--port", String(port), "--strictPort"],
  { cwd: desktop, stdio: "ignore" },
);
const stop = () => {
  server.kill("SIGTERM");
};
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`vite did not start on ${base}`);
}

async function main() {
  await mkdir(output, { recursive: true });
  await ready();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}/?demo`);
  await page.waitForTimeout(800);

  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 980 });
    for (const view of ["keymap", "device", "catalog", "system"]) {
      await page.click(`[data-view="${view}"]`);
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(output, `${width}-${view}.png`),
        fullPage: false,
      });
      if (view === "keymap") {
        for (const tab of ["key", "layer"]) {
          await page.click(`[data-keymap-tab="${tab}"]`);
          await page.waitForTimeout(150);
          await page.screenshot({
            path: path.join(output, `${width}-keymap-${tab}.png`),
            fullPage: false,
          });
        }
        await page.click('[data-keymap-tab="lighting"]');
      }
    }
  }

  await browser.close();
  console.log(`wrote screenshots to ${output}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(stop);
