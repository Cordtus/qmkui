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

  it("keeps a real hardware keymap read contained and its grouped controls aligned at a narrow desktop width", async () => {
    const page = await openReadResultPage({ width: 900, height: 760 });
    const layout = await page.locator("[data-hardware-snapshot]").evaluate((snapshot) => {
      const keymap = snapshot.querySelector<HTMLElement>("[data-hardware-keymap]");
      const board = snapshot.querySelector<HTMLElement>("[data-hardware-keymap-board]");
      const layerTabs = snapshot.querySelector<HTMLElement>("[data-hardware-layer-tabs]");
      const identity = snapshot.querySelector<HTMLElement>("[data-snapshot-field=identity]");
      const capabilities = snapshot.querySelector<HTMLElement>("[data-snapshot-field=capabilities]");
      const lighting = snapshot.querySelector<HTMLElement>("[data-snapshot-field=lighting]");
      if (!keymap || !board || !layerTabs || !identity || !capabilities || !lighting) {
        throw new Error("Expected a complete hardware snapshot workspace");
      }

      const bounds = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      };
      const styles = [identity, capabilities, lighting].map((panel) => getComputedStyle(panel));
      return {
        board: bounds(board),
        keymap: bounds(keymap),
        layerTabs: bounds(layerTabs),
        menuBorders: styles.map((style) => style.borderTopWidth),
        menuLeftEdges: [bounds(identity).left, bounds(capabilities).left, bounds(lighting).left],
        pageWidth: document.documentElement.scrollWidth,
        snapshot: bounds(snapshot as HTMLElement),
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(isContained(layout.keymap, layout.snapshot)).toBe(true);
    expect(isContained(layout.board, layout.keymap)).toBe(true);
    expect(isContained(layout.layerTabs, layout.keymap)).toBe(true);
    expect(layout.board.right - layout.board.left).toBeLessThanOrEqual(
      layout.keymap.right - layout.keymap.left,
    );
    expect(layout.menuBorders).toEqual(["1px", "1px", "1px"]);
    expect(layout.menuLeftEdges[0]).toBe(layout.menuLeftEdges[2]);
    expect(layout.menuLeftEdges[1]).toBeGreaterThan(layout.menuLeftEdges[0]);
  });

  it("keeps the gated write confirmation inline", async () => {
    const page = await openReadResultPage({ width: 1200, height: 800 });
    await page.locator('[data-view="keymap"]').click();
    await page.locator("[data-device-write-controls]").waitFor();
    const layout = await page.locator("[data-device-write-controls]").evaluate((controls) => {
      const checkbox = controls.querySelector<HTMLElement>('input[data-write-confirm="true"]')!;
      const label = controls.querySelector<HTMLElement>(".write-confirm")!;
      const checkboxBox = checkbox.getBoundingClientRect();
      return {
        checkboxHeight: checkboxBox.height,
        checkboxWidth: checkboxBox.width,
        labelHeight: label.getBoundingClientRect().height,
      };
    });

    // A global `input` rule stretches controls to full width; the confirmation
    // checkbox must stay a small inline control.
    expect(layout.checkboxWidth).toBeLessThanOrEqual(20);
    expect(layout.checkboxHeight).toBeLessThanOrEqual(20);
    expect(layout.labelHeight).toBeLessThanOrEqual(30);
  });
});

async function openPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[data-connection-screen]").waitFor();
  return page;
}

async function openReadResultPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
    const report = (bytes: number[]) => {
      const result = new Uint8Array(32);
      result.set(bytes);
      return result;
    };
    const responseFor = (request: Uint8Array) => {
      if (request[0] === 0xa0) return report([0xa0, 0x02, 0x00, 0x02]);
      if (request[0] === 0xa1) return report([0xa1, ...[..."v1.0.0"].map((character) => character.charCodeAt(0))]);
      if (request[0] === 0xa2) return report([0xa2, 0x00, 0x81]);
      if (request[0] === 0xa3) return report([0xa3, 0x02]);
      if (request[0] === 0x11) return report([0x11, 0x04]);
      if (request[0] === 0x04) return report([0x04, request[1]!, request[2]!, request[3]!, 0x12, 0x34]);
      // VIA RGB-matrix channel 3 (the V5 has no 0xa8 vendor RGB protocol).
      if (request[0] === 0x08 && request[1] === 0x03) {
        if (request[2] === 0x01) return report([0x08, 0x03, 0x01, 200]);
        if (request[2] === 0x02) return report([0x08, 0x03, 0x02, 7]);
        if (request[2] === 0x03) return report([0x08, 0x03, 0x03, 128]);
        if (request[2] === 0x04) return report([0x08, 0x03, 0x04, 113, 221]);
      }
      return undefined;
    };
    const device = {
      vendorId: 0x3434,
      productId: 0x0950,
      productName: "Keychron V5 Max",
      collections: [{ usagePage: 0xff60, usage: 0x0061 }],
      opened: false,
      open: async () => {
        device.opened = true;
      },
      close: async () => {
        device.opened = false;
      },
      sendReport: async (_reportId: number, data: BufferSource) => {
        const response = responseFor(new Uint8Array(data as ArrayBuffer));
        if (response) listeners.forEach((listener) => listener({ reportId: 0, data: response }));
      },
      addEventListener: (_type: "inputreport", listener: (event: { reportId: number; data: Uint8Array }) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: "inputreport", listener: (event: { reportId: number; data: Uint8Array }) => void) => {
        listeners.delete(listener);
      },
    };
    Object.defineProperty(navigator, "hid", {
      configurable: true,
      value: { getDevices: async () => [device], requestDevice: async () => [device] },
    });
  });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator('[data-device-action="read"]').click();
  await page.locator("[data-hardware-snapshot]").waitFor();
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
