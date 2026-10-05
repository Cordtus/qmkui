/**
 * Dev-only mock of a Keychron V5 Max, used to exercise the UI (including the
 * gated write path) without hardware. It answers the real reader/writer
 * protocol exactly as the captured device does, so the app's own discovery,
 * readers, and writers run unmodified against it.
 *
 * Installed by `main.ts` only when `import.meta.env.DEV` and the URL has
 * `?demo`; the production build drops the branch, so this module never ships.
 *
 * Lighting/identity values come from the captured conformance fixtures
 * (`fixtures/protocol/v5-*.json`); the keymap is the bundled V5 Max stock
 * keymap projected onto its 6x19 matrix.
 */

import { keycodeValue } from "../keycodes";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "../presets";
import type { Layer } from "../domain";

const REPORT_LENGTH = 32;
const VENDOR_ID = 0x3434;
const PRODUCT_ID = 0x0950;

const VIA_COLLECTION = { usagePage: 0xff60, usage: 0x0061 };

// Keychron vendor read commands.
const CMD_IDENTITY_PROTOCOL = 0xa0;
const CMD_IDENTITY_FIRMWARE = 0xa1;
const CMD_CAPABILITIES = 0xa2;
const CMD_DEFAULT_LAYER = 0xa3;

// VIA commands.
const CMD_GET_PROTOCOL_VERSION = 0x01;
const CMD_GET_KEYCODE = 0x04;
const CMD_SET_KEYCODE = 0x05;
const CMD_CUSTOM_GET_VALUE = 0x08;
const CMD_CUSTOM_SET_VALUE = 0x07;
const CMD_CUSTOM_SAVE = 0x09;
const CMD_MACRO_GET_COUNT = 0x0c;
const CMD_MACRO_GET_BUFFER_SIZE = 0x0d;
const CMD_MACRO_GET_BUFFER = 0x0e;
const CMD_GET_LAYER_COUNT = 0x11;
const CMD_GET_BUFFER = 0x12;
const CMD_GET_ENCODER = 0x14;

const RGB_MATRIX_CHANNEL = 3;

type InputReport = { reportId: number; data: Uint8Array };

type Lighting = {
  brightness: number;
  effect: number;
  effectSpeed: number;
  hue: number;
  saturation: number;
};

type MockState = {
  lighting: Lighting;
  keycodes: number[][][];
  opened: boolean;
  listeners: Set<(event: InputReport) => void>;
};

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** A 32-byte response echoing the command byte, as VIA/Keychron expect. */
function reply(command: number, bytes: readonly number[] = []): Uint8Array {
  const out = new Uint8Array(REPORT_LENGTH);
  out[0] = command;
  out.set(bytes.slice(0, REPORT_LENGTH - 1), 1);
  return out;
}

function stockKeycodes(): number[][][] {
  const layers = keychronV5MaxProject.layers as Layer[];
  const layout = keychronV5MaxKeyboard.layouts[0];
  const matrix = keychronV5MaxKeyboard.matrix ?? { rows: 6, cols: 19 };
  const layerCount = layers.length;
  const keycodes: number[][][] = Array.from({ length: layerCount }, () =>
    Array.from({ length: matrix.rows }, () => new Array<number>(matrix.cols).fill(0)),
  );

  for (const layer of layers) {
    const target = keycodes[layer.index];
    if (!target) {
      continue;
    }
    for (const assignment of layer.assignments) {
      const key = layout.keys.find((candidate) => candidate.id === assignment.visualKeyId);
      const value = keycodeValue(assignment.qmk);
      if (!key?.matrix || value === undefined) {
        continue;
      }
      const row = target[key.matrix.row];
      if (row) {
        row[key.matrix.col] = value;
      }
    }
  }
  return keycodes;
}

