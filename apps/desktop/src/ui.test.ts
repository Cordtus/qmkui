// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserKeyboardSelection,
  BrowserKeyboardSession,
} from "./devices/browserKeyboardDiscovery";
import type { KeychronV5MaxReadSnapshot } from "./devices/keychronV5MaxReader";
import type { GenericViaStandardState } from "./devices/genericViaReader";
import { hexToHsv } from "./color";
import exampleProject from "../../../fixtures/projects/example-60.json";
import { createApp } from "./ui";
import { createSafetyLedgerStorage } from "./safetyStorage";

afterEach(() => {
  document.body.replaceChildren();
});

describe("device-first hardware workspace", () => {
  it("starts neutral without a model, preset, or editable workspace", () => {
    const root = document.createElement("div");

    createApp(root);

    expect(root.querySelector("[data-connection-screen]")).not.toBeNull();
    expect(root.querySelector("[data-keyboard-workspace]")).toBeNull();
    expect(root.querySelector("[data-keyboard-canvas]")).toBeNull();
    expect(root.querySelector("[data-project-action]")).toBeNull();
    expect(root.textContent).not.toContain("Keychron V5 Max ANSI Knob");
    expect(root.textContent).not.toContain("preset");
  });

  it("auto-reads and shows model identity immediately after browser authorization", async () => {
    const root = document.createElement("div");
    const selection = recognizedSelection(async () => availableSnapshot());

    createApp(root, {
      discoverBrowserKeyboard: async () => ({ state: "no-authorized-device" }),
      chooseBrowserKeyboard: async () => selection,
    });
    await flush();

    expect(root.querySelector('[data-device-action="read"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-device-action="connect"]')?.click();
    await flush();

    expect(root.querySelector("[data-hardware-snapshot]")).not.toBeNull();
    expect(root.querySelector("[data-keyboard-workspace]")).toBeNull();
    expect(root.querySelector('[data-device-action="write"]')).toBeNull();
    expect(root.querySelector('[data-device-action="flash"]')).toBeNull();
  });

  it("records a recovery backup and downloads the matching audit receipt", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
      safetyLedgerStorage: workingSafetyStorage(),
    });
    await flush();

    expect(root.querySelector("[data-safety-panel]")?.getAttribute("data-safety-state")).toBe(
      "backupRequired",
    );

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:qmkui");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    root.querySelector<HTMLElement>("[data-recovery-download]")?.click();
    await flush();

    expect(root.querySelector("[data-safety-panel]")?.getAttribute("data-safety-state")).toBe(
      "backupRecorded",
    );
    expect(root.textContent).toContain("Recovery bundle downloaded");
    const bundle = createUrl.mock.calls[0]?.[0] as Blob;
    expect(JSON.parse(await bundle.text()).format).toBe("qmkui.recovery-bundle");

    // A recorded bundle can be downloaded again without duplicating the event.
    root.querySelector<HTMLElement>("[data-recovery-download]")?.click();
    await flush();
    expect(createUrl).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain("downloaded again");

    root.querySelector<HTMLElement>("[data-safety-audit]")?.click();
    await flush();
    expect(createUrl).toHaveBeenCalledTimes(3);
    const audit = createUrl.mock.calls[2]?.[0] as Blob;
    expect(JSON.parse(await audit.text()).format).toBe("qmkui.safety-audit");

    click.mockRestore();
    createUrl.mockRestore();
    revoke.mockRestore();
  });

  it("records an explicit recovery decline", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
      safetyLedgerStorage: workingSafetyStorage(),
    });
    await flush();

    root.querySelector<HTMLElement>("[data-recovery-decline]")?.click();
    await flush();

    expect(root.querySelector("[data-safety-panel]")?.getAttribute("data-safety-state")).toBe(
      "declined",
    );
    expect(root.querySelector("[data-recovery-download]")).toBeNull();
    expect(root.querySelector("[data-safety-audit]")).not.toBeNull();
  });

  it("opens the board picker from the keyboard chip and closes it", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    expect(root.querySelector("[data-board-picker]")?.hasAttribute("hidden")).toBe(true);

    root.querySelector<HTMLElement>("[data-board-picker-open]")?.click();
    await flush();
    expect(root.querySelector("[data-board-picker]")?.hasAttribute("hidden")).toBe(false);
    const search = root.querySelector<HTMLInputElement>("[data-focus-id=catalog-search]")!;
    search.value = "example";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      root.querySelector<HTMLElement>('[data-catalog-keyboard="keychron/v5_max/ansi_encoder"]')?.hidden,
    ).toBe(true);
    expect(
      root.querySelector<HTMLElement>('[data-catalog-keyboard="example/keyboard"]')?.hidden,
    ).toBe(false);

    root.querySelector<HTMLElement>(
      '[data-catalog-keyboard="example/keyboard"] [data-catalog-action="select"]',
    )?.click();
    await flush();
    expect(root.querySelector("[data-board-picker]")?.hasAttribute("hidden")).toBe(true);
    expect(root.textContent).toContain("Example 60% Test Board");
  });

  it("cancels the keyboard picker and returns focus to its trigger", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    root.querySelector<HTMLElement>("[data-board-picker-open]")?.click();
    await flush();
    root.querySelector<HTMLElement>("[data-board-picker-cancel]")?.click();
    await flush();

    expect(root.querySelector("[data-board-picker]")?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(
      root.querySelector('[data-focus-id="board-picker-trigger"]'),
    );
  });

  it("opens the project drawer, focuses it, and restores the trigger", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    root.querySelector<HTMLElement>('[data-project-details-action="open"]')?.click();
    await flush();
    expect(root.querySelector("[data-project-details-drawer]")?.hasAttribute("hidden")).toBe(
      false,
    );

    const draft = root.querySelector<HTMLTextAreaElement>(
      '[data-focus-id="project-json-draft"]',
    )!;
    draft.focus();
    const originalDraft = draft.value;
    draft.value = "a";
    draft.dispatchEvent(new Event("input", { bubbles: true }));
    draft.value = "ab";
    draft.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.activeElement).toBe(draft);
    expect(draft.value).toBe("ab");

    root.querySelector<HTMLElement>('[data-project-action="refresh-draft"]')?.click();
    expect(draft.value).toBe(originalDraft);

    root.querySelector<HTMLElement>('[data-project-details-action="close"]')?.click();
    await flush();
    expect(document.activeElement).toBe(
      root.querySelector('[data-focus-id="project-details-trigger"]'),
    );
  });

  it("shows capability chips, a read-only lighting wheel, and a tester toggle", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    expect(
      root.querySelectorAll('[data-snapshot-field="capabilities"] .capability-chips .chip'),
    ).toHaveLength(4);
    expect(root.querySelector("[data-device-lighting-wheel]")).not.toBeNull();
    expect(root.querySelector("[data-test-capture]")).toBeNull();

    root.querySelector<HTMLElement>("[data-key-tester-toggle]")?.click();
    await flush();
    expect(root.querySelector("[data-test-capture]")).not.toBeNull();
    expect(
      root.querySelector("[data-key-tester-toggle]")?.getAttribute("aria-pressed"),
    ).toBe("true");

    root.querySelector<HTMLElement>("[data-key-tester-toggle]")?.click();
    await flush();
    expect(root.querySelector("[data-test-capture]")).toBeNull();
  });

  it("opens the command palette with Ctrl-K and runs a command", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    root.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );
    await flush();
    expect(root.querySelector("[data-command-palette]")?.hasAttribute("hidden")).toBe(false);

    const firmware = [...root.querySelectorAll<HTMLElement>("[data-command]")].find(
      (row) => row.textContent?.includes("Go to Firmware"),
    );
    firmware?.click();
    await flush();
    expect(root.querySelector("[data-command-palette]")?.hasAttribute("hidden")).toBe(true);
    expect(root.querySelector('[data-view="firmware"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("filters the command palette and runs the active row with Enter", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>("[data-command-palette-open]")?.click();
    await flush();

    const input = root.querySelector<HTMLInputElement>("[data-focus-id=command-search]")!;
    input.value = "firmware";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = [...root.querySelectorAll<HTMLElement>("[data-command]")].filter(
      (row) => !row.hidden,
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toContain("Go to Firmware");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(root.querySelector('[data-view="firmware"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("offers the connected-keyboard switch from the overflow menu", async () => {
    const chooseBrowserKeyboard = vi.fn(async () => recognizedSelection(async () => availableSnapshot()));
    const root = document.createElement("div");
    createApp(root, { discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()), chooseBrowserKeyboard });
    await flush();

    root.querySelector<HTMLElement>("[data-device-switch]")?.click();
    await flush();
    expect(chooseBrowserKeyboard).toHaveBeenCalled();
  });

  it("auto-reads a snapshot on selection and renders reported fields", async () => {
    const root = document.createElement("div");
    const readSnapshot = vi.fn(async () => availableSnapshot());

    createApp(root, { discoverBrowserKeyboard: async () => recognizedSelection(readSnapshot) });
    await flush();

    expect(readSnapshot).toHaveBeenCalledOnce();
    expect(root.querySelector("[data-hardware-snapshot]")?.getAttribute("data-source")).toBe("hardware");
    expect(root.textContent).toContain("1.2.3");
    expect(root.querySelector("[data-hardware-keymap]")).not.toBeNull();
    expect(root.querySelector('[data-hardware-key="0:0"]')?.textContent).toContain("A");
    expect(root.querySelector('[data-hardware-key="0:2"]')?.textContent).toContain("B");
    expect(root.querySelector("[data-hardware-snapshot]")?.textContent).not.toContain("KC_ESC");
    expect(root.querySelector("[data-lighting-swatches]")).not.toBeNull();
    expect(root.querySelector("[data-lighting-swatches] [data-hue]")?.getAttribute("data-hue")).toBe("12");
    expect(root.querySelector("[data-lighting-swatches] [data-hue]")?.getAttribute("data-saturation")).toBe("34");
    expect(root.querySelector("[data-lighting-swatches] [data-hue]")?.getAttribute("data-value")).toBe("56");
    expect(root.querySelector("[data-keyboard-workspace]")).toBeNull();
  });

  it("shows one navigation once a device is selected, opening on the device surface", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    for (const view of ["keymap", "device", "firmware"]) {
      expect(root.querySelector(`[data-view="${view}"]`)).not.toBeNull();
    }
    expect(root.querySelector('[data-view="lighting"]')).toBeNull();
    expect(root.querySelector('[data-view="catalog"]')).toBeNull();
    expect(root.querySelector('[data-view="system"]')).toBeNull();
    expect(root.querySelector("[data-board-picker]")).not.toBeNull();
    expect(root.querySelector('[data-view="device"]')?.getAttribute("aria-current")).toBe("page");
    expect(root.querySelector("[data-device-save-lighting]")).not.toBeNull();
    expect(root.querySelector("[data-hardware-snapshot]")).not.toBeNull();

    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();
    expect(root.querySelector("[data-keyboard-workspace]")).not.toBeNull();
    expect(root.querySelector("[data-hardware-snapshot]")).toBeNull();
  });

  it("shows the selected key's role on every layer and flags Print/SysRq", async () => {
    const root = document.createElement("div");
    const snapshot = availableSnapshot();
    snapshot.keymap = {
      state: "available",
      value: { layerCount: 2, keycodes: [[[0x0004, 0, 0]], [[0x0046, 0, 0]]] },
    };
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => snapshot),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    expect(root.querySelector('[data-hardware-key-roles="0:0"]')).not.toBeNull();
    const roles = root.querySelectorAll("[data-hardware-key-role]");
    expect(roles).toHaveLength(2);
    expect(roles[0]?.textContent).toContain("Layer 0");
    expect(roles[0]?.textContent).toContain("A");
    expect(roles[1]?.textContent).toContain("Layer 1");
    expect(roles[1]?.textContent).toContain("Print");
    expect(roles[1]?.textContent).toContain("0x0046");
    expect(roles[1]?.textContent).toContain("SysRq");
  });

  it("selects a key on the board and updates its roles", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    root.querySelector<HTMLElement>('[data-hardware-key="0:2"]')?.click();
    await flush();

    expect(root.querySelector('[data-hardware-key-roles="0:2"]')).not.toBeNull();
    expect(root.querySelector('[data-hardware-key="0:2"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("reports when no key maps to Print/SysRq on any layer", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    expect(root.textContent).toContain("No key maps to Print/SysRq on any layer.");
  });

  it("reports a board-level Print/SysRq summary when a key is mapped", async () => {
    const root = document.createElement("div");
    const snapshot = availableSnapshot();
    snapshot.keymap = {
      state: "available",
      value: { layerCount: 1, keycodes: [[[0x0046, 0, 0]]] },
    };
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => snapshot),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    expect(root.querySelector(".hardware-sysrq-summary")?.textContent).toContain(
      "Print/SysRq is mapped",
    );
  });

  it("ignores a snapshot that resolves after another keyboard selection starts", async () => {
    const root = document.createElement("div");
    const pendingSnapshot = deferred<KeychronV5MaxReadSnapshot>();
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(() => pendingSnapshot.promise),
      chooseBrowserKeyboard: async () => ({ state: "no-selection" }),
    });
    await flush();

    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    root.querySelector<HTMLElement>('[data-device-action="connect"]')?.click();
    await flush();
    pendingSnapshot.resolve(availableSnapshot());
    await flush();

    expect(root.querySelector("[data-hardware-snapshot]")).toBeNull();
    expect(root.querySelector("[data-connection-screen]")).not.toBeNull();
  });

  it("refreshes by reading again without applying a default, reset, write, or flash action", async () => {
    const root = document.createElement("div");
    const readSnapshot = vi.fn(async () => availableSnapshot());

    createApp(root, { discoverBrowserKeyboard: async () => recognizedSelection(readSnapshot) });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="refresh"]')?.click();
    await flush();

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    ["default", "reset", "stage", "write", "flash"].forEach((action) => {
      expect(root.querySelector(`[data-device-action="${action}"]`)).toBeNull();
    });
  });

  it("keeps unavailable and unverified configuration reasons visible without substituting defaults", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => unavailableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    expect(root.querySelector('[data-snapshot-field="keymap"]')?.getAttribute("data-snapshot-state")).toBe("unavailable");
    expect(root.textContent).toContain("No verified V5 Max matrix dimensions were supplied.");
    expect(root.querySelector('[data-snapshot-field="lighting"]')?.getAttribute("data-snapshot-state")).toBe("unverified");
    expect(root.textContent).toContain("RGB state could not be verified.");
    expect(root.querySelector("[data-hardware-snapshot]")?.textContent).not.toContain("Win Base");
    expect(root.querySelector("[data-keyboard-workspace]")).toBeNull();
    expect(root.querySelector("[data-write-blocked]")).not.toBeNull();
    expect(root.querySelector("[data-device-write-enable]")).toBeNull();
  });

  it("leaves the connection screen visible when the explicit read fails", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => Promise.reject(new Error("timeout"))),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    expect(root.querySelector("[data-connection-screen]")).not.toBeNull();
    expect(root.querySelector("[data-hardware-snapshot]")).toBeNull();
    expect(root.querySelector("[data-device-state]")?.textContent).toContain("Device read failed");
  });

  it("requires generic VIA protocol verification before rendering only standard state without a model baseline", async () => {
    const root = document.createElement("div");
    const readStandardState = vi.fn(async () => genericViaSnapshot());
    createApp(root, { discoverBrowserKeyboard: async () => genericViaSelection(readStandardState) });
    await flush();

    expect(root.querySelector('[data-device-action="verify-protocol"]')).not.toBeNull();
    expect(root.querySelector('[data-device-action="read"]')).toBeNull();
    expect(root.querySelector("[data-connection-screen]")?.textContent).not.toContain("Keychron V5 Max");

    root.querySelector<HTMLElement>('[data-device-action="verify-protocol"]')?.click();
    await flush();
    expect(root.querySelector('[data-device-action="read"]')).not.toBeNull();

    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    expect(readStandardState).toHaveBeenCalledOnce();
    expect(root.querySelector("[data-hardware-keymap]")).toBeNull();
  });

  it("renders each generic standard field when neighboring keyboard or lighting reads are unavailable", async () => {
    const root = document.createElement("div");
    const snapshot = genericViaSnapshot();
    snapshot.uptime = { state: "unavailable", reason: "Uptime read failed: timeout." };
    snapshot.firmwareVersion = { state: "available", value: 9 };
    snapshot.lighting.rgbMatrixEffect = { state: "unavailable", reason: "RGB matrix effect read failed: timeout." };
    snapshot.lighting.rgbMatrixHue = { state: "available", value: 44 };

    createApp(root, { discoverBrowserKeyboard: async () => genericViaSelection(async () => snapshot) });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="verify-protocol"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    expect(root.querySelector('[data-snapshot-field="uptime"]')?.textContent).toContain("Uptime read failed: timeout.");
    expect(root.querySelector('[data-snapshot-field="firmware-version"]')?.textContent).toContain("9");
    expect(root.querySelector('[data-snapshot-field="rgb-matrix-effect"]')?.textContent).toContain("RGB matrix effect read failed: timeout.");
    expect(root.querySelector('[data-snapshot-field="rgb-matrix-hue"]')?.textContent).toContain("44");
  });
});

