import {
  classifyKeychronV5MaxIdentity,
  type HidIdentityMetadata,
} from "./keychronV5MaxContract";
import { available, unavailable, unverified, type ValueState } from "./hardwareSnapshot";
import { ViaReadProtocol, readViaKeymap, type ViaKeymap } from "./viaReadProtocol";

const REPORT_ID = 0;
const REPORT_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10_000;
const MAX_RGB_COLOR_BATCH_SIZE = 9;

const KEYCHRON_READ_COMMANDS = new Set([0xa0, 0xa1, 0xa2, 0xa3, 0xa8]);
const KEYCHRON_RGB_READ_OPERATIONS = new Set([0x01, 0x03, 0x05, 0x06, 0x07, 0x09]);
const pendingVendorReads = new WeakSet<object>();
const pendingSnapshots = new WeakSet<object>();

export type KeychronV5MaxReaderDevice = HidIdentityMetadata & {
  opened: boolean;
  open: () => Promise<void>;
  close: () => Promise<void>;
  sendReport: (reportId: number, data: BufferSource) => Promise<void>;
  addEventListener: (
    type: "inputreport",
    listener: (event: { reportId: number; data: ArrayBuffer | ArrayBufferView }) => void,
  ) => void;
  removeEventListener: (
    type: "inputreport",
    listener: (event: { reportId: number; data: ArrayBuffer | ArrayBufferView }) => void,
  ) => void;
};

export type KeychronV5MaxIdentityFacts = {
  model: "Keychron V5 Max ANSI Knob";
  protocolVersion: readonly number[];
  firmwareVersion: string;
  defaultLayer: number;
};

export type KeychronV5MaxCapabilities = {
  featureBitmap: readonly [number, number];
};

export type KeychronV5MaxLighting = {
  rgbProtocol: readonly [number, number];
  indicators: readonly number[];
  ledCount: number;
  ledIndices: readonly { led: number; matrix: { row: number; column: number } }[];
  effects: readonly { led: number; effect: number }[];
  colors: readonly { led: number; hue: number; saturation: number; value: number }[];
};

export type KeychronV5MaxReadSnapshot = {
  identity: ValueState<KeychronV5MaxIdentityFacts>;
  capabilities: ValueState<KeychronV5MaxCapabilities>;
  keymap: ValueState<ViaKeymap>;
  lighting: ValueState<KeychronV5MaxLighting>;
  readAt: string;
};

export type KeychronV5MaxReaderOptions = {
  keymap?: { layerCount: number; rows: number; columns: number };
  now?: () => string;
  timeoutMs?: number;
};

export class KeychronV5MaxReaderError extends Error {
  constructor(
    readonly code:
      | "identity"
      | "command-not-allowed"
      | "rgb-operation-not-allowed"
      | "invalid-request"
      | "invalid-timeout"
      | "concurrent-read"
      | "timeout"
      | "transport"
      | "invalid-response",
  ) {
    super(`Keychron V5 Max reader failed: ${code}`);
    this.name = "KeychronV5MaxReaderError";
  }
}

/**
 * Sends one of the firmware-backed V5 Max query frames. The allow-list is
 * intentionally exhaustive: any set/save/default/reset/flash command is
 * rejected before WebHID receives a report.
 */
export async function requestKeychronV5MaxRead(
  device: KeychronV5MaxReaderDevice,
  command: number,
  payload: readonly number[] = [],
  options: { timeoutMs?: number } = {},
): Promise<Uint8Array> {
  validateReadRequest(command, payload);
  const timeoutMs = boundedTimeoutMs(options.timeoutMs);
  if (pendingVendorReads.has(device)) {
    throw new KeychronV5MaxReaderError("concurrent-read");
  }
  pendingVendorReads.add(device);
  try {
    return await requestVendorResponse(device, command, payload, timeoutMs);
  } finally {
    pendingVendorReads.delete(device);
  }
}

export async function readKeychronV5MaxSnapshot(
  device: KeychronV5MaxReaderDevice,
  options: KeychronV5MaxReaderOptions = {},
): Promise<KeychronV5MaxReadSnapshot> {
  if (classifyKeychronV5MaxIdentity(device).state !== "partial") {
    throw new KeychronV5MaxReaderError("identity");
  }
  const timeoutMs = boundedTimeoutMs(options.timeoutMs);
  if (pendingSnapshots.has(device)) {
    throw new KeychronV5MaxReaderError("concurrent-read");
  }
  pendingSnapshots.add(device);
  const openedByQmkui = !device.opened;
  try {
    if (openedByQmkui) {
      await device.open();
    }
    const identity = await readIdentity(device, timeoutMs);
    const capabilities = await readCapabilities(device, timeoutMs);
    const keymap = await readKeymap(device, options.keymap, timeoutMs);
    const lighting = await readLighting(device, timeoutMs);
    return {
      identity,
      capabilities,
      keymap,
      lighting,
      readAt: (options.now ?? (() => new Date().toISOString()))(),
    };
  } finally {
    try {
      if (openedByQmkui) {
        await device.close();
      }
    } finally {
      pendingSnapshots.delete(device);
    }
  }
}

