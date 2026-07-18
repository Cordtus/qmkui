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

describe("lower workspace layout", () => {
  it("keeps desktop layer tabs in a scroll strip and actions inside their tools", async () => {
    const page = await openPage({ width: 1440, height: 1200 });

    for (let index = 0; index < 9; index += 1) {
      await page.locator(".layer-tab.add").click();
    }

    const layout = await page.locator("[data-workspace-controls]").evaluate((controls) => {
      const bounds = (selector: string) => {
        const element = controls.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const layerTabs = controls.querySelector<HTMLElement>(".layers");
      const actions = controls.querySelector<HTMLElement>("[data-layer-actions]");
      if (!layerTabs || !actions) throw new Error("Missing lower controls");
      return {
        controls: (() => {
          const rect = controls.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        })(),
        layerStrip: bounds("[data-layer-strip]"),
        layerTabs: {
          clientWidth: layerTabs.clientWidth,
          overflowX: getComputedStyle(layerTabs).overflowX,
          scrollWidth: layerTabs.scrollWidth,
          ...bounds(".layers"),
        },
        actions: bounds("[data-layer-actions]"),
        actionButtons: [...actions.querySelectorAll<HTMLElement>("[data-layer-action]")].map((button) => {
          const rect = button.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
        }),
      };
    });

    expect(layout.layerTabs.overflowX).toBe("auto");
    expect(layout.layerTabs.scrollWidth).toBeGreaterThan(layout.layerTabs.clientWidth);
    expect(isContained(layout.layerTabs, layout.layerStrip)).toBe(true);
    expect(isContained(layout.actions, layout.layerStrip)).toBe(true);
    expect(layout.actionButtons).toHaveLength(2);
    expect(layout.actionButtons.every((button) => button.width > 0 && button.height > 0 && isContained(button, layout.actions))).toBe(true);
  });

  it("stacks lower groups without horizontal page overflow on a narrow viewport", async () => {
    const page = await openPage({ width: 420, height: 1200 });

    const layout = await page.locator("[data-workspace-controls]").evaluate((controls) => {
      const bounds = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const groups = [...controls.querySelectorAll<HTMLElement>(":scope > [data-settings-group]")];
      const layerTools = controls.querySelector<HTMLElement>("[data-layer-tools]");
      const actions = controls.querySelector<HTMLElement>("[data-layer-actions]");
      const layerName = controls.querySelector<HTMLElement>(".layer-name-field");
      const contextDock = controls.querySelector<HTMLElement>("[data-context-dock]");
      if (!layerTools || !actions || !layerName || !contextDock) {
        throw new Error("Missing lower controls");
      }
      return {
        controls: bounds(controls),
        groups: groups.map(bounds),
        layerTools: bounds(layerTools),
        layerName: bounds(layerName),
        actions: bounds(actions),
        contextDock: bounds(contextDock),
        buttons: [...actions.querySelectorAll<HTMLElement>("[data-layer-action]")].map(bounds),
        overflowY: getComputedStyle(controls).overflowY,
        scrollHeight: controls.scrollHeight,
        clientHeight: controls.clientHeight,
        viewportWidth: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
      };
    });

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.groups).toHaveLength(2);
    expect(layout.groups.every((group) => isHorizontallyContained(group, layout.controls))).toBe(true);
    expect(layout.groups[1].top).toBeGreaterThanOrEqual(layout.groups[0].bottom);
    expect(isContained(layout.layerName, layout.layerTools)).toBe(true);
    expect(isContained(layout.actions, layout.layerTools)).toBe(true);
    expect(layout.buttons.every((button) => button.width > 0 && button.height > 0 && isContained(button, layout.actions))).toBe(true);
    expect(layout.actions.top).toBeGreaterThanOrEqual(layout.layerName.bottom);
    expect(layout.overflowY).toBe("auto");
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);

    await page.locator("[data-context-dock]").scrollIntoViewIfNeeded();
    const contextAfterScroll = await page.locator("[data-context-dock]").evaluate((dock) => {
      const controls = dock.closest<HTMLElement>("[data-workspace-controls]");
      if (!controls) throw new Error("Missing workspace controls");
      const dockRect = dock.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      return {
        dock: { top: dockRect.top, bottom: dockRect.bottom },
        controls: { top: controlsRect.top, bottom: controlsRect.bottom },
      };
    });
    expect(contextAfterScroll.dock.bottom).toBeGreaterThan(contextAfterScroll.controls.top);
    expect(contextAfterScroll.dock.top).toBeLessThan(contextAfterScroll.controls.bottom);
  });
});

async function openPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[data-workspace-controls]").waitFor();
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

function isHorizontallyContained(
  child: { left: number; right: number },
  parent: { left: number; right: number },
): boolean {
  const tolerance = 0.5;
  return child.left >= parent.left - tolerance && child.right <= parent.right + tolerance;
}
