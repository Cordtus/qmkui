// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserKeyboardSelection,
  BrowserKeyboardSession,
} from "./devices/browserKeyboardDiscovery";
import type { KeychronV5MaxReadSnapshot } from "./devices/keychronV5MaxReader";
import type { GenericViaStandardState } from "./devices/genericViaReader";
import { createApp } from "./ui";

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
    expect(root.querySelector("[data-lighting-swatches] [data-led='0']")?.getAttribute("data-hue")).toBe("12");
    expect(root.querySelector("[data-lighting-swatches] [data-led='0']")?.getAttribute("data-saturation")).toBe("34");
    expect(root.querySelector("[data-lighting-swatches] [data-led='0']")?.getAttribute("data-value")).toBe("56");
    expect(root.querySelector("[data-keyboard-workspace]")).toBeNull();
  });

  it("re-surfaces the app shell after a device is selected, with a Device/Project editor toggle", async () => {
    const root = document.createElement("div");
    createApp(root, {
      discoverBrowserKeyboard: async () => recognizedSelection(async () => availableSnapshot()),
    });
    await flush();

    expect(root.querySelector('[data-view="workspace"]')).not.toBeNull();
    expect(root.querySelector('[data-view="catalog"]')).not.toBeNull();
    expect(root.querySelector('[data-view="system"]')).not.toBeNull();
    expect(
      root.querySelector('[data-workspace-mode="device"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(root.querySelector("[data-keyboard-workspace]")).toBeNull();

    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    expect(root.querySelector("[data-hardware-snapshot]")).not.toBeNull();

    root.querySelector<HTMLElement>('[data-workspace-mode="editor"]')?.click();
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
): Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "partial" } }> {
  return {
    state: "selected",
    identity: {
      vendorId: 0x3434,
      productId: 0x0950,
      collections: [{ usagePage: 0xff60, usage: 0x0061 }],
    },
    contract: {
      state: "partial",
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
      value: {
        rgbProtocol: [1, 2],
        indicators: [1],
        ledCount: 1,
        ledIndices: [{ led: 0, matrix: { row: 0, column: 0 } }],
        effects: [{ led: 0, effect: 7 }],
        colors: [{ led: 0, hue: 12, saturation: 34, value: 56 }],
      },
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
      backlightEffect: unavailable("Backlight effect read failed: timeout."),
      backlightBrightness: unavailable("Backlight brightness read failed: timeout."),
      rgblightEffect: unavailable("RGB light effect read failed: timeout."),
      rgblightHue: unavailable("RGB light hue read failed: timeout."),
      rgblightSaturation: unavailable("RGB light saturation read failed: timeout."),
      rgblightValue: unavailable("RGB light value read failed: timeout."),
      rgbMatrixEffect: { state: "available", value: 7 },
      rgbMatrixHue: unavailable("RGB matrix hue read failed: timeout."),
      rgbMatrixSaturation: unavailable("RGB matrix saturation read failed: timeout."),
      rgbMatrixValue: unavailable("RGB matrix value read failed: timeout."),
      ledMatrixEffect: unavailable("LED matrix effect read failed: timeout."),
      ledMatrixBrightness: unavailable("LED matrix brightness read failed: timeout."),
    },
    readAt: "2026-07-24T00:00:00.000Z",
  };
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
    root.querySelector<HTMLElement>('[data-workspace-mode="editor"]')?.click();
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
    root.querySelector<HTMLElement>('[data-workspace-mode="editor"]')?.click();
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
    root.querySelector<HTMLElement>('[data-view="catalog"]')?.click();
    await flush();

    const viaButton = root.querySelector<HTMLElement>(
      '[data-catalog-keyboard="keychron/v5_max/ansi_encoder"] [data-via-definition-download]',
    );
    expect(viaButton).not.toBeNull();
    viaButton?.click();
    await flush();

    expect(root.textContent).toContain("VIA definition exported for keychron/v5_max/ansi_encoder");
  });

  it("writes a keycode to the device and saves EEPROM behind confirmation", async () => {
    const root = document.createElement("div");
    const writeKeycode = vi.fn(async () => {});
    const saveEeprom = vi.fn(async () => {});
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = writeKeycode;
    (selection.session as { saveEeprom: unknown }).saveEeprom = saveEeprom;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();

    // Writes are gated: without confirmation nothing is sent.
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    expect(root.textContent).toContain("Device writes enabled");

    root.querySelector<HTMLElement>('[data-hardware-key="0:0"]')?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    const input = root.querySelector<HTMLInputElement>("[data-write-keycode]");
    input!.value = "0046";
    root.querySelector<HTMLElement>("[data-device-write-key]")?.click();
    await flush();

    expect(writeKeycode).toHaveBeenCalledWith(0, 0, 0, 0x0046);

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-save-eeprom]")?.click();
    await flush();
    expect(saveEeprom).toHaveBeenCalledOnce();
  });

  it("writes the whole project keymap to the device from the editor", async () => {
    const root = document.createElement("div");
    const writeKeycode = vi.fn(async () => {});
    const saveEeprom = vi.fn(async () => {});
    const selection = recognizedSelection(async () => availableSnapshot());
    (selection.session as { writeKeycode: unknown }).writeKeycode = writeKeycode;
    (selection.session as { saveEeprom: unknown }).saveEeprom = saveEeprom;

    createApp(root, { discoverBrowserKeyboard: async () => selection });
    await flush();
    root.querySelector<HTMLElement>('[data-device-action="read"]')?.click();
    await flush();
    root.querySelector<HTMLElement>('[data-workspace-mode="editor"]')?.click();
    await flush();

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-write-enable]")?.click();
    await flush();
    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-write-keymap]")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flush();

    expect(writeKeycode).toHaveBeenCalled();
    expect(root.textContent).toContain("Wrote");

    root.querySelector<HTMLInputElement>("[data-write-confirm]")!.checked = true;
    root.querySelector<HTMLElement>("[data-device-save-eeprom]")?.click();
    await flush();
    expect(saveEeprom).toHaveBeenCalledOnce();
  });
