// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { exportQmkJson, type DoctorReport } from "./domain";
import { createMemoryProjectStorage } from "./projectStorage";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import {
  createEmptySafetyLedger,
  createRecoveryBundle,
  serializeRecoveryBundle,
  type RecoveryBundle,
} from "./safety";
import { createSafetyLedgerStorage } from "./safetyStorage";
import { createApp } from "./ui";

afterEach(() => {
  document.body.replaceChildren();
});

describe("desktop preview layer controls", () => {
  it("uses one combined workbench with a compact context command dock", () => {
    const root = document.createElement("div");

    createApp(root);

    expect(
      [...root.querySelectorAll<HTMLElement>(".rail [data-view]")].map(
        (item) => item.dataset.view,
      ),
    ).toEqual(["workspace", "catalog", "system"]);
    expect(root.querySelector('[data-panel="workspace"]')).not.toBeNull();
    expect(root.querySelector("[data-workspace-panel]")).toBeNull();
    expect(root.querySelector("aside[data-context-slot]")).toBeNull();
    expect(root.querySelector(".combined-context")).toBeNull();
    expect(root.querySelector("[data-keyboard-workspace] [data-context-dock]")).not.toBeNull();
    expect(
      [...root.querySelectorAll<HTMLElement>("[data-context-tab]")].map(
        (item) => item.dataset.contextTab,
      ),
    ).toEqual(["assignment", "lighting", "test"]);
    expect(root.querySelector('[data-context-section="assignment"]')).not.toBeNull();
    expect(root.querySelector('[data-context-section="lighting"]')).toBeNull();
    expect(root.querySelector('[data-context-section="test"]')).toBeNull();
    expect(root.querySelector('[data-context-section="project"]')).toBeNull();
    expect(root.querySelector('[data-context-section="build"]')).toBeNull();
    expect(root.querySelector('[data-key="v5_001"]')).not.toBeNull();
  });

  it("keeps diagnostics out of the default workspace and opens them on demand", () => {
    const root = document.createElement("div");

    createApp(root);

    expect(root.querySelector('[data-panel="workspace"] > .details')).toBeNull();
    const diagnostics = root.querySelector<HTMLElement>("[data-diagnostics-drawer]");
    expect(diagnostics).not.toBeNull();
    expect(diagnostics?.hidden).toBe(true);

    root.querySelector<HTMLElement>('[data-diagnostics-action="open"]')?.click();

    const opened = root.querySelector<HTMLElement>("[data-diagnostics-drawer]");
    expect(opened?.hidden).toBe(false);
    expect(opened?.querySelector("pre")?.textContent).toContain("keychron/v5_max/ansi_encoder");
  });

  it("keeps header actions distinct and reports keymap status before build status", () => {
    const root = document.createElement("div");

    createApp(root, { qmkDetected: false });

    expect(root.querySelector('[data-project-action="save"]')?.textContent).toBe("Save project");
    expect(root.querySelector('[data-diagnostics-action="open"]')?.textContent).toBe("Project details");
    expect(root.querySelector(".topbar-actions")?.textContent).not.toContain("Save Diagnostics");
    expect(root.querySelector(".status")?.textContent).toBe("Keymap valid");
  });

  it("uses the component layer for core controls and custom key elements", () => {
    const root = document.createElement("div");

    createApp(root);

    expect(root.querySelector('wa-button[data-diagnostics-action="open"]')).not.toBeNull();
    expect(root.querySelector("wa-drawer[data-diagnostics-drawer]")).not.toBeNull();
    expect(root.querySelector("qmk-key[data-key='v5_001']")).not.toBeNull();
    expect(
      [...root.querySelectorAll("wa-button")].every((button) =>
        button.classList.contains("control-button"),
      ),
    ).toBe(true);
  });

  it("fits crowded visual key labels instead of relying on ellipsis truncation", () => {
    const root = document.createElement("div");

    createApp(root);

    [
      ["v5_014", "Home"],
      ["v5_015", "End"],
      ["v5_031", "Num"],
      ["v5_065", "Enter"],
      ["v5_080", "Shift"],
      ["v5_085", "Enter"],
    ].forEach(([keyId, label]) => {
      const key = root.querySelector<HTMLElement>(`qmk-key[data-key="${keyId}"]`);
      expect(key?.querySelector("strong")?.textContent).toBe(label);
      expect(key?.style.getPropertyValue("--key-label-size")).toMatch(/px$/);
    });
  });

  it("keeps the keyboard canvas and command dock in the fixed workbench surface", () => {
    const root = document.createElement("div");

    createApp(root);

    const surface = root.querySelector<HTMLElement>("[data-workbench-surface]");
    expect(surface).not.toBeNull();
    const workspace = surface?.querySelector<HTMLElement>("[data-keyboard-workspace]");
    const stage = workspace?.querySelector<HTMLElement>("[data-keyboard-stage]");
    const canvas = workspace?.querySelector<HTMLElement>("[data-keyboard-canvas]");
    const info = workspace?.querySelector<HTMLElement>("[data-key-info-panel]");
    const controls = workspace?.querySelector<HTMLElement>("[data-workspace-controls]");
    expect(workspace).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(info).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(stage?.querySelector("[data-keyboard-canvas]")).toBe(canvas);
    expect(stage?.querySelector("[data-key-info-panel]")).toBe(info);
    expect(controls?.querySelector("[data-layer-strip]")).not.toBeNull();
    expect(controls?.querySelector("[data-context-dock]")).not.toBeNull();
    expect(controls?.querySelector("[data-context-slot]")).not.toBeNull();
    expect([...workspace!.children].indexOf(stage!)).toBeLessThan(
      [...workspace!.children].indexOf(controls!),
    );
    expect(surface?.querySelector(".layer-sidebar")).toBeNull();
    expect(surface?.querySelector(".context-panel")).toBeNull();
    expect(root.querySelector("[data-workbench-surface] + .details")).toBeNull();
  });

  it("uses full row width while keeping the keyboard canvas sized to the board", () => {
    const root = document.createElement("div");

    createApp(root);

    const stage = root.querySelector<HTMLElement>("[data-keyboard-stage]");
    const canvas = root.querySelector<HTMLElement>("[data-keyboard-canvas]");
    const board = root.querySelector<HTMLElement>(".board");
    expect(stage).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(board).not.toBeNull();
    expect(canvas?.style.width).toBe(board?.style.width);
    expect(canvas?.style.height).toBe(board?.style.height);
    expect(stage?.style.width).toBe("100%");
    expect(stage?.style.maxWidth).toBe("");
    expect(stage?.style.getPropertyValue("--keyboard-board-width")).toBe(board?.style.width);
    expect(stage?.style.maxHeight).toBe(`calc(${board?.style.height} + var(--keyboard-canvas-pad-y))`);
  });

  it("keeps duplicate and delete actions compact relative to the key map", () => {
    const root = document.createElement("div");

    createApp(root);

    const board = root.querySelector<HTMLElement>(".board");
    const actions = root.querySelector<HTMLElement>("[data-layer-actions]");
    expect(board).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(Number.parseFloat(actions?.style.maxWidth ?? "0")).toBeLessThanOrEqual(
      Number.parseFloat(board?.style.width ?? "0") * 0.2,
    );
  });

  it("separates unrelated bottom controls into labeled setting groups", () => {
    const root = document.createElement("div");

    createApp(root);

    expect(
      [...root.querySelectorAll<HTMLElement>("[data-settings-group]")].map(
        (group) => group.dataset.settingsGroup,
      ),
    ).toEqual(["layers", "selection"]);
    expect(root.querySelector('[data-settings-group="layers"] [data-layer-action="duplicate"]')).not.toBeNull();
    expect(root.querySelector('[data-settings-group="selection"] [data-context-tab="assignment"]')).not.toBeNull();
  });

  it("uses disclosure components for secondary context instead of a tall inspector list", () => {
    const root = document.createElement("div");

    createApp(root);

    expect(root.querySelector('wa-details[data-context-detail="assignment-tools"]')).not.toBeNull();
    expect(root.querySelector('wa-details[data-context-detail="keycode-palette"]')).not.toBeNull();
    expect(root.querySelector('wa-details[data-context-detail="selected-key-details"]')).toBeNull();
  });

  it("keeps selected-key info and related details beside the key map", () => {
    const root = document.createElement("div");

    createApp(root);

    const info = root.querySelector<HTMLElement>("[data-key-info-panel]");
    const controls = root.querySelector<HTMLElement>("[data-workspace-controls]");
    expect(info).not.toBeNull();
    expect(info?.querySelector("[data-selected-key-summary]")).not.toBeNull();
    expect(info?.querySelector('[data-key-detail-section="layers"]')).not.toBeNull();
    expect(info?.querySelector('[data-key-detail-section="relations"]')).not.toBeNull();
    expect(controls?.querySelector("[data-selected-key-summary]")).toBeNull();
  });

  it("gives the visual key map more room after removing the side inspector", () => {
    const root = document.createElement("div");

    createApp(root);

    const firstKey = root.querySelector<HTMLElement>('qmk-key[data-key="v5_000"]');
    expect(Number.parseFloat(firstKey?.style.width ?? "0")).toBeGreaterThanOrEqual(45);
  });

  it("selects the Fn layer", () => {
    const root = document.createElement("div");

    createApp(root);

    root.querySelector<HTMLButtonElement>('[data-layer="1"]')?.click();

    expect(root.querySelector('[data-layer="1"]')?.getAttribute("aria-selected")).toBe("true");
    expect(root.querySelector('[data-layer="2"]')?.getAttribute("aria-selected")).toBe("false");
  });

  it("updates the selected keycode and QMK JSON preview", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    const keycodeInput = root.querySelector<HTMLInputElement>(
      '[data-focus-id="selected-keycode"]',
    );
    expect(keycodeInput).not.toBeNull();

    keycodeInput!.value = "KC_F13";
    keycodeInput!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(root.querySelector("pre")?.textContent).toContain("KC_F13");
  });

  it("updates selected key lighting immediately", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    const colorInput = root.querySelector<HTMLInputElement>(
      '[data-focus-id="selected-lighting-color"]',
    );
    expect(colorInput).not.toBeNull();

    colorInput!.value = "#ff0000";
    colorInput!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(
      root.querySelector<HTMLElement>('[data-key="v5_001"]')?.style.getPropertyValue("--key-light"),
    ).toBe("#ff0000");
  });

  it("applies keycodes from the palette to the selected key", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-keycode-category="media"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-keycode="KC_MUTE"]')?.click();

    expect(
      root.querySelector<HTMLInputElement>('[data-focus-id="selected-keycode"]')?.value,
    ).toBe("KC_MUTE");
    expect(root.querySelector("pre")?.textContent).toContain("KC_MUTE");
  });

  it("formats Windows-key aliases without changing exported QMK", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_087"]')?.click();

    expect(root.querySelector<HTMLButtonElement>('[data-key="v5_087"]')?.textContent).toBe("Win");
    expect(
      root.querySelector<HTMLInputElement>('[data-focus-id="selected-keycode"]')?.value,
    ).toBe("KC_LWIN");
    expect(root.querySelector("pre")?.textContent).toContain("KC_LWIN");
  });

  it("keeps the keycode input focused during multi-character edits", () => {
    const root = document.createElement("div");
    document.body.append(root);

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    const keycodeInput = root.querySelector<HTMLInputElement>(
      '[data-focus-id="selected-keycode"]',
    );
    expect(keycodeInput).not.toBeNull();

    keycodeInput!.focus();
    keycodeInput!.value = "KC_F13";
    keycodeInput!.setSelectionRange(keycodeInput!.value.length, keycodeInput!.value.length);
    keycodeInput!.dispatchEvent(new Event("input", { bubbles: true }));

    const nextInput = root.querySelector<HTMLInputElement>('[data-focus-id="selected-keycode"]');
    expect(document.activeElement).toBe(nextInput);

    nextInput!.value = "KC_F14";
    nextInput!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.activeElement).toBe(
      root.querySelector<HTMLInputElement>('[data-focus-id="selected-keycode"]'),
    );
    expect(root.querySelector("pre")?.textContent).toContain("KC_F14");
  });

  it("keeps the color input focused when lighting changes", () => {
    const root = document.createElement("div");
    document.body.append(root);

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    const colorInput = root.querySelector<HTMLInputElement>(
      '[data-focus-id="selected-lighting-color"]',
    );
    expect(colorInput).not.toBeNull();

    colorInput!.focus();
    colorInput!.value = "#ff0000";
    colorInput!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(document.activeElement).toBe(
      root.querySelector<HTMLInputElement>('[data-focus-id="selected-lighting-color"]'),
    );
  });

  it("exposes selected key state", () => {
    const root = document.createElement("div");

    createApp(root);
    const selectedKey = root.querySelector<HTMLButtonElement>('[data-key="v5_000"]');

    expect(selectedKey?.getAttribute("aria-pressed")).toBe("true");

    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();

    expect(root.querySelector('[data-key="v5_000"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector('[data-key="v5_001"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("uses source-backed Keychron V5 Max geometry and target data", () => {
    const layout = keychronV5MaxKeyboard.layouts[0];
    const exported = exportQmkJson(keychronV5MaxProject, keychronV5MaxKeyboard);

    expect(keychronV5MaxProject.target.qmkKeyboard).toBe("keychron/v5_max/ansi_encoder");
    expect(keychronV5MaxKeyboard.source?.version).toBe("keychron-qmk-b4bdf3f1-v5-max");
    expect(layout.keys).toHaveLength(98);
    expect(layout.keys.every((key) => key.matrix !== undefined)).toBe(true);
    expect(layout.keys[91]).toMatchObject({ id: "v5_091", matrix: { row: 5, col: 11 } });
    expect(exported.layers[2][91]).toBe("MO(3)");
    expect(exported.layers[3][36]).toBe("RGB_MOD");
  });

  it("shows selected-key relationships for layer keys", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_091"]')?.click();

    expect(root.querySelector('[data-layer-function="2"]')?.getAttribute("data-layer-qmk")).toBe(
      "MO(3)",
    );
    expect(
      [...root.querySelectorAll('[data-relation-kind="layer"]')].some(
        (node) => node.getAttribute("data-relation-qmk") === "MO(3)",
      ),
    ).toBe(true);
  });

  it("updates lighting profile mode from the combined workspace", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLElement>('[data-context-tab="lighting"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-lighting-mode="static"]')?.click();

    expect(root.querySelector('[data-context-section="lighting"]')).not.toBeNull();
    expect(root.querySelector('[data-lighting-mode="static"]')?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("renders source-backed lighting capabilities and profile controls", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLElement>('[data-context-tab="lighting"]')?.click();

    expect(root.querySelector('[data-lighting-system="rgbMatrix"]')?.getAttribute("data-support")).toBe(
      "supported",
    );
    expect(root.querySelector('[data-lighting-system="rgblight"]')?.getAttribute("data-support")).toBe(
      "unsupported",
    );

    const brightness = root.querySelector<HTMLInputElement>(
      '[data-lighting-control="brightness"]',
    );
    expect(brightness).not.toBeNull();
    brightness!.value = "64";
    brightness!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(
      root.querySelector<HTMLInputElement>('[data-lighting-control="brightness"]')?.value,
    ).toBe("64");
  });

  it("captures host key events in the combined workspace", () => {
    const root = document.createElement("div");
    document.body.append(root);

    createApp(root);
    root.querySelector<HTMLElement>('[data-context-tab="test"]')?.click();
    const capture = root.querySelector<HTMLElement>("[data-test-capture]");
    expect(capture).not.toBeNull();
    capture!.focus();

    capture!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, code: "KeyA", key: "a" }),
    );

    expect(document.activeElement).toBe(root.querySelector<HTMLElement>("[data-test-capture]"));
    expect(root.querySelector("[data-host-qmk]")?.getAttribute("data-host-qmk")).toBe("KC_A");
    expect(Number(root.querySelector("[data-test-match-count]")?.getAttribute("data-test-match-count"))).toBeGreaterThan(
      0,
    );
    expect(root.querySelector('[data-event-qmk="KC_A"]')).not.toBeNull();

    root
      .querySelector<HTMLElement>("[data-test-capture]")!
      .dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyB", key: "b" }));
    expect(root.querySelector("[data-test-events]")?.getAttribute("data-test-events")).toBe("2");
    expect(document.activeElement).toBe(root.querySelector<HTMLElement>("[data-test-capture]"));

    const currentCapture = root.querySelector<HTMLElement>("[data-test-capture]");
    expect(currentCapture).not.toBeNull();
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Tab",
      key: "Tab",
    });
    expect(currentCapture!.dispatchEvent(tabEvent)).toBe(true);
    expect(tabEvent.defaultPrevented).toBe(false);
    expect(root.querySelector("[data-test-events]")?.getAttribute("data-test-events")).toBe("2");
  });

  it("filters the bundled catalog by USB id", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-view="catalog"]')?.click();
    const search = root.querySelector<HTMLInputElement>('[data-focus-id="catalog-search"]');
    expect(search).not.toBeNull();

    search!.value = "0950";
    search!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(root.querySelector('[data-catalog-results]')?.getAttribute("data-catalog-results")).toBe(
      "1",
    );
  });

  it("creates a project from a selected catalog keyboard", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-view="catalog"]')?.click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-catalog-keyboard="example/keyboard"] [data-catalog-action="select"]',
      )
      ?.click();

    const exported = readQmkPreview(root);
    expect(root.querySelector('[data-panel="workspace"]')).not.toBeNull();
    expect(exported.keyboard).toBe("example/keyboard");
    expect(exported.layout).toBe("LAYOUT");
    expect(exported.layers).toEqual([
      ["KC_ESC", "KC_A", "MO(1)"],
      ["KC_TRNS", "KC_TRNS", "KC_TRNS"],
    ]);
  });

  it("opens the source-backed default project for the bundled Keychron catalog entry", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_091"]')?.click();
    const keycode = root.querySelector<HTMLInputElement>('[data-focus-id="selected-keycode"]');
    expect(keycode).not.toBeNull();
    keycode!.value = "TG(3)";
    keycode!.dispatchEvent(new Event("input", { bubbles: true }));

    root.querySelector<HTMLButtonElement>('[data-view="catalog"]')?.click();
    root
      .querySelector<HTMLButtonElement>(
        '[data-catalog-keyboard="keychron/v5_max/ansi_encoder"] [data-catalog-action="select"]',
      )
      ?.click();

    const exported = readQmkPreview(root);
    expect(exported.layers).toHaveLength(4);
    expect(exported.layers[2][91]).toBe("MO(3)");
    expect(exported.layers[3][36]).toBe("RGB_MOD");
  });

  it("shows build readiness and the QMK compile command", () => {
    const root = document.createElement("div");

    createApp(root, { qmkDetected: true });
    root.querySelector<HTMLButtonElement>('[data-view="system"]')?.click();

    expect(root.querySelector('[data-build-output]')?.getAttribute("data-build-output")).toBe(
      "json",
    );
    expect(root.querySelector('[data-build-ready]')?.getAttribute("data-build-ready")).toBe("true");
    expect(root.querySelector('[data-build-command]')?.getAttribute("data-build-command")).toBe(
      "qmk compile -kb keychron/v5_max/ansi_encoder -km keychron_v5_max",
    );
  });

  it("does not report selected local builds ready when qmk is missing", () => {
    const root = document.createElement("div");

    createApp(root, { qmkDetected: false });
    root.querySelector<HTMLButtonElement>('[data-view="system"]')?.click();

    expect(root.querySelector("[data-build-ready]")?.getAttribute("data-build-ready")).toBe("false");
  });

  it("reports local readiness as unavailable when no Doctor report can be loaded", async () => {
    const root = document.createElement("div");

    createApp(root, { doctorReportLoader: async () => null });
    await Promise.resolve();
    root.querySelector<HTMLButtonElement>('[data-view="system"]')?.click();

    expect(readDefinition(root, "Local build")).toBe("Unavailable");
    expect(root.querySelector("[data-build-ready]")?.getAttribute("data-build-ready")).toBe("false");
    expect(root.querySelector('[data-command="qmk"]')).toBeNull();
  });

  it("keeps a newer refresh result when the initial report finishes later", async () => {
    const root = document.createElement("div");
    const initial = deferred<DoctorReport | null>();
    const refresh = deferred<DoctorReport | null>();
    const pendingReports = [initial.promise, refresh.promise];
    let loads = 0;

    createApp(root, { doctorReportLoader: () => pendingReports[loads++] });
    root.querySelector<HTMLElement>(".probe-strip .secondary-action")?.click();

    refresh.resolve(doctorReportWithQmk("/usr/bin/qmk"));
    await flushDoctorLoad();
    root.querySelector<HTMLElement>('[data-view="system"]')?.click();
    expect(readDefinition(root, "Local build")).toBe("Ready");

    initial.resolve(null);
    await flushDoctorLoad();

    expect(loads).toBe(2);
    expect(readDefinition(root, "Local build")).toBe("Ready");
    expect(root.querySelector('[data-command="qmk"]')?.getAttribute("data-command-ready")).toBe(
      "true",
    );
  });

  it("settles a rejected injected report loader as unavailable", async () => {
    const root = document.createElement("div");

    createApp(root, {
      doctorReportLoader: async () => {
        throw new Error("report loader failed");
      },
    });
    await flushDoctorLoad();

    expect(root.querySelector(".probe-meta strong")?.textContent).toBe("Unavailable");
    root.querySelector<HTMLElement>('[data-view="system"]')?.click();
    expect(readDefinition(root, "Local build")).toBe("Unavailable");
  });

  it("keeps build blocking in System while the topbar reports keymap validity", () => {
    const root = document.createElement("div");
    const remoteProject = structuredClone(keychronV5MaxProject);
    remoteProject.build.mode = "remoteApi";

    createApp(root, { project: remoteProject, qmkDetected: true });
    expect(root.querySelector(".status")?.textContent).toBe("Keymap valid");
    root.querySelector<HTMLButtonElement>('[data-view="system"]')?.click();
    expect(root.querySelector("[data-build-ready]")?.getAttribute("data-build-ready")).toBe("false");
  });

  it("adds and removes an unreferenced layer without breaking export", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>(".layer-tab.add")?.click();

    let exported = readQmkPreview(root);
    expect(root.querySelector('[data-layer="4"]')?.getAttribute("aria-selected")).toBe("true");
    expect(exported.layers[4]).toEqual(Array(keychronV5MaxKeyboard.layouts[0].keys.length).fill("KC_TRNS"));

    root.querySelector<HTMLButtonElement>('[data-layer-action="delete"]')?.click();

    exported = readQmkPreview(root);
    expect(exported.layers).toHaveLength(4);
    expect(root.querySelector('[data-layer="3"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("duplicates the selected layer and preserves exported assignments", () => {
    const root = document.createElement("div");

    createApp(root);
    const before = readQmkPreview(root);
    root.querySelector<HTMLButtonElement>('[data-layer-action="duplicate"]')?.click();
    const after = readQmkPreview(root);

    expect(root.querySelector('[data-layer="4"]')?.getAttribute("aria-selected")).toBe("true");
    expect(after.layers[4]).toEqual(before.layers[2]);
  });

  it("renames the selected layer through the layer name field", () => {
    const root = document.createElement("div");

    createApp(root);
    const name = root.querySelector<HTMLInputElement>('[data-focus-id="selected-layer-name"]');
    expect(name).not.toBeNull();

    name!.value = "Gaming";
    name!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(root.querySelector('[data-layer="2"]')?.textContent).toContain("Gaming");
  });

  it("blocks deletion when assignments still target the layer", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-layer="3"]')?.click();
    const remove = root.querySelector<HTMLButtonElement>('[data-layer-action="delete"]');

    expect(remove?.disabled).toBe(true);
    expect(remove?.getAttribute("data-layer-delete-ready")).toBe("false");
    expect(readQmkPreview(root).layers).toHaveLength(4);
  });

  it("edits layer assignments with structured controls", () => {
    const root = document.createElement("div");
    document.body.append(root);

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_091"]')?.click();
    expect(root.querySelector('[data-advanced-assignment="layer"]')).not.toBeNull();

    const action = root.querySelector<HTMLSelectElement>('[data-advanced-field="layer-action"]');
    expect(action).not.toBeNull();
    action!.focus();
    action!.value = "TG";
    action!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(document.activeElement).toBe(
      root.querySelector<HTMLSelectElement>('[data-advanced-field="layer-action"]'),
    );
    expect(root.querySelector("[data-export-mode]")?.getAttribute("data-export-mode")).toBe("json");
    expect(readQmkPreview(root).layers[2][91]).toBe("TG(3)");

    const target = root.querySelector<HTMLSelectElement>('[data-advanced-field="target-layer"]');
    expect(target).not.toBeNull();
    target!.value = "1";
    target!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(readQmkPreview(root).layers[2][91]).toBe("TG(1)");
  });

  it("creates and edits a layer-tap assignment from the selected key", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-assignment-template="layerTap"]')?.click();

    expect(root.querySelector('[data-advanced-assignment="layerTap"]')).not.toBeNull();
    expect(readQmkPreview(root).layers[2][1]).toBe("LT(3, KC_SPC)");

    const tap = root.querySelector<HTMLInputElement>('[data-focus-id="advanced-layer-tap-key"]');
    expect(tap).not.toBeNull();
    tap!.value = "KC_ESC";
    tap!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(readQmkPreview(root).layers[2][1]).toBe("LT(3, KC_ESC)");
  });

  it("creates and edits a mod-tap assignment from the selected key", () => {
    const root = document.createElement("div");

    createApp(root);
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-assignment-template="modTap"]')?.click();

    expect(root.querySelector('[data-advanced-assignment="modTap"]')).not.toBeNull();
    expect(readQmkPreview(root).layers[2][1]).toBe("MT(MOD_LCTL, KC_ESC)");

    const modifier = root.querySelector<HTMLSelectElement>('[data-advanced-field="mod-tap-modifier"]');
    expect(modifier).not.toBeNull();
    modifier!.value = "MOD_LSFT";
    modifier!.dispatchEvent(new Event("change", { bubbles: true }));

    const tap = root.querySelector<HTMLInputElement>('[data-focus-id="advanced-mod-tap-key"]');
    expect(tap).not.toBeNull();
    tap!.value = "KC_TAB";
    tap!.dispatchEvent(new Event("input", { bubbles: true }));

    expect(readQmkPreview(root).layers[2][1]).toBe("MT(MOD_LSFT, KC_TAB)");
  });

  it("saves the edited project through header file actions", () => {
    const root = document.createElement("div");
    const storage = createMemoryProjectStorage(() => "2026-06-27T20:00:00.000Z");

    createApp(root, { projectStorage: storage });
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    const keycodeInput = root.querySelector<HTMLInputElement>(
      '[data-focus-id="selected-keycode"]',
    );
    expect(keycodeInput).not.toBeNull();
    keycodeInput!.value = "KC_F13";
    keycodeInput!.dispatchEvent(new Event("input", { bubbles: true }));

    root.querySelector<HTMLButtonElement>('[data-project-action="save"]')?.click();

    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "Saved Keychron V5 Max ANSI Knob",
    );
    const saved = storage.load(keychronV5MaxProject.id);
    expect(saved?.layers[2].assignments[1].qmk).toBe("KC_F13");
  });

  it("opens a saved project and switches to the matching bundled keyboard", () => {
    const root = document.createElement("div");
    const storage = createMemoryProjectStorage(() => "2026-06-27T20:00:00.000Z");
    storage.save({
      ...structuredClone(keychronV5MaxProject),
      id: "edited_keychron",
      name: "Edited Keychron",
    });
    storage.save({
      ...structuredClone(keychronV5MaxProject),
      id: "edited_example",
      name: "Edited Example",
      target: {
        keyboardId: "example/keyboard",
        qmkKeyboard: "example/keyboard",
        layoutId: "LAYOUT",
        qmkLayoutMacro: "LAYOUT",
      },
      layers: [
        {
          id: "layer_0",
          index: 0,
          name: "Base",
          enabled: true,
          assignments: [
            { id: "a", visualKeyId: "k00", kind: "basic", qmk: "KC_ESC" },
            { id: "b", visualKeyId: "k01", kind: "basic", qmk: "KC_B" },
            { id: "c", visualKeyId: "k02", kind: "layer", qmk: "MO(1)" },
          ],
        },
        {
          id: "layer_1",
          index: 1,
          name: "Fn",
          enabled: true,
          assignments: [
            { id: "d", visualKeyId: "k00", kind: "transparent", qmk: "KC_TRNS" },
            { id: "e", visualKeyId: "k01", kind: "media", qmk: "KC_MUTE" },
            { id: "f", visualKeyId: "k02", kind: "transparent", qmk: "KC_TRNS" },
          ],
        },
      ],
    });

    createApp(root, { projectStorage: storage });
    const savedProjects = root.querySelector<HTMLSelectElement>(
      '[data-focus-id="saved-project-select"]',
    );
    expect(savedProjects).not.toBeNull();
    savedProjects!.value = "edited_example";
    savedProjects!.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-project-action="open"]')?.click();

    const exported = readQmkPreview(root);
    expect(root.querySelector('[data-panel="workspace"]')).not.toBeNull();
    expect(exported.keyboard).toBe("example/keyboard");
    expect(exported.layers[0]).toEqual(["KC_ESC", "KC_B", "MO(1)"]);
  });

  it("imports project JSON from the diagnostics file draft", () => {
    const root = document.createElement("div");
    const importedProject = {
      ...structuredClone(keychronV5MaxProject),
      name: "Imported Keychron",
    };

    createApp(root);
    const draft = root.querySelector<HTMLTextAreaElement>('[data-focus-id="project-json-draft"]');
    expect(draft).not.toBeNull();
    draft!.value = JSON.stringify(importedProject);
    draft!.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-project-action="import"]')?.click();

    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "Imported Imported Keychron",
    );
    expect(root.querySelector("h1")?.textContent).toBe("Imported Keychron");
  });

  it("restores a project from an app-native recovery bundle without a connected keyboard", () => {
    const root = document.createElement("div");
    const recoveredProject = {
      ...structuredClone(keychronV5MaxProject),
      name: "Recovered Keychron",
    };
    const bundle = createRecoveryBundle({
      project: recoveredProject,
      keyboard: keychronV5MaxKeyboard,
      ledger: createEmptySafetyLedger(),
      createdAt: "2026-07-17T20:00:00.000Z",
    });

    createApp(root);
    const draft = root.querySelector<HTMLTextAreaElement>('[data-focus-id="project-json-draft"]');
    expect(draft).not.toBeNull();
    draft!.value = serializeRecoveryBundle(bundle);
    draft!.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-project-action="import"]')?.click();

    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "Imported Recovered Keychron",
    );
    expect(root.querySelector("h1")?.textContent).toBe("Recovered Keychron");
  });

  it("rejects malformed nested project JSON without replacing the open project", () => {
    const root = document.createElement("div");
    createApp(root);
    const originalName = root.querySelector("h1")?.textContent;
    const malformedProject = {
      ...structuredClone(keychronV5MaxProject),
      name: "Malformed import",
      build: {},
    };

    const draft = root.querySelector<HTMLTextAreaElement>('[data-focus-id="project-json-draft"]');
    expect(draft).not.toBeNull();
    draft!.value = JSON.stringify(malformedProject);
    draft!.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-project-action="import"]')?.click();

    expect(root.querySelector("[data-project-status]")?.textContent).toContain(
      "Import failed: Project JSON has invalid build",
    );
    expect(root.querySelector("h1")?.textContent).toBe(originalName);
    expect(readQmkPreview(root).keyboard).toBe("keychron/v5_max/ansi_encoder");
  });

  it("creates a local recovery bundle before future write preparation", () => {
    const root = document.createElement("div");
    const downloadedBundles: RecoveryBundle[] = [];
    const safetyLedgerStorage = createSafetyLedgerStorage(createMemoryStorage());

    createApp(root, {
      safetyLedgerStorage,
      downloadRecoveryBundle: (bundle) => downloadedBundles.push(bundle),
      now: (() => {
        const timestamps = ["2026-07-17T20:00:00.000Z", "2026-07-17T20:00:01.000Z"];
        return () => timestamps.shift() ?? "2026-07-17T20:00:02.000Z";
      })(),
    });
    root.querySelector<HTMLButtonElement>('[data-diagnostics-action="open"]')?.click();

    expect(root.querySelector('[data-safety-status]')?.textContent).toContain("Backup required");
    root.querySelector<HTMLButtonElement>('[data-safety-action="backup"]')?.click();

    expect(downloadedBundles).toHaveLength(1);
    expect(downloadedBundles[0].project).toEqual(keychronV5MaxProject);
    expect(downloadedBundles[0].createdAt).toBe(downloadedBundles[0].ledger.events.at(-1)?.occurredAt);
    expect(safetyLedgerStorage.load().events.at(-1)?.kind).toBe("backupCreated");
    expect(root.querySelector('[data-safety-status]')?.textContent).toContain("Backup recorded");
  });

  it("requires two confirmations before recording a backup decline", () => {
    const root = document.createElement("div");
    const safetyLedgerStorage = createSafetyLedgerStorage(createMemoryStorage());

    createApp(root, { safetyLedgerStorage });
    root.querySelector<HTMLButtonElement>('[data-diagnostics-action="open"]')?.click();

    const declineData = root.querySelector<HTMLInputElement>('[data-safety-confirmation="no-backup"]');
    const responsibility = root.querySelector<HTMLInputElement>(
      '[data-safety-confirmation="responsibility"]',
    );
    expect(declineData).not.toBeNull();
    expect(responsibility).not.toBeNull();

    declineData!.checked = true;
    declineData!.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-safety-action="decline"]')?.click();
    expect(safetyLedgerStorage.load().events).toHaveLength(0);

    responsibility!.checked = true;
    responsibility!.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-safety-action="decline"]')?.click();

    expect(safetyLedgerStorage.load().events.at(-1)?.kind).toBe("backupDeclined");
    expect(root.querySelector('[data-safety-status]')?.textContent).toContain("Backup declined");
    expect(root.querySelector('[data-safety-recovery-guidance]')).toBeNull();
  });

  it("requires a new backup when the edited project changes after a prior backup", () => {
    const root = document.createElement("div");
    const safetyLedgerStorage = createSafetyLedgerStorage(createMemoryStorage());

    createApp(root, { safetyLedgerStorage, downloadRecoveryBundle: () => undefined });
    root.querySelector<HTMLButtonElement>('[data-diagnostics-action="open"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-safety-action="backup"]')?.click();

    root.querySelector<HTMLButtonElement>('[data-diagnostics-action="close"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-key="v5_001"]')?.click();
    const keycode = root.querySelector<HTMLInputElement>('[data-focus-id="selected-keycode"]');
    keycode!.value = "KC_F13";
    keycode!.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>('[data-diagnostics-action="open"]')?.click();

    expect(root.querySelector('[data-safety-status]')?.textContent).toContain("Backup required");
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function readQmkPreview(root: HTMLElement): {
  keyboard: string;
  layout: string;
  layers: string[][];
} {
  const text = root.querySelector("pre")?.textContent;
  expect(text).toBeTruthy();
  return JSON.parse(text ?? "{}") as { keyboard: string; layout: string; layers: string[][] };
}

function readDefinition(root: HTMLElement, term: string): string | undefined {
  const row = [...root.querySelectorAll("dl > div")].find(
    (candidate) => candidate.querySelector("dt")?.textContent === term,
  );
  return row?.querySelector("dd")?.textContent ?? undefined;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

async function flushDoctorLoad(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function doctorReportWithQmk(path: string | null): DoctorReport {
  return {
    findings: [],
    snapshot: {
      commands: [{ name: "qmk", path, requiredFor: "localBuild" }],
      hardwareProbe: {
        status: "skipped",
        reason: "test",
        devices: [],
        detectedKeyboards: [],
      },
    },
  };
}