function recognizedSelection(
  readSnapshot: BrowserKeyboardSession["readSnapshot"],
): Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "via" } }> {
  return {
    state: "selected",
    identity: {
      vendorId: 0x3434,
      productId: 0x0950,
      collections: [{ usagePage: 0xff60, usage: 0x0061 }],
    },
    contract: {
      state: "via",
      capabilities: { protocolVersion: true, read: false, write: false, flash: false },
    },
    session: {
      capabilities: { canRead: true, canWrite: false, canFlash: false },
      verifyProtocolVersion: async () => ({ version: 0x000c }),
      readSnapshot,
    },
  };
}

function availableSnapshot(): KeychronV5MaxReadSnapshot {
  return {
    identity: {
      state: "available",
      value: {
        model: "Keychron V5 Max ANSI Knob",
        protocolVersion: [0, 0, 12],
        firmwareVersion: "1.2.3",
        defaultLayer: 2,
      },
    },
    capabilities: { state: "available", value: { featureBitmap: [0x12, 0x34] } },
    keymap: { state: "available", value: { layerCount: 1, keycodes: [[[4, 0, 5]]] } },
    lighting: {
      state: "available",
      value: { brightness: 56, effect: 7, effectSpeed: 8, hue: 12, saturation: 34 },
    },
    macros: {
      state: "available",
      value: { count: 1, bufferSize: 8, macros: [[{ kind: "char", char: "h" }, { kind: "char", char: "i" }]] },
    },
    readAt: "2026-07-18T00:00:00.000Z",
  };
}

