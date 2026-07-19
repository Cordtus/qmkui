import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const desktopRoot = fileURLToPath(new URL("../", import.meta.url));
let browser: Browser;
let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  server = await createServer({
    root: desktopRoot,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: process.env.QMKUI_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
  });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("device-first connection layout", () => {
  it.each([
    { height: 700, width: 420 },
    { height: 900, width: 1440 },
  ])("keeps the neutral connection screen contained at $width×$height", async (viewport) => {
    const page = await openPage(viewport);
    const layout = await page.locator("[data-connection-screen]").evaluate((screen) => {
      const action = screen.querySelector<HTMLElement>("[data-device-action=connect]");
      const panel = screen.querySelector<HTMLElement>(".connection-panel");
      if (!action || !panel) throw new Error("Missing connection controls");
      const bounds = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      };
      const actionStyle = getComputedStyle(action);
      return {
        action: bounds(action),
        actionRadius: actionStyle.borderTopLeftRadius,
        panel: bounds(panel),
        pageHeight: document.documentElement.scrollHeight,
        pageWidth: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.pageHeight).toBeLessThanOrEqual(layout.viewportHeight);
    expect(layout.actionRadius).toBe("0px");
    expect(isContained(layout.action, layout.panel)).toBe(true);
  });

  it("does not move the page when connection controls are clicked", async () => {
    const page = await openPage({ width: 420, height: 700 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('[data-device-action="connect"]').click();
    const position = await page.evaluate(() => ({ left: window.scrollX, top: window.scrollY }));

    expect(position).toEqual({ left: 0, top: 0 });
    expect(await page.locator("[data-connection-screen]").count()).toBe(1);
  });
});

async function openPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[data-connection-screen]").waitFor();
  return page;
}

function isContained(
  child: { left: number; right: number; top: number; bottom: number },
  parent: { left: number; right: number; top: number; bottom: number },
): boolean {
  const tolerance = 0.5;
  return (
    child.left >= parent.left - tolerance &&
    child.right <= parent.right + tolerance &&
    child.top >= parent.top - tolerance &&
    child.bottom <= parent.bottom + tolerance
  );
}
