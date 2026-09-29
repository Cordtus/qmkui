import readOnlyCommands from "../../../../fixtures/protocol/read-only-commands.json";
import {
  classifyKeychronV5MaxIdentity,
  type HidIdentityMetadata,
} from "./keychronV5MaxContract";
import { available, unavailable, unverified, type ValueState } from "./hardwareSnapshot";
import { requestReport, withOpen, type DeviceTransport } from "./transport";
import {
  ViaReadProtocol,
  ViaReadProtocolError,
  readViaKeymap,
  readViaMacros,
  type ViaKeymap,
  type ViaMacros,
} from "./viaReadProtocol";

const REPORT_ID = 0;
const REPORT_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10_000;

// VIA RGB-matrix custom channel and value ids (`quantum/via.h`), the only
// lighting surface this firmware exposes. The Keychron `0xa8` "RGB state"
// protocol does not exist in the V5 Max firmware: every `0xa8` frame is
// answered with VIA `id_unhandled` (0xff), so lighting must be read through the
// standard VIA custom-value channel.
const RGB_MATRIX_CHANNEL = 3;
const RGB_MATRIX_BRIGHTNESS = 1;
const RGB_MATRIX_EFFECT = 2;
const RGB_MATRIX_EFFECT_SPEED = 3;
const RGB_MATRIX_COLOR = 4;

const KEYCHRON_READ_COMMANDS = new Set(Object.values(readOnlyCommands.keychronReadCommands));
const pendingVendorReads = new WeakSet<object>();
const pendingSnapshots = new WeakSet<object>();

export type KeychronV5MaxReaderDevice = DeviceTransport & HidIdentityMetadata;

export type KeychronV5MaxIdentityFacts = {
  model: "Keychron V5 Max ANSI Knob";
  protocolVersion: readonly number[];
  firmwareVersion: string;
  defaultLayer: number;
};

export type KeychronV5MaxCapabilities = {
  featureBitmap: readonly [number, number];
};

/**
 * Standard VIA RGB-matrix state (channel 3). `effect` is the firmware's RGB
 * matrix mode id; `hue`/`saturation` are the global colour, brightness and
 * effect speed are 0–255. There is no per-LED colour map over VIA.
 */
export type KeychronV5MaxLighting = {
  brightness: number;
  effect: number;
  effectSpeed: number;
  hue: number;
  saturation: number;
};

export type KeychronV5MaxReadSnapshot = {
  identity: ValueState<KeychronV5MaxIdentityFacts>;
  capabilities: ValueState<KeychronV5MaxCapabilities>;
  keymap: ValueState<ViaKeymap>;
  lighting: ValueState<KeychronV5MaxLighting>;
  macros: ValueState<ViaMacros>;
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
  if (classifyKeychronV5MaxIdentity(device).state !== "partial") {
    throw new KeychronV5MaxReaderError("identity");
  }
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
  try {
    return await withOpen(device, async () => {
      const identity = await readIdentity(device, timeoutMs);
      const capabilities = await readCapabilities(device, timeoutMs);
      const keymap = await readKeymap(device, options.keymap, timeoutMs);
      const lighting = await readLighting(device, timeoutMs);
      const macros = await readMacros(device, timeoutMs);
      return {
        identity,
        capabilities,
        keymap,
        lighting,
        macros,
        readAt: (options.now ?? (() => new Date().toISOString()))(),
      };
    });
  } finally {
    pendingSnapshots.delete(device);
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

/**
 * Reads the V5 Max lighting over the standard VIA RGB-matrix channel. The
 * Keychron vendor `0xa8` RGB protocol is not implemented by this firmware
 * (it answers `id_unhandled`), so a vendor read can never succeed.
 */
async function readLighting(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<ValueState<KeychronV5MaxLighting>> {
  try {
    const protocol = new ViaReadProtocol(device, { timeoutMs });
    const brightness = await protocol.getCustomValue({ channel: RGB_MATRIX_CHANNEL, valueId: RGB_MATRIX_BRIGHTNESS });
    const effect = await protocol.getCustomValue({ channel: RGB_MATRIX_CHANNEL, valueId: RGB_MATRIX_EFFECT });
    const effectSpeed = await protocol.getCustomValue({ channel: RGB_MATRIX_CHANNEL, valueId: RGB_MATRIX_EFFECT_SPEED });
    const color = await protocol.getCustomValue({ channel: RGB_MATRIX_CHANNEL, valueId: RGB_MATRIX_COLOR });
    return available({
      brightness: brightness.bytes[0]!,
      effect: effect.bytes[0]!,
      effectSpeed: effectSpeed.bytes[0]!,
      hue: color.bytes[0]!,
      saturation: color.bytes[1]!,
    });
  } catch (error) {
    return unavailable(readFailureReason("Lighting", error));
  }
}

async function readMacros(
  device: KeychronV5MaxReaderDevice,
  timeoutMs: number,
): Promise<ValueState<ViaMacros>> {
  try {
    return available(await readViaMacros(new ViaReadProtocol(device, { timeoutMs })));
  } catch (error) {
    return unavailable(readFailureReason("Macros", error));
  }
}

function validateReadRequest(command: number, payload: readonly number[]): void {
  if (!KEYCHRON_READ_COMMANDS.has(command)) {
    throw new KeychronV5MaxReaderError("command-not-allowed");
  }
  // The Keychron identity/capability commands are parameterless.
  if (!isByte(command) || payload.length !== 0 || !payload.every(isByte)) {
    throw new KeychronV5MaxReaderError("invalid-request");
  }
}

function requestVendorResponse(
  device: KeychronV5MaxReaderDevice,
  command: number,
  payload: readonly number[],
  timeoutMs: number,
): Promise<Uint8Array> {
  const request = new Uint8Array(REPORT_LENGTH);
  request[0] = command;
  request.set(payload, 1);

  return requestReport(
    device,
    REPORT_ID,
    request,
    (response) => response.byteLength === REPORT_LENGTH && matchesRequest(response, command, payload),
    KeychronV5MaxReaderError,
    timeoutMs,
  );
}

function matchesRequest(response: Uint8Array, command: number, _payload: readonly number[]): boolean {
  // Keychron identity/capability frames echo the command byte.
  return response[0] === command;
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

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

function readFailureReason(area: string, error: unknown): string {
  const code =
    error instanceof KeychronV5MaxReaderError
      ? error.code
      : error instanceof ViaReadProtocolError
        ? error.code
        : undefined;
  return code ? `${area} read failed: ${code}.` : `${area} read failed: unverified transport error.`;
}