function unavailableSnapshot(): KeychronV5MaxReadSnapshot {
  return {
    identity: { state: "unavailable", reason: "Identity response timed out." },
    capabilities: { state: "unverified", reason: "Feature response was malformed." },
    keymap: { state: "unavailable", reason: "No verified V5 Max matrix dimensions were supplied." },
    lighting: { state: "unverified", reason: "RGB state could not be verified." },
    macros: { state: "unavailable", reason: "Macro read failed: timeout." },
    readAt: "2026-07-18T00:00:00.000Z",
  };
}

function genericViaSelection(
  readStandardState: () => Promise<GenericViaStandardState>,
): Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "unverified-via" } }> {
  let verified = false;
  return {
    state: "selected",
    identity: { vendorId: 0xfeed, productId: 0xbeef, collections: [{ usagePage: 0xff60, usage: 0x0061 }] },
    contract: { state: "unverified-via" },
    viaSession: {
      get capabilities() {
        return { canRead: verified, canWrite: false as const, canFlash: false as const };
      },
      verifyProtocolVersion: async () => {
        verified = true;
        return { version: 0x000c };
      },
      readStandardState,
    },
  };
}

function genericViaSnapshot(): GenericViaStandardState {
  const unavailable = (reason: string) => ({ state: "unavailable" as const, reason });
  return {
    identity: { state: "unverified", reason: "No verified keyboard definition is available for this VIA device." },
    protocolVersion: { state: "available", value: 0x000c },
    uptime: { state: "available", value: 42 },
    layoutOptions: unavailable("Layout options read failed: timeout."),
    firmwareVersion: unavailable("Firmware version read failed: timeout."),
    keycodesVersion: unavailable("Keycodes version read failed: timeout."),
    layerCount: unavailable("Layer count read failed: timeout."),
    keymap: { state: "unverified", reason: "No verified matrix dimensions are available for this VIA device." },
    switchMatrix: { state: "unverified", reason: "No verified matrix dimensions are available for this VIA device." },
    lighting: {
      backlightBrightness: unavailable("Backlight brightness read failed: timeout."),
      backlightEffect: unavailable("Backlight effect read failed: timeout."),
      rgblightBrightness: unavailable("RGB light brightness read failed: timeout."),
      rgblightEffect: unavailable("RGB light effect read failed: timeout."),
      rgblightEffectSpeed: unavailable("RGB light effect speed read failed: timeout."),
      rgblightHue: unavailable("RGB light hue read failed: timeout."),
      rgblightSaturation: unavailable("RGB light saturation read failed: timeout."),
      rgbMatrixBrightness: unavailable("RGB matrix brightness read failed: timeout."),
      rgbMatrixEffect: { state: "available", value: 7 },
      rgbMatrixEffectSpeed: unavailable("RGB matrix effect speed read failed: timeout."),
      rgbMatrixHue: unavailable("RGB matrix hue read failed: timeout."),
      rgbMatrixSaturation: unavailable("RGB matrix saturation read failed: timeout."),
      ledMatrixBrightness: unavailable("LED matrix brightness read failed: timeout."),
      ledMatrixEffect: unavailable("LED matrix effect read failed: timeout."),
      ledMatrixEffectSpeed: unavailable("LED matrix effect speed read failed: timeout."),
    },
    readAt: "2026-07-24T00:00:00.000Z",
  };
}

