import type {
  BrowserKeyboardSelection,
  BrowserKeyboardSession,
} from "./browserKeyboardDiscovery";
import { available } from "./hardwareSnapshot";
import type { KeychronV5MaxReadSnapshot } from "./keychronV5MaxReader";

export function isNativeRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type NativeDeviceInfo = { vendorId: number; productId: number; productString?: string };

type NativeV5Snapshot = {
  identity: { protocolVersion: number[]; firmwareVersion: string; defaultLayer: number };
  capabilities: { featureBitmap: number[] };
  lighting: {
    rgbProtocol: number[];
    indicators: number;
    ledCount: number;
    ledIndices: Array<{ led: number; row: number; column: number }>;
    effects: Array<{ led: number; effect: number }>;
    colors: Array<{ led: number; hue: number; saturation: number; value: number }>;
  };
  keymap: { layerCount: number; keycodes: number[][][] };
  macros: NativeMacros;
};

type NativeMacros = {
  count: number;
  bufferSize: number;
  macros: NativeMacroStep[][];
};

type NativeMacroStep = {
  kind: "tap" | "down" | "up" | "char";
  keycode?: number;
  char?: string;
};

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * Native (Tauri) device discovery. When running inside the shell, the read path
 * goes through the Rust `qmkui-hid` core instead of WebHID; the snapshot it
 * returns is mapped onto the same shape the browser readers produce.
 */
export async function discoverNativeKeyboard(): Promise<BrowserKeyboardSelection | null> {
  if (!isNativeRuntime()) {
    return null;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const devices = (await (invoke as Invoke)("list_devices")) as NativeDeviceInfo[];
  if (!Array.isArray(devices) || devices.length === 0) {
    return null;
  }
  return nativeV5Selection(invoke as Invoke);
}

export async function chooseNativeKeyboard(): Promise<BrowserKeyboardSelection | null> {
  if (!isNativeRuntime()) {
    return null;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const devices = (await (invoke as Invoke)("list_devices")) as NativeDeviceInfo[];
  if (!Array.isArray(devices) || devices.length === 0) {
    return null;
  }
  return nativeV5Selection(invoke as Invoke);
}

/** Enables the native write gate. Call only after the operator confirms. */
export async function enableNativeDeviceWrites(): Promise<void> {
  if (!isNativeRuntime()) {
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await (invoke as Invoke)("enable_device_writes");
}

function nativeV5Selection(invoke: Invoke): BrowserKeyboardSelection {
  return {
    state: "selected",
    identity: {
      vendorId: 0x3434,
      productId: 0x0950,
      collections: [{ usagePage: 0xff60, usage: 0x0061 }],
    },
    contract: {
      state: "partial",
      capabilities: { protocolVersion: true, read: true, write: false, flash: false },
    },
    session: nativeV5Session(invoke),
  };
}

function nativeV5Session(invoke: Invoke): BrowserKeyboardSession {
  return {
    capabilities: { canRead: true, canWrite: false, canFlash: false },
    verifyProtocolVersion: async () => ({
      version: (await invoke("verify_protocol")) as 0x000c,
    }),
    readSnapshot: async () => {
      const data = (await invoke("read_v5_snapshot")) as NativeV5Snapshot;
      return nativeSnapshot(data);
    },
    writeKeycode: async (layer, row, col, keycode) => {
      await invoke("set_keycode", { layer, row, col, keycode });
    },
    saveEeprom: async () => {
      await invoke("save_eeprom");
    },
  };
}

function nativeSnapshot(data: NativeV5Snapshot): KeychronV5MaxReadSnapshot {
  return {
    identity: available({
      model: "Keychron V5 Max ANSI Knob",
      protocolVersion: data.identity.protocolVersion,
      firmwareVersion: data.identity.firmwareVersion,
      defaultLayer: data.identity.defaultLayer,
    }),
    capabilities: available({
      featureBitmap: data.capabilities.featureBitmap as [number, number],
    }),
    keymap: available({ layerCount: data.keymap.layerCount, keycodes: data.keymap.keycodes }),
    lighting: available({
      rgbProtocol: data.lighting.rgbProtocol as [number, number],
      indicators: [data.lighting.indicators],
      ledCount: data.lighting.ledCount,
      ledIndices: data.lighting.ledIndices.map((index) => ({
        led: index.led,
        matrix: { row: index.row, column: index.column },
      })),
      effects: data.lighting.effects,
      colors: data.lighting.colors,
    }),
    macros: available({
      count: data.macros.count,
      bufferSize: data.macros.bufferSize,
      macros: data.macros.macros.map((steps) =>
        steps.map((step) =>
          step.kind === "char"
            ? { kind: "char" as const, char: step.char ?? "" }
            : { kind: step.kind, keycode: step.keycode ?? 0 },
        ),
      ),
    }),
    readAt: new Date().toISOString(),
  };
}