function respond(state: MockState, request: Uint8Array): Uint8Array {
  const command = request[0] ?? 0;
  switch (command) {
    // Captured identity (fixtures/protocol/v5-identity.json): protocol 0x0202,
    // firmware "v1.0.0", default layer 2, capability bitmap 0x0081.
    case CMD_IDENTITY_PROTOCOL:
      return reply(command, [2, 0, 2]);
    case CMD_IDENTITY_FIRMWARE:
      return reply(command, [0x76, 0x31, 0x2e, 0x30, 0x2e, 0x30]);
    case CMD_CAPABILITIES:
      return reply(command, [0x00, 0x81]);
    case CMD_DEFAULT_LAYER:
      return reply(command, [2]);

    case CMD_GET_PROTOCOL_VERSION:
      return reply(command, [0x00, 0x0c]);
    case CMD_GET_LAYER_COUNT:
      return reply(command, [state.keycodes.length]);

    case CMD_GET_KEYCODE: {
      const layer = request[1] ?? 0;
      const row = request[2] ?? 0;
      const col = request[3] ?? 0;
      const keycode = state.keycodes[layer]?.[row]?.[col] ?? 0;
      return reply(command, [layer, row, col, (keycode >> 8) & 0xff, keycode & 0xff]);
    }
    case CMD_SET_KEYCODE: {
      const layer = request[1] ?? 0;
      const row = request[2] ?? 0;
      const col = request[3] ?? 0;
      const keycode = ((request[4] ?? 0) << 8) | (request[5] ?? 0);
      const target = state.keycodes[layer]?.[row];
      if (target) {
        target[col] = keycode;
      }
      return reply(command, [layer, row, col, (keycode >> 8) & 0xff, keycode & 0xff]);
    }

    case CMD_CUSTOM_GET_VALUE: {
      const channel = request[1] ?? 0;
      const valueId = request[2] ?? 0;
      return reply(command, [channel, valueId, ...readCustomValue(state, channel, valueId)]);
    }
    case CMD_CUSTOM_SET_VALUE: {
      const channel = request[1] ?? 0;
      const valueId = request[2] ?? 0;
      writeCustomValue(state, channel, valueId, request);
      return reply(command, [channel, valueId, request[3] ?? 0]);
    }
    case CMD_CUSTOM_SAVE:
      return reply(command, [request[1] ?? 0, 0, 0]);

    case CMD_MACRO_GET_COUNT:
      return reply(command, [0]);
    case CMD_MACRO_GET_BUFFER_SIZE:
      return reply(command, [0, 0]);
    case CMD_MACRO_GET_BUFFER:
      return reply(command, [request[1] ?? 0, request[2] ?? 0, request[3] ?? 0]);
    case CMD_GET_BUFFER:
      return reply(command, [request[1] ?? 0, request[2] ?? 0]);
    case CMD_GET_ENCODER:
      return reply(command, [request[1] ?? 0, request[2] ?? 0, request[3] ?? 0, 0, 0]);

    default:
      // Echo unknown commands so a request never hangs; the app only sends
      // allow-listed commands anyway.
      return reply(command);
  }
}

function readCustomValue(state: MockState, channel: number, valueId: number): number[] {
  if (channel !== RGB_MATRIX_CHANNEL) {
    return [];
  }
  const { lighting } = state;
  switch (valueId) {
    case 1:
      return [lighting.brightness];
    case 2:
      return [lighting.effect];
    case 3:
      return [lighting.effectSpeed];
    case 4:
      return [lighting.hue, lighting.saturation];
    default:
      return [];
  }
}

function writeCustomValue(
  state: MockState,
  channel: number,
  valueId: number,
  request: Uint8Array,
): void {
  if (channel !== RGB_MATRIX_CHANNEL) {
    return;
  }
  const { lighting } = state;
  switch (valueId) {
    case 1:
      lighting.brightness = request[3] ?? lighting.brightness;
      break;
    case 2:
      lighting.effect = request[3] ?? lighting.effect;
      break;
    case 3:
      lighting.effectSpeed = request[3] ?? lighting.effectSpeed;
      break;
    case 4:
      lighting.hue = request[3] ?? lighting.hue;
      lighting.saturation = request[4] ?? lighting.saturation;
      break;
    default:
      break;
  }
}

function createMockDevice() {
  const state: MockState = {
    // Captured VIA RGB-matrix state (fixtures/protocol/v5-lighting.json).
    lighting: { brightness: 255, effect: 1, effectSpeed: 127, hue: 113, saturation: 221 },
    keycodes: stockKeycodes(),
    opened: false,
    listeners: new Set(),
  };

  return {
    vendorId: VENDOR_ID,
    productId: PRODUCT_ID,
    productName: "Keychron V5 Max",
    collections: [VIA_COLLECTION],
    get opened() {
      return state.opened;
    },
    async open() {
      state.opened = true;
    },
    async close() {
      state.opened = false;
    },
    async sendReport(_reportId: number, data: ArrayBuffer | ArrayBufferView): Promise<void> {
      const response = respond(state, toBytes(data));
      // Deliver asynchronously, as a real HID input report arrives.
      queueMicrotask(() => {
        for (const listener of state.listeners) {
          listener({ reportId: 0, data: response });
        }
      });
    },
    addEventListener(type: string, listener: (event: InputReport) => void) {
      if (type === "inputreport") {
        state.listeners.add(listener);
      }
    },
    removeEventListener(type: string, listener: (event: InputReport) => void) {
      if (type === "inputreport") {
        state.listeners.delete(listener);
      }
    },
  };
}

/**
 * Installs a fake `navigator.hid` exposing one Keychron V5 Max. Idempotent.
 */
export function installMockKeychronDevice(): void {
  const device = createMockDevice();
  const hid = {
    getDevices: async () => [device],
    requestDevice: async () => [device],
  };
  Object.defineProperty(navigator, "hid", { configurable: true, value: hid });
  console.info(
    "[QMKUI] mock Keychron V5 Max installed (?demo) — reads and gated writes hit an in-memory device.",
  );
}
