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
  it.each([
    { height: 700, width: 420 },
    { height: 900, width: 1440 },
  ])("keeps project details contained at $width×$height", async (viewport) => {
    const page = await openPage(viewport);

    await page.locator('[data-project-details-action="open"]').click();
    await page.locator("[data-project-details-drawer]").evaluate((drawer) => {
      if (drawer.hasAttribute("hidden")) throw new Error("Project details drawer did not open");
    });

    const layout = await page.locator("[data-project-details-drawer]").evaluate((drawer) => {
      const dialog = drawer.shadowRoot?.querySelector<HTMLElement>("[part~='dialog']");
      const current = drawer.querySelector<HTMLElement>('[data-project-section="current"]');
      const saved = drawer.querySelector<HTMLElement>('[data-project-section="saved"]');
      const buttons = [...drawer.querySelectorAll<HTMLElement>("wa-button")];
      if (!dialog || !current || !saved) throw new Error("Missing project details content");
      const bounds = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return {
        dialog: bounds(dialog),
        current: bounds(current),
        saved: bounds(saved),
        buttons: buttons.map((button) => ({
          ...bounds(button),
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
        })),
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(isContained(layout.current, layout.dialog)).toBe(true);
    expect(isContained(layout.saved, layout.dialog)).toBe(true);
    expect(layout.buttons).not.toHaveLength(0);
    expect(layout.buttons.every((button) => button.clientWidth > 0 && button.scrollWidth <= button.clientWidth)).toBe(true);
  });

  it.each([
    { height: 700, width: 420 },
    { height: 900, width: 1440 },
  ])("keeps expanded project transfer controls contained at $width×$height", async (viewport) => {
    const page = await openPage(viewport);

    await page.locator('[data-project-details-action="open"]').click();
    const transfer = page.locator('[data-project-section="transfer"]');
    await transfer.scrollIntoViewIfNeeded();
    await transfer.click();
    await transfer.evaluate((details) => {
      if (!details.hasAttribute("open")) throw new Error("Project transfer did not open");
    });

    const layout = await page.locator("[data-project-details-drawer]").evaluate((drawer) => {
      const dialog = drawer.shadowRoot?.querySelector<HTMLElement>("[part~='dialog']");
      const transfer = drawer.querySelector<HTMLElement>('[data-project-section="transfer"]');
      const textarea = transfer?.querySelector<HTMLElement>("textarea");
      const buttons = [...(transfer?.querySelectorAll<HTMLElement>("wa-button") ?? [])];
      if (!dialog || !transfer || !textarea) throw new Error("Missing expanded project transfer content");
      const bounds = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      };
      return {
        dialog: bounds(dialog),
        transfer: bounds(transfer),
        textarea: { ...bounds(textarea), clientWidth: textarea.clientWidth, scrollWidth: textarea.scrollWidth },
        buttons: buttons.map((button) => ({
          ...bounds(button),
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
        })),
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(isHorizontallyContained(layout.transfer, layout.dialog)).toBe(true);
    expect(isHorizontallyContained(layout.textarea, layout.dialog)).toBe(true);
    expect(layout.textarea.scrollWidth).toBeLessThanOrEqual(layout.textarea.clientWidth);
    expect(layout.buttons.every((button) => button.clientWidth > 0 && button.scrollWidth <= button.clientWidth)).toBe(true);
  });

  it("stacks the editor workflow action above its connection warning at 420px", async () => {
    const page = await openPage({ width: 420, height: 700 });

    const layout = await page.locator("[data-editor-workflow]").evaluate((workflow) => {
      const connect = workflow.querySelector<HTMLElement>("[data-device-action=connect]");
      const warning = workflow.querySelector<HTMLElement>("[data-device-state]");
      if (!connect || !warning) throw new Error("Missing editor workflow content");
      const connectRect = connect.getBoundingClientRect();
      const warningRect = warning.getBoundingClientRect();
      return {
        connect: { bottom: connectRect.bottom, top: connectRect.top },
        warning: { bottom: warningRect.bottom, top: warningRect.top },
      };
    });

    expect(layout.warning.top).toBeGreaterThanOrEqual(layout.connect.bottom + 8);
  });

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
          return {
            clientWidth: button.clientWidth,
            scrollWidth: button.scrollWidth,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        }),
      };
    });

    expect(layout.layerTabs.overflowX).toBe("auto");
    expect(layout.layerTabs.scrollWidth).toBeGreaterThan(layout.layerTabs.clientWidth);
    expect(isContained(layout.layerTabs, layout.layerStrip)).toBe(true);
    expect(isContained(layout.actions, layout.layerStrip)).toBe(true);
    expect(layout.actionButtons).toHaveLength(2);
    expect(layout.actionButtons.every((button) => button.width > 0 && button.height > 0 && isContained(button, layout.actions))).toBe(true);
    expect(layout.actionButtons.every((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
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
        buttons: [...actions.querySelectorAll<HTMLElement>("[data-layer-action]")].map((button) => ({
          ...bounds(button),
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
        })),
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
    expect(layout.buttons.every((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
    expect(layout.actions.top).toBeGreaterThanOrEqual(layout.layerName.bottom);
    expect(layout.overflowY).toBe("visible");
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);

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

  it.each([
    { height: 700, width: 420 },
    { height: 478, width: 1566 },
  ])("keeps layer actions accessible through the main workspace at $width×$height", async (viewport) => {
    const page = await openPage(viewport);

    await page.locator("[data-layer-actions]").scrollIntoViewIfNeeded();
    const layout = await page.locator(".workspace").evaluate((workspace) => {
      const controls = workspace.querySelector<HTMLElement>("[data-workspace-controls]");
      const actions = workspace.querySelector<HTMLElement>("[data-layer-actions]");
      const canvas = workspace.querySelector<HTMLElement>("[data-keyboard-canvas]");
      if (!controls || !actions || !canvas) throw new Error("Missing editor controls");
      const workspaceRect = workspace.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      return {
        actions: { top: actionsRect.top, bottom: actionsRect.bottom },
        controls: {
          clientHeight: controls.clientHeight,
          scrollHeight: controls.scrollHeight,
          scrollTop: controls.scrollTop,
          overflowY: getComputedStyle(controls).overflowY,
        },
        workspace: {
          clientHeight: workspace.clientHeight,
          scrollHeight: workspace.scrollHeight,
          scrollTop: workspace.scrollTop,
          overflowY: getComputedStyle(workspace).overflowY,
          top: workspaceRect.top,
          bottom: workspaceRect.bottom,
        },
        keyboardCanvas: {
          clientHeight: canvas.clientHeight,
          clientWidth: canvas.clientWidth,
          overflowX: getComputedStyle(canvas).overflowX,
          scrollWidth: canvas.scrollWidth,
        },
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    expect(layout.workspace.overflowY).toBe("auto");
    expect(layout.workspace.scrollHeight).toBeGreaterThan(layout.workspace.clientHeight);
    expect(layout.workspace.scrollTop).toBeGreaterThan(0);
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.keyboardCanvas.clientHeight).toBeGreaterThan(0);
    expect(layout.keyboardCanvas.clientWidth).toBeGreaterThan(0);
    expect(layout.keyboardCanvas.overflowX).toBe("auto");
    if (viewport.width < 900) {
      expect(layout.keyboardCanvas.scrollWidth).toBeGreaterThan(layout.keyboardCanvas.clientWidth);
    }
    expect(layout.controls.overflowY).not.toBe("auto");
    expect(layout.controls.scrollTop).toBe(0);
    expect(layout.controls.scrollHeight).toBeLessThanOrEqual(layout.controls.clientHeight);
    expect(layout.actions.top).toBeGreaterThanOrEqual(layout.workspace.top);
    expect(layout.actions.bottom).toBeLessThanOrEqual(layout.workspace.bottom);
  });

  it("frames the keyboard canvas and preserves the inspector", async () => {
    const page = await openPage({ width: 1440, height: 900 });

    const layout = await page.locator("[data-workbench-surface]").evaluate((surface) => {
      const canvas = surface.querySelector<HTMLElement>("[data-keyboard-canvas]");
      const inspector = surface.querySelector<HTMLElement>("[data-key-info-panel]");
      if (!canvas || !inspector) throw new Error("Missing workbench regions");
      const canvasStyle = getComputedStyle(canvas);
      const inspectorStyle = getComputedStyle(inspector);
      return {
        canvas: {
          borderTopWidth: Number.parseFloat(canvasStyle.borderTopWidth),
          overflowX: canvasStyle.overflowX,
        },
        inspector: {
          borderLeftWidth: Number.parseFloat(inspectorStyle.borderLeftWidth),
          overflowY: inspectorStyle.overflowY,
        },
      };
    });

    expect(layout.canvas.borderTopWidth).toBeGreaterThan(0);
    expect(layout.canvas.overflowX).toBe("auto");
    expect(layout.inspector.borderLeftWidth).toBeGreaterThan(0);
    expect(["auto", "scroll"]).toContain(layout.inspector.overflowY);
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