function workingSafetyStorage() {
  const values = new Map<string, string>();
  return createSafetyLedgerStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

  it("moves key selection with arrow keys on the board", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    const keys = [...root.querySelectorAll<HTMLElement>("[data-key]")];
    expect(keys.length).toBeGreaterThan(1);
    keys[0]?.focus();
    const before = root
      .querySelector('[data-key][aria-pressed="true"]')
      ?.getAttribute("data-key");

    keys[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await flush();

    const after = root
      .querySelector('[data-key][aria-pressed="true"]')
      ?.getAttribute("data-key");
    expect(after).not.toBe(before);
    expect(after).toBeTruthy();
  });

  it("adds a macro from the editor and blocks JSON export for C macros", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-project-details-action="open"]')?.click();
    await flush();

    const nameInput = root.querySelector<HTMLInputElement>('[data-focus-id="macro-name"]');
    const actionsInput = root.querySelector<HTMLInputElement>('[data-focus-id="macro-actions"]');
    expect(nameInput).not.toBeNull();
    nameInput!.value = "F12";
    actionsInput!.value = "TAP KC_F12";
    root.querySelector<HTMLElement>('[data-macro-add]')?.click();
    await flush();

    expect(root.querySelector("[data-macro]")?.textContent).toContain("F12");
    expect(root.querySelector("[data-macro]")?.textContent).toContain("export: json");

    actionsInput!.value = "UNICODE 0x1F600";
    root.querySelector<HTMLElement>('[data-macro-add]')?.click();
    await flush();
    const cMacro = [...root.querySelectorAll("[data-macro]")].at(-1);
    expect(cMacro?.textContent).toContain("export: c");

    const download = root.querySelector<HTMLElement>('[data-qmk-action="download"]');
    expect(download?.hasAttribute("disabled")).toBe(true);
  });

  it("exports the bundled VIA definition for a catalog keyboard", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>("[data-board-picker-open]")?.click();
    await flush();

    const viaButton = root.querySelector<HTMLElement>(
      '[data-catalog-keyboard="keychron/v5_max/ansi_encoder"] [data-via-definition-download]',
    );
    expect(viaButton).not.toBeNull();
    viaButton?.click();
    await flush();

    expect(root.textContent).toContain("VIA definition exported for keychron/v5_max/ansi_encoder");
  });

  it("undoes a lighting mode change from the keymap rail", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Lighting is no longer its own destination; its controls live in the
    // keymap. The board and the lighting mode are on screen together.
    expect(root.querySelector("[data-keyboard-workspace]")).not.toBeNull();
    expect(root.querySelector('[data-settings-group="lighting"]')).not.toBeNull();

    const activeMode = () =>
      root
        .querySelector('[data-lighting-mode][aria-pressed="true"]')
        ?.getAttribute("data-lighting-mode");
    expect(activeMode()).toBe("reactive");
    root.querySelector<HTMLElement>('[data-lighting-mode="static"]')?.click();
    await flush();
    expect(activeMode()).toBe("static");
    root.querySelector<HTMLElement>("[data-editor-undo]")?.click();
    await flush();
    expect(activeMode()).toBe("reactive");
  });

  it("resyncs the key map with the board's current lighting", async () => {
    const root = document.createElement("div");
    const selection = recognizedSelection(async () => availableSnapshot());
    let reads = 0;
    selection.session.readLighting = async () => {
      reads += 1;
      return {
        state: "available",
        value: { brightness: 255, effect: 1, effectSpeed: 127, hue: 170, saturation: 255 },
      };
    };

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Entering the keymap resyncs the lighting without re-reading the keymap.
    expect(reads).toBe(1);
    const key = root.querySelector<HTMLElement>("[data-key]")!;
    expect(key.getAttribute("data-lighting-brightness")).toBe("255");
    expect(key.getAttribute("data-lighting-source")).toBe("device");
    expect(key.getAttribute("data-lighting-color")).toBe("#0000ff");

    root.querySelector<HTMLElement>("[data-lighting-refresh]")?.click();
    await flush();
    expect(reads).toBe(2);
  });

  it("does not start a lighting resync when there is no snapshot to update", async () => {
    const root = document.createElement("div");
    const selection = recognizedSelection(async () => Promise.reject(new Error("timeout")));
    const readLighting = vi.fn(async () => ({
      state: "available" as const,
      value: { brightness: 1, effect: 1, effectSpeed: 1, hue: 1, saturation: 1 },
    }));
    selection.session.readLighting = readLighting;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    expect(readLighting).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain("Reading lighting");
  });

  it("renders one key inspector, one lighting group and one board readout", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    expect(root.querySelectorAll('[data-settings-group="lighting"]')).toHaveLength(1);
    expect(
      root.querySelector('[data-context-detail="board-lighting"]')?.hasAttribute("open"),
    ).toBe(false);
    expect(root.querySelectorAll("[data-board-lighting]")).toHaveLength(1);
    expect(root.querySelectorAll("[data-key-info-panel]")).toHaveLength(0);

    root.querySelector<HTMLElement>('[data-keymap-tab="key"]')?.click();
    await flush();
    expect(root.querySelectorAll("[data-key-info-panel]")).toHaveLength(1);
    expect(root.querySelectorAll('[data-settings-group="key"]')).toHaveLength(1);
    expect(root.querySelector(".key-focus")?.textContent).toContain("Esc");
    expect(root.querySelector(".key-focus")?.textContent).toContain("Row 0");
    expect(root.querySelectorAll("[data-device-write-controls].compact")).toHaveLength(1);

    root.querySelector<HTMLElement>('[data-keymap-tab="layer"]')?.click();
    await flush();
    expect(root.querySelectorAll("[data-layer-tools]")).toHaveLength(1);
    expect(root.querySelectorAll('[data-settings-group="layer"]')).toHaveLength(1);

    root.querySelector<HTMLElement>('[data-keymap-tab="lighting"]')?.click();
    await flush();
    expect(root.querySelectorAll('[data-settings-group="lighting"]')).toHaveLength(1);

    root.querySelector<HTMLElement>('[data-view="device"]')?.click();
    await flush();
    expect(root.querySelectorAll("[data-hardware-snapshot]")).toHaveLength(1);
  });

  it("paints keys and manages firmware lighting rules", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    root.querySelector<HTMLElement>("[data-key=v5_000]")?.click();
    await flush();
    root.querySelector<HTMLElement>("[data-lighting-paint]")?.click();
    await flush();
    expect(root.querySelector("[data-lighting-paint]")?.getAttribute("aria-pressed")).toBe("true");

    root.querySelector<HTMLElement>("[data-key=v5_001]")?.click();
    await flush();
    const painted = root.querySelector<HTMLElement>("[data-key=v5_001]");
    expect(painted?.getAttribute("data-lighting-source")).toBe("override");
    expect(painted?.querySelector(".key-override-dot")).not.toBeNull();

    root.querySelector<HTMLElement>("[data-lighting-rule-add]")?.click();
    await flush();
    const rules = root.querySelectorAll("[data-lighting-rule]");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.textContent).toContain("Caps Lock on");
    expect(
      root.querySelectorAll("[data-key=v5_001] [data-key-rule-badge]"),
    ).toHaveLength(1);

    // Rules participate in the shared undo history.
    root.querySelector<HTMLElement>("[data-editor-undo]")?.click();
    await flush();
    expect(root.querySelectorAll("[data-lighting-rule]")).toHaveLength(0);

    root.querySelector<HTMLElement>("[data-lighting-rule-add]")?.click();
    await flush();
    expect(root.querySelectorAll("[data-lighting-rule]")).toHaveLength(1);

    root.querySelector<HTMLElement>("[data-lighting-rule-remove]")?.click();
    await flush();
    expect(root.querySelectorAll("[data-lighting-rule]")).toHaveLength(0);
    expect(
      root.querySelectorAll("[data-key=v5_001] [data-key-rule-badge]"),
    ).toHaveLength(0);
  }, 20_000);

  it("turns paint mode off when another keyboard is loaded", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();
    root.querySelector<HTMLElement>("[data-lighting-paint]")?.click();
    await flush();
    expect(root.querySelector("[data-lighting-paint]")?.getAttribute("aria-pressed")).toBe("true");

    root.querySelector<HTMLElement>("[data-board-picker-open]")?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-catalog-keyboard="example/keyboard"] [data-catalog-action="select"]')?.click();
    await flush();

    expect(root.querySelector("[data-lighting-paint]")?.getAttribute("aria-pressed")).toBe("false");
  }, 20_000);

  it("colours every selected key and undoes the whole selection in one step", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    root.querySelector<HTMLElement>("[data-lighting-select-all]")?.click();
    await flush();
    const keys = [...root.querySelectorAll<HTMLElement>("[data-key]")];
    expect(keys.length).toBeGreaterThan(1);

    // Exactly one colour picker exists, in the keymap rail's lighting group.
    const pickers = root.querySelectorAll("[data-color-hex]");
    expect(pickers).toHaveLength(1);

    // Commit a red selection: every key carries it (unlit keys keep no tint).
    const hex = pickers[0] as HTMLInputElement;
    hex.value = "#ff0000";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(
      root.querySelectorAll('[data-key][data-lighting-color="#ff0000"]').length,
    ).toBe(keys.length);

    root.querySelector<HTMLElement>("[data-editor-undo]")?.click();
    await flush();
    expect(
      root.querySelectorAll('[data-key][data-lighting-color="#ff0000"]').length,
    ).toBe(0);
  });

  it("writes the board colour, not the selected key's per-key colour", async () => {
    const root = document.createElement("div");
    const writeRgbMatrix = vi.fn(
      async (_state: {
        brightness: number;
        effectSpeed: number;
        hue: number;
        saturation: number;
        effect?: number;
      }) => {},
    );
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});
    (selection.session as { writeRgbMatrix: unknown }).writeRgbMatrix = writeRgbMatrix;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Paint a key red, then write board lighting.
    root.querySelector<HTMLElement>("[data-key=v5_000]")?.click();
    await flush();
    const hex = root.querySelector<HTMLInputElement>("[data-color-hex]")!;
    hex.value = "#ff00ff";
    hex.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-lighting]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(writeRgbMatrix).toHaveBeenCalledOnce();
    const payload = writeRgbMatrix.mock.calls[0]![0];
    // Unchanged board channels are written straight back (hue 12 / sat 34),
    // so an untouched write is a no-op — magenta is never used.
    expect(payload.hue).toBe(12);
    expect(payload.saturation).toBe(34);
  }, 20_000);

  it("writes an explicit board colour independently of key colours", async () => {
    const root = document.createElement("div");
    const writeRgbMatrix = vi.fn(
      async (_state: {
        brightness: number;
        effectSpeed: number;
        hue: number;
        saturation: number;
        effect?: number;
      }) => {},
    );
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});
    (selection.session as { writeRgbMatrix: unknown }).writeRgbMatrix = writeRgbMatrix;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    const boardColor = root.querySelector<HTMLInputElement>("[data-lighting-board-color]")!;
    boardColor.value = "#ff8800";
    boardColor.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-lighting]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    const payload = writeRgbMatrix.mock.calls[0]![0];
    const hsv = hexToHsv("#ff8800");
    expect(payload.hue).toBe(Math.round((hsv.h / 360) * 255));
    expect(payload.saturation).toBe(Math.round(hsv.s * 255));
  }, 20_000);

  it("refuses a firmware download when the project has validation errors", async () => {
    const root = document.createElement("div");
    const selection = recognizedSelection(async () => availableSnapshot());
    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    root.querySelector<HTMLElement>('[data-project-details-action="open"]')?.click();
    await flush();
    const project = structuredClone(exampleProject);
    project.layers[0]!.assignments[0]!.qmk = "";
    const draft = root.querySelector<HTMLTextAreaElement>(
      '[data-focus-id="project-json-draft"]',
    )!;
    draft.value = JSON.stringify(project);
    draft.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLElement>('[data-project-action="import"]')?.click();
    await flush();

    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();
    expect(root.querySelector("[data-firmware-bundle]")).not.toBeNull();
    root.querySelector<HTMLElement>("[data-firmware-bundle]")?.click();
    await flush();

    expect(root.textContent).toContain(
      "Fix keymap and lighting rule errors before exporting firmware.",
    );
  });

  it("shows a refused device write next to the write controls", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    // No confirmation ticked: the refusal must be visible, not drawer-only.
    root.querySelector<HTMLElement>("[data-device-write-key]")?.click();
    await flush();
    expect(root.querySelector("[data-write-status]")?.textContent).toContain(
      "enable device writes first",
    );
  });

  it("writes a keycode to the device behind confirmation", async () => {
    const root = document.createElement("div");
    const writeKeycode = vi.fn(async () => {});
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = writeKeycode;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    // Writes are gated: without confirmation nothing is sent.
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    root.querySelector<HTMLElement>("[data-device-write-key]")?.click();
    await flush();
    expect(writeKeycode).not.toHaveBeenCalled();
    expect(root.textContent).toContain("enable device writes first.");

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    expect(root.textContent).toContain("Device writes enabled");

    root.querySelector<HTMLElement>('[data-hardware-key="0:0"]')?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    const input = root.querySelector<HTMLInputElement>("[data-write-keycode]")!;
    input.value = "zz";
    root.querySelector<HTMLElement>("[data-device-write-key]")?.click();
    await flush();
    expect(writeKeycode).not.toHaveBeenCalled();

    const validInput = root.querySelector<HTMLInputElement>("[data-write-keycode]")!;
    validInput.value = "0046";
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-key]")?.click();
    await flush();

    expect(writeKeycode).toHaveBeenCalledWith(0, 0, 0, 0x0046);
  });

  it("writes the whole project keymap to the device from the editor", async () => {
    const root = document.createElement("div");
    const writeKeycode = vi.fn(async () => {});
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = writeKeycode;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Without confirmation the whole-keymap write is refused.
    root.querySelector<HTMLElement>("[data-write-keymap]")?.click();
    await flush();
    expect(writeKeycode).not.toHaveBeenCalled();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-keymap]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(writeKeycode).toHaveBeenCalled();
    expect(root.textContent).toContain("Wrote");
  });

  it("writes RGB-matrix lighting to the device behind confirmation", async () => {
    const root = document.createElement("div");
    const writeRgbMatrix = vi.fn(
      async (_state: {
        brightness: number;
        effectSpeed: number;
        hue: number;
        saturation: number;
        effect?: number;
      }) => {},
    );
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});
    (selection.session as { saveLighting: unknown }).saveLighting = vi.fn(async () => {});
    (selection.session as { writeRgbMatrix: unknown }).writeRgbMatrix = writeRgbMatrix;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Without confirmation the lighting write is refused.
    root.querySelector<HTMLElement>("[data-write-lighting]")?.click();
    await flush();
    expect(writeRgbMatrix).not.toHaveBeenCalled();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-lighting]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(writeRgbMatrix).toHaveBeenCalledOnce();
    const payload = writeRgbMatrix.mock.calls[0]![0] as {
      brightness: number;
      effectSpeed: number;
      hue: number;
      saturation: number;
      effect?: number;
    };
    // The snapshot reports brightness 56 / effect 7; with no profile override,
    // the write preserves the board's own values.
    expect(payload.brightness).toBe(56);
    expect(payload.effectSpeed).toBe(8);
    expect(payload.effect).toBe(7);
    expect(payload.hue).toBeGreaterThanOrEqual(0);
    expect(payload.saturation).toBeGreaterThanOrEqual(0);
    expect(root.textContent).toContain("Wrote RGB-matrix lighting");
  });

  it("maps the profile's effect name to the board's firmware mode id", async () => {
    const root = document.createElement("div");
    const writeRgbMatrix = vi.fn(
      async (_state: {
        brightness: number;
        effectSpeed: number;
        hue: number;
        saturation: number;
        effect?: number;
      }) => {},
    );
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});
    (selection.session as { saveLighting: unknown }).saveLighting = vi.fn(async () => {});
    (selection.session as { writeRgbMatrix: unknown }).writeRgbMatrix = writeRgbMatrix;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Switch the RGB-matrix effect to "Breathing" (firmware mode 2), rendered
    // from the board's VIA definition.
    const effectSelect = root.querySelector<HTMLSelectElement>("[data-lighting-control='effect']")!;
    effectSelect.value = "2";
    effectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-lighting]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(writeRgbMatrix).toHaveBeenCalledOnce();
    const payload = writeRgbMatrix.mock.calls[0]![0] as { effect?: number };
    expect(payload.effect).toBe(2);
  });

  it("renders the board's full RGB-matrix effect list in the keymap rail", async () => {
    const root = document.createElement("div");
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    const options = [...root.querySelectorAll<HTMLOptionElement>(
      "[data-lighting-control='effect'] option",
    )];
    expect(options).toHaveLength(23);
    expect(options[0]!.textContent).toBe("None");
    expect(options[0]!.value).toBe("0");
    expect(options[22]!.textContent).toBe("Solid Splash");
    expect(options[22]!.value).toBe("22");
  });

  it("falls back to Solid when the stored effect is not a known mode", async () => {
    const root = document.createElement("div");
    const writeRgbMatrix = vi.fn(
      async (_state: {
        brightness: number;
        effectSpeed: number;
        hue: number;
        saturation: number;
        effect?: number;
      }) => {},
    );
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});
    (selection.session as { saveLighting: unknown }).saveLighting = vi.fn(async () => {});
    (selection.session as { writeRgbMatrix: unknown }).writeRgbMatrix = writeRgbMatrix;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Force a value the board does not declare as a mode.
    const effectSelect = root.querySelector<HTMLSelectElement>("[data-lighting-control='effect']")!;
    const unknown = document.createElement("option");
    unknown.value = "999";
    effectSelect.append(unknown);
    effectSelect.value = "999";
    effectSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-lighting]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(writeRgbMatrix).toHaveBeenCalledOnce();
    const payload = writeRgbMatrix.mock.calls[0]![0] as { effect?: number };
    // Solid (1), never None (0) — a write must not turn the lighting off.
    expect(payload.effect).toBe(1);
  });

  it("saves RGB-matrix lighting to EEPROM behind confirmation", async () => {
    const root = document.createElement("div");
    const saveLighting = vi.fn(async () => {});
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = vi.fn(async () => {});
    (selection.session as { saveLighting: unknown }).saveLighting = saveLighting;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-view="keymap"]')?.click();
    await flush();

    // Without confirmation the lighting save is refused.
    root.querySelector<HTMLElement>("[data-device-save-lighting]")?.click();
    await flush();
    expect(saveLighting).not.toHaveBeenCalled();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-save-lighting]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(saveLighting).toHaveBeenCalledOnce();
    expect(root.textContent).toContain("lighting saved to device EEPROM");
  });

  it("refuses a write when the connected device does not match the target", async () => {
    const root = document.createElement("div");
    const writeKeycode = vi.fn(async () => {});
    const saveLighting = vi.fn(async () => {});
    const writeRgbMatrix = vi.fn(async () => {});
    // An unrelated VIA board, not the project's V5 Max target.
    const selection = recognizedSelection(async () => availableSnapshot());
    selection.identity = {
      vendorId: 0x1234,
      productId: 0x5678,
      collections: [{ usagePage: 0xff60, usage: 0x0061 }],
    };
    (selection.session as { writeKeycode: unknown }).writeKeycode = writeKeycode;
    (selection.session as { saveLighting: unknown }).saveLighting = saveLighting;
    (selection.session as { writeRgbMatrix: unknown }).writeRgbMatrix = writeRgbMatrix;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    expect(root.textContent).toContain("Device writes enabled");

    root.querySelector<HTMLElement>('[data-hardware-key="0:0"]')?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    const input = root.querySelector<HTMLInputElement>("[data-write-keycode]")!;
    input.value = "0046";
    root.querySelector<HTMLElement>("[data-device-write-key]")?.click();
    await flush();

    expect(writeKeycode).not.toHaveBeenCalled();
    expect(root.textContent).toContain("does not match the project's target");
  });

  it("downloads a support bundle from the Firmware panel", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();

    const download = root.querySelector<HTMLElement>("[data-download-support-bundle]");
    expect(download).not.toBeNull();

    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:qmkui");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    download?.click();
    await flush();

    expect(createUrl).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0]?.[0] as Blob;
    const contents = JSON.parse(await blob.text());
    expect(contents.schemaVersion).toContain("support-bundle");
    expect(contents.macros).toBeDefined();

    click.mockRestore();
    createUrl.mockRestore();
    revoke.mockRestore();
  });

  it("disables the browser build button when no local runner is injected", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();
    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();
    expect(
      root.querySelector<HTMLButtonElement>("[data-build-run]")?.disabled,
    ).toBe(true);
  });

  it("runs a local build through the injected runner and shows the outcome", async () => {
    const root = document.createElement("div");
    const buildRunner = vi.fn(async () => ({
      ok: true,
      stdout: "compiled keymap",
      stderr: "",
      durationMs: 8,
    }));
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
      buildRunner,
    });
    await flush();

    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();

    root.querySelector<HTMLElement>("[data-build-run]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(buildRunner).toHaveBeenCalled();
    expect(root.querySelector("[data-build-status]")?.textContent).toContain("compiled keymap");
    expect(
      root.querySelector('[data-context-detail="build-log"]')?.hasAttribute("open"),
    ).toBe(true);
  });

  it("shows the Rust protocol gates in Firmware diagnostics", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
      doctorReportLoader: async () => ({
        snapshot: {
          commands: [],
          hardwareProbe: { status: "skipped", reason: "test" },
          protocol: {
            viaReadCommands: [1, 2, 4, 8],
            keychronReadCommands: [160, 161, 162, 163],
            viaWriteCommands: [5, 7, 9],
          },
        },
        findings: [],
      }),
    });
    await flush();

    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();
    expect(root.textContent).toContain("4 VIA reads · 4 Keychron reads · 3 writes");
  });

  it("shows one firmware step at a time and links verify back to the device", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();
    expect(root.querySelectorAll("[data-firmware-step-panel]")).toHaveLength(1);
    expect(root.querySelector('[data-firmware-step-panel="build"]')).not.toBeNull();

    root.querySelector<HTMLElement>('[data-firmware-step="flash"]')?.click();
    await flush();
    expect(root.querySelector('[data-firmware-step-panel="flash"]')).not.toBeNull();
    expect(root.querySelector("[data-flash-command]")?.textContent).toContain("--confirm");

    root.querySelector<HTMLElement>('[data-firmware-step="verify"]')?.click();
    await flush();
    expect(root.querySelector("[data-smoke-checklist]")).not.toBeNull();
    root.querySelector<HTMLElement>("[data-verify-tester]")?.click();
    await flush();
    expect(root.querySelector('[data-view="device"]')?.getAttribute("aria-current")).toBe("page");
  });

  it("blocks a flash dry run without an artifact or operator confirmation", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    root.querySelector<HTMLElement>('[data-view="firmware"]')?.click();
    await flush();

    root.querySelector<HTMLElement>('[data-firmware-step="flash"]')?.click();
    await flush();
    root.querySelector<HTMLElement>("[data-flash-dry-run]")?.click();
    await flush();

    expect(root.querySelector("[data-flash-status]")?.textContent).toContain("No build artifact");
  });
