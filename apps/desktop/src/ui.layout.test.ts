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
    expect(layout.actionRadius).toBe("4px");
    expect(isContained(layout.action, layout.panel)).toBe(true);
  }, 30_000);

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
    // Identity and capabilities share the Device facts disclosure; lighting is
    // the always-visible card above it.
    expect(layout.menuLeftEdges[1]).toBeGreaterThan(layout.menuLeftEdges[0]);
    expect(layout.menuLeftEdges[2]).toBeLessThan(layout.menuLeftEdges[0]);
  }, 20_000);

  it("keeps the keymap canvas scrollable and page-contained at phone width", async () => {
    const page = await openReadResultPage({ width: 420, height: 820 });
    await page.locator('[data-view="keymap"]').click();
    await page.locator("[data-keyboard-workspace]").waitFor();
    const layout = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>("[data-keyboard-canvas]");
      const board = canvas?.querySelector<HTMLElement>(".board");
      if (!canvas || !board) throw new Error("Missing keymap canvas");
      const style = getComputedStyle(canvas);
      return {
        boardWidth: board.getBoundingClientRect().width,
        canvasClient: canvas.clientWidth,
        canvasOverflowX: style.overflowX,
        canvasOverflowY: style.overflowY,
        canvasScroll: canvas.scrollWidth,
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    // The page never scrolls sideways; the canvas itself does.
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.canvasOverflowX).toBe("auto");
    expect(layout.canvasOverflowY).toBe("hidden");
    expect(layout.canvasScroll).toBeGreaterThan(layout.canvasClient);
    expect(layout.boardWidth).toBeGreaterThanOrEqual(640);
  }, 20_000);

  it("filters the palette and board picker in the browser without losing focus", async () => {
    const page = await openReadResultPage({ width: 1440, height: 900 });
    await page.locator("[data-command-palette-open]").click();
    const input = page.locator("[data-focus-id=command-search]");
    await input.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id") === "command-search",
      undefined,
      { timeout: 5_000 },
    );
    await input.fill("firmware");
    expect(await page.locator("[data-command]:visible").count()).toBe(1);
    const hiddenRow = page.locator('[data-command="Go to Keymap"]');
    expect(await hiddenRow.evaluate((row) => getComputedStyle(row).display)).toBe("none");

    await input.press("Enter");
    expect(
      await page.locator('[data-view="firmware"]').getAttribute("aria-current"),
    ).toBe("page");

    await page.locator("[data-command-palette-open]").click();
    await page.locator("[data-focus-id=command-search]").waitFor();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id") === "command-palette-trigger",
      undefined,
      { timeout: 5_000 },
    );

    await page.locator("[data-board-picker-open]").click();
    const search = page.locator("[data-focus-id=catalog-search]");
    await search.waitFor();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id") === "catalog-search",
      undefined,
      { timeout: 5_000 },
    );
    await search.fill("ex");
    expect(
      await page.locator('[data-catalog-keyboard="example/keyboard"]').isVisible(),
    ).toBe(true);
    expect(
      await page.locator('[data-catalog-keyboard="keychron/v5_max/ansi_encoder"]').isHidden(),
    ).toBe(true);
    expect(await search.evaluate((element) => document.activeElement === element)).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("data-focus-id") === "board-picker-trigger",
      undefined,
      { timeout: 5_000 },
    );
  }, 20_000);

  it("keeps the compact write bar on one row at desktop widths", async () => {
    for (const width of [1440, 1024]) {
      const page = await openReadResultPage({ width, height: 900 });
      await page.locator('[data-view="keymap"]').click();
      const layout = await page.locator("[data-write-confirm]").evaluate((checkbox) => {
        const bar = checkbox.closest(".write-bar")!;
        const centers = [...bar.children].map((child) => {
          const box = child.getBoundingClientRect();
          return Math.round(box.top + box.height / 2);
        });
        return {
          pageWidth: document.documentElement.scrollWidth,
          centers,
          viewportWidth: window.innerWidth,
        };
      });
      expect(Math.max(...layout.centers) - Math.min(...layout.centers)).toBeLessThanOrEqual(2);
      expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    }
  }, 30_000);

  it("runs the new Device controls and disclosures from the keyboard", async () => {
    const page = await openReadResultPage({ width: 1440, height: 900 });

    await page.locator("[data-command-palette-open]").focus();
    await page.keyboard.press("Control+k");
    const search = page.locator("[data-focus-id=command-search]");
    await search.waitFor();
    let focusStayedInDialog = false;
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const dialog = document.querySelector<HTMLDialogElement>("[data-command-palette]");
        const active = document.activeElement;
        return {
          inside: Boolean(dialog && active && dialog.contains(active)),
          isBody: active === document.body,
        };
      });
      // Chromium's modal dialog cycles through <body> between its first and
      // last control; it must never land on a page control outside the dialog.
      expect(where.inside || where.isBody).toBe(true);
      focusStayedInDialog ||= where.inside;
    }
    expect(focusStayedInDialog).toBe(true);
    await search.fill("device");
    await page.keyboard.press("Enter");
    expect(await page.locator('[data-view="device"]').getAttribute("aria-current")).toBe("page");

    const tester = page.locator("[data-key-tester-toggle]");
    await tester.focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-test-capture]").waitFor();
    expect(await tester.getAttribute("aria-pressed")).toBe("true");

    await page.keyboard.press("Enter");
    expect(await page.locator("[data-test-capture]").count()).toBe(0);
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-focus-id")),
    ).toBe("key-tester-toggle");

    await page.locator("[data-command-palette-open]").focus();
    await page.keyboard.press("Control+k");
    await page.locator("[data-focus-id=command-search]").waitFor();
    await page.locator("[data-focus-id=command-search]").fill("firmware");
    await page.keyboard.press("Enter");
    expect(await page.locator('[data-view="firmware"]').getAttribute("aria-current")).toBe("page");

    const log = page.locator('[data-context-detail="build-log"]');
    await log.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => log.getAttribute("open")).not.toBeNull();
    await page.keyboard.press("Enter");
    await expect.poll(() => log.getAttribute("open")).toBeNull();
    await page.close();
  }, 30_000);

  it("gives every visible interactive control an accessible name", async () => {
    const page = await openReadResultPage({ width: 1440, height: 900 });
    for (const view of ["keymap", "device", "firmware"] as const) {
      await page.locator(`[data-view="${view}"]`).click();
      const unnamed = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [role=slider], [tabindex='0']",
          ),
        ]
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => {
            const labelledBy = element.getAttribute("aria-labelledby");
            if (labelledBy && document.getElementById(labelledBy)?.textContent?.trim()) {
              return false;
            }
            const label =
              element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              element.textContent?.trim() ||
              (element instanceof HTMLInputElement
                ? [...(element.labels ?? [])].map((item) => item.textContent?.trim()).join(" ")
                : "");
            return !label;
          })
          .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
      );
      expect(unnamed, view).toEqual([]);
    }
    await page.close();
  }, 30_000);

  it("renders identical connection and Keymap screenshots with reduced motion", async () => {
    const connection = await openPage({ width: 1440, height: 900 });
    const normalConnection = await connection.screenshot();
    await connection.close();

    const reducedConnection = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    await reducedConnection.goto(origin, { waitUntil: "networkidle" });
    await reducedConnection.locator("[data-connection-screen]").waitFor();
    expect((await reducedConnection.screenshot()).equals(normalConnection)).toBe(true);
    await reducedConnection.close();

    const keymap = await openReadResultPage({ width: 1440, height: 900 });
    await keymap.locator('[data-view="keymap"]').click();
    await keymap.locator("[data-keyboard-workspace]").waitFor();
    const normalKeymap = await keymap.screenshot();
    await keymap.close();

    const reducedKeymap = await openReadResultPage(
      { width: 1440, height: 900 },
      { reducedMotion: "reduce" },
    );
    await reducedKeymap.locator('[data-view="keymap"]').click();
    await reducedKeymap.locator("[data-keyboard-workspace]").waitFor();
    expect((await reducedKeymap.screenshot()).equals(normalKeymap)).toBe(true);
    await reducedKeymap.close();
  }, 30_000);

  it("stays contained at 320 px and at an effective 200% zoom", async () => {
    for (const viewport of [{ width: 320, height: 720 }, { width: 720, height: 450 }]) {
      const page = await openReadResultPage(viewport);
      await page.locator('[data-view="keymap"]').click();
      const layout = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        board: document.querySelector<HTMLElement>("[data-keyboard-canvas]")?.getBoundingClientRect(),
      }));
      expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.board?.width ?? 0).toBeGreaterThan(0);

      await page.locator('[data-view="device"]').click();
      const device = await page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>("[data-device-status]");
        return {
          pageWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          stripRight: strip?.getBoundingClientRect().right,
        };
      });
      expect(device.pageWidth).toBeLessThanOrEqual(device.viewportWidth);
      expect(device.stripRight ?? 0).toBeLessThanOrEqual(device.viewportWidth);
      await page.close();
    }
  }, 30_000);

  it("honours reduced motion on an element that actually transitions", async () => {
    const normalPage = await openReadResultPage({ width: 1440, height: 900 });
    await normalPage.locator('[data-view="keymap"]').click();
    const normal = await normalPage.locator("[data-key]").first().evaluate((element) => {
      const value = getComputedStyle(element).transitionDuration.split(",")[0]!.trim();
      return value.endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value);
    });
    await normalPage.close();

    const reducedPage = await openReadResultPage(
      { width: 1440, height: 900 },
      { reducedMotion: "reduce" },
    );
    await reducedPage.locator('[data-view="keymap"]').click();
    const reduced = await reducedPage.locator("[data-key]").first().evaluate((element) => {
      const value = getComputedStyle(element).transitionDuration.split(",")[0]!.trim();
      return value.endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value);
    });
    await reducedPage.close();

    expect(normal).toBeGreaterThanOrEqual(0.1);
    expect(reduced).toBeLessThan(normal);
    expect(reduced).toBeLessThanOrEqual(0.00002);
  }, 30_000);

  it("keeps the board-lighting disclosure open while adjusting it", async () => {
    const page = await openReadResultPage({ width: 1440, height: 900 });
    await page.locator('[data-view="keymap"]').click();
    const disclosure = page.locator('[data-context-detail="board-lighting"]');
    await disclosure.click({ position: { x: 24, y: 12 } });
    // The controlled state commits from the native toggle event.
    await expect.poll(() => disclosure.getAttribute("open")).not.toBeNull();

    await page.locator('[data-lighting-control="brightness"]').evaluate((input) => {
      (input as HTMLInputElement).value = "120";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(await disclosure.getAttribute("open")).not.toBeNull();
  }, 20_000);

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
  }, 20_000);
});

async function openPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.locator("[data-connection-screen]").waitFor();
  return page;
}

async function openReadResultPage(
  viewport: { width: number; height: number },
  options: { reducedMotion?: "reduce" } = {},
): Promise<Page> {
  const page = await browser.newPage({ viewport, ...options });
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
  // Discovery may already have produced the snapshot before the explicit read
  // button is clickable; accept either path and then wait for the snapshot.
  await Promise.race([
    page.locator('[data-device-action="read"]').click().catch(() => undefined),
    page.locator("[data-hardware-snapshot]").waitFor(),
  ]);
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