async function readIdentity(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<ValueState<KeychronV5MaxIdentityFacts>> {
  try {
    const protocol = await requestKeychronV5MaxRead(device, 0xa0, [], { timeoutMs });
    const firmware = await requestKeychronV5MaxRead(device, 0xa1, [], { timeoutMs });
    const defaultLayer = await requestKeychronV5MaxRead(device, 0xa3, [], { timeoutMs });
    const firmwareVersion = decodeFirmwareVersion(firmware);
    if (!firmwareVersion) {
      return unverified("Firmware version response is not printable ASCII.");
    }
    return available({
      model: "Keychron V5 Max ANSI Knob",
      protocolVersion: [protocol[1]!, protocol[2]!, protocol[3]!],
      firmwareVersion,
      defaultLayer: defaultLayer[1]!,
    });
  } catch (error) {
    return unavailable(readFailureReason("Identity", error));
  }
}

async function readCapabilities(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<ValueState<KeychronV5MaxCapabilities>> {
  try {
    const response = await requestKeychronV5MaxRead(device, 0xa2, [], { timeoutMs });
    return available({ featureBitmap: [response[1]!, response[2]!] });
  } catch (error) {
    return unavailable(readFailureReason("Feature bitmap", error));
  }
}

async function readKeymap(
  device: KeychronV5MaxReaderDevice,
  dimensions: KeychronV5MaxReaderOptions["keymap"],
  timeoutMs: number,
): Promise<ValueState<ViaKeymap>> {
  if (!dimensions) {
    return unavailable("No verified V5 Max matrix dimensions were supplied.");
  }
  try {
    return available(await readViaKeymap(new ViaReadProtocol(device, { timeoutMs }), dimensions));
  } catch (error) {
    return unavailable(readFailureReason("Dynamic keymap", error));
  }
}

async function readLighting(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<ValueState<KeychronV5MaxLighting>> {
  try {
    const rgbProtocol = await readRgbProtocol(device, timeoutMs);
    const indicators = await readRgbIndicators(device, timeoutMs);
    const ledCount = await readLedCount(device, timeoutMs);
    const ledIndices = [] as { led: number; matrix: { row: number; column: number } }[];
    const effects = [] as { led: number; effect: number }[];
    for (let led = 0; led < ledCount; led += 1) {
      ledIndices.push(await readLedIndex(device, led, timeoutMs));
      effects.push(await readLedEffect(device, led, timeoutMs));
    }
    const colors = await readLedColors(device, ledCount, timeoutMs);
    return available({ rgbProtocol, indicators, ledCount, ledIndices, effects, colors });
  } catch (error) {
    return unavailable(readFailureReason("RGB state", error));
  }
}

async function readRgbProtocol(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<[number, number]> {
  const response = await requestKeychronV5MaxRead(device, 0xa8, [0x01], { timeoutMs });
  return [response[2]!, response[3]!];
}

async function readRgbIndicators(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<number[]> {
  const response = await requestKeychronV5MaxRead(device, 0xa8, [0x03], { timeoutMs });
  return Array.from(response.slice(2, 3));
}

async function readLedCount(device: KeychronV5MaxReaderDevice, timeoutMs: number): Promise<number> {
  const response = await requestKeychronV5MaxRead(device, 0xa8, [0x05], { timeoutMs });
  return response[2]!;
}

async function readLedIndex(
  device: KeychronV5MaxReaderDevice,
  led: number,
  timeoutMs: number,
): Promise<{ led: number; matrix: { row: number; column: number } }> {
  const response = await requestKeychronV5MaxRead(device, 0xa8, [0x06, led], { timeoutMs });
  return { led: response[2]!, matrix: { row: response[3]!, column: response[4]! } };
}

async function readLedEffect(
  device: KeychronV5MaxReaderDevice,
  led: number,
  timeoutMs: number,
): Promise<{ led: number; effect: number }> {
  const response = await requestKeychronV5MaxRead(device, 0xa8, [0x07, led], { timeoutMs });
  return { led: response[2]!, effect: response[3]! };
}

async function readLedColors(
  device: KeychronV5MaxReaderDevice,
  ledCount: number,
  timeoutMs: number,
): Promise<{ led: number; hue: number; saturation: number; value: number }[]> {
  const colors: { led: number; hue: number; saturation: number; value: number }[] = [];
  for (let start = 0; start < ledCount; start += MAX_RGB_COLOR_BATCH_SIZE) {
    const count = Math.min(MAX_RGB_COLOR_BATCH_SIZE, ledCount - start);
    const response = await requestKeychronV5MaxRead(device, 0xa8, [0x09, start, count], { timeoutMs });
    if (response[3] !== count) {
      throw new KeychronV5MaxReaderError("invalid-response");
    }
    for (let offset = 0; offset < count; offset += 1) {
      const byteOffset = 4 + offset * 3;
      colors.push({
        led: start + offset,
        hue: response[byteOffset]!,
        saturation: response[byteOffset + 1]!,
        value: response[byteOffset + 2]!,
      });
    }
  }
  return colors;
}

function validateReadRequest(command: number, payload: readonly number[]): void {
  if (!KEYCHRON_READ_COMMANDS.has(command)) {
    throw new KeychronV5MaxReaderError("command-not-allowed");
  }
  if (!isByte(command) || !payload.every(isByte)) {
    throw new KeychronV5MaxReaderError("invalid-request");
  }
  if (command !== 0xa8) {
    if (payload.length !== 0) throw new KeychronV5MaxReaderError("invalid-request");
    return;
  }
  const operation = payload[0];
  if (!KEYCHRON_RGB_READ_OPERATIONS.has(operation ?? -1)) {
    throw new KeychronV5MaxReaderError("rgb-operation-not-allowed");
  }
  const validPayload =
    ([0x01, 0x03, 0x05].includes(operation!) && payload.length === 1) ||
    ([0x06, 0x07].includes(operation!) && payload.length === 2) ||
    (operation === 0x09 && payload.length === 3 && payload[2]! > 0 && payload[2]! <= MAX_RGB_COLOR_BATCH_SIZE);
  if (!validPayload) {
    throw new KeychronV5MaxReaderError("invalid-request");
  }
}

function requestVendorResponse(
  device: KeychronV5MaxReaderDevice,
  command: number,
  payload: readonly number[],
  timeoutMs: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: Uint8Array | KeychronV5MaxReaderError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      device.removeEventListener("inputreport", onInputReport);
      if (result instanceof KeychronV5MaxReaderError) reject(result);
      else resolve(result);
    };
    const onInputReport = (event: { reportId: number; data: ArrayBuffer | ArrayBufferView }) => {
      if (event.reportId !== REPORT_ID) return;
      const response = normalizeReportData(event.data);
      if (!response || response.byteLength !== REPORT_LENGTH || !matchesRequest(response, command, payload)) return;
      finish(response);
    };
    const timeout = setTimeout(() => finish(new KeychronV5MaxReaderError("timeout")), timeoutMs);
    const request = new Uint8Array(REPORT_LENGTH);
    request[0] = command;
    request.set(payload, 1);
    device.addEventListener("inputreport", onInputReport);
    try {
      Promise.resolve(device.sendReport(REPORT_ID, request)).catch(() =>
        finish(new KeychronV5MaxReaderError("transport")),
      );
    } catch {
      finish(new KeychronV5MaxReaderError("transport"));
    }
  });
}

function matchesRequest(response: Uint8Array, command: number, payload: readonly number[]): boolean {
  if (response[0] !== command) return false;
  if (command !== 0xa8) return true;
  if (response[1] !== payload[0]) return false;
  if ((payload[0] === 0x06 || payload[0] === 0x07) && response[2] !== payload[1]) return false;
  return payload[0] !== 0x09 || (response[2] === payload[1] && response[3] === payload[2]);
}

function decodeFirmwareVersion(response: Uint8Array): string | undefined {
  const bytes: number[] = [];
  for (let index = 1; index < response.length && response[index] !== 0; index += 1) {
    const value = response[index]!;
    if (value < 0x20 || value > 0x7e) return undefined;
    bytes.push(value);
  }
  return bytes.length === 0 ? undefined : String.fromCharCode(...bytes);
}

function boundedTimeoutMs(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new KeychronV5MaxReaderError("invalid-timeout");
  }
  return value;
}

function normalizeReportData(data: ArrayBuffer | ArrayBufferView): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return undefined;
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

function readFailureReason(area: string, error: unknown): string {
  return error instanceof KeychronV5MaxReaderError
    ? `${area} read failed: ${error.code}.`
    : `${area} read failed: unverified transport error.`;
}
