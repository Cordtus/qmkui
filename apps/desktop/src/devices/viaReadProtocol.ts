import readOnlyCommands from "../../../../fixtures/protocol/read-only-commands.json";
import { requestReport, type DeviceTransport } from "./transport";

const commands = readOnlyCommands.viaReadCommands;

const VIA_REPORT_ID = 0;
const VIA_REPORT_LENGTH = 32;
const GET_PROTOCOL_VERSION = commands.getProtocolVersion;
const GET_KEYBOARD_VALUE = commands.getKeyboardValue;
const DYNAMIC_KEYMAP_GET_KEYCODE = commands.dynamicKeymapGetKeycode;
const CUSTOM_GET_VALUE = commands.customGetValue;
const DYNAMIC_KEYMAP_MACRO_GET_COUNT = commands.dynamicKeymapMacroGetCount;
const DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE = commands.dynamicKeymapMacroGetBufferSize;
const DYNAMIC_KEYMAP_MACRO_GET_BUFFER = commands.dynamicKeymapMacroGetBuffer;
const DYNAMIC_KEYMAP_GET_LAYER_COUNT = commands.dynamicKeymapGetLayerCount;
const DYNAMIC_KEYMAP_GET_BUFFER = commands.dynamicKeymapGetBuffer;
const DYNAMIC_KEYMAP_GET_ENCODER = commands.dynamicKeymapGetEncoder;
const DEFAULT_TIMEOUT_MS = 1_000;
// A VIA read must always settle promptly; ten seconds is the largest supported wait.
const MAX_TIMEOUT_MS = 10_000;
const MAX_BUFFER_READ_SIZE = 28;

const KEYBOARD_VALUE_UPTIME = 0x01;
const KEYBOARD_VALUE_LAYOUT_OPTIONS = 0x02;
const KEYBOARD_VALUE_SWITCH_MATRIX_STATE = 0x03;
const KEYBOARD_VALUE_FIRMWARE_VERSION = 0x04;
const KEYBOARD_VALUE_KEYCODES_VERSION = 0x06;

const READ_ONLY_COMMANDS = new Set(Object.values(commands));

export type ViaReadTransport = Pick<
  DeviceTransport,
  "sendReport" | "addEventListener" | "removeEventListener"
>;

export type ViaKeymap = {
  layerCount: number;
  keycodes: number[][][];
};

export type ViaCustomValueSelection =
  | { channel: 0; valueId: number }
  | { channel: 1; valueId: 1 | 2 }
  | { channel: 2; valueId: 1 | 2 | 3 | 4 }
  | { channel: 3; valueId: 1 | 2 | 3 | 4 }
  | { channel: 4; valueId: 1 | 2 }
  | { channel: 5; valueId: 1 | 2 | 3 };

export type ViaCustomValueDecoder = {
  channel: 0;
  valueId: number;
  decode: (bytes: Uint8Array) => unknown;
};

export type ViaCustomValue = {
  channel: number;
  valueId: number;
  bytes: Uint8Array;
  verification: "verified" | "unverified";
  decoded?: unknown;
};

export type ViaBufferChunk = {
  offset: number;
  bytes: Uint8Array;
};

export type ViaSwitchMatrixState = {
  offset: number;
  bytes: Uint8Array;
};

export type ViaReadProtocolOptions = {
  timeoutMs?: number;
  customValueDecoders?: readonly ViaCustomValueDecoder[];
};

export class ViaReadProtocolError extends Error {
  constructor(
    readonly code:
      | "command-not-allowed"
      | "concurrent-read"
      | "invalid-request"
      | "invalid-timeout"
      | "invalid-dimensions"
      | "layer-count-mismatch"
      | "timeout"
      | "transport",
  ) {
    super(`VIA read protocol failed: ${code}`);
    this.name = "ViaReadProtocolError";
  }
}

/**
 * A bounded, read-only VIA adapter. It exposes only documented state queries
 * and has no path for set, save, reset, bootloader, or firmware commands.
 */
export class ViaReadProtocol {
  private pending = false;

  constructor(
    private readonly transport: ViaReadTransport,
    private readonly options: ViaReadProtocolOptions = {},
  ) {}

  async read(command: number, payload: readonly number[] = []): Promise<Uint8Array> {
    if (command === CUSTOM_GET_VALUE) {
      throw new ViaReadProtocolError("invalid-request");
    }
    return this.issueRead(command, payload);
  }

  async getProtocolVersion(): Promise<number> {
    return readUint16(await this.read(GET_PROTOCOL_VERSION), 1);
  }

  async getUptime(): Promise<number> {
    return this.getKeyboardUint32(KEYBOARD_VALUE_UPTIME);
  }

  async getLayoutOptions(): Promise<number> {
    return this.getKeyboardUint32(KEYBOARD_VALUE_LAYOUT_OPTIONS);
  }

  async getSwitchMatrixState(offset: number): Promise<ViaSwitchMatrixState> {
    const response = await this.read(GET_KEYBOARD_VALUE, [KEYBOARD_VALUE_SWITCH_MATRIX_STATE, offset]);
    return { offset, bytes: response.slice(3) };
  }

  async getFirmwareVersion(): Promise<number> {
    return this.getKeyboardUint32(KEYBOARD_VALUE_FIRMWARE_VERSION);
  }

  async getKeycodesVersion(): Promise<number> {
    return this.getKeyboardUint32(KEYBOARD_VALUE_KEYCODES_VERSION);
  }

  async getCustomValue(selection: ViaCustomValueSelection): Promise<ViaCustomValue> {
    if (!isValidCustomValueSelection(selection)) {
      throw new ViaReadProtocolError("invalid-request");
    }
    const response = await this.issueRead(CUSTOM_GET_VALUE, [selection.channel, selection.valueId]);
    const bytes = response.slice(3);
    const decoder = selection.channel === 0
      ? this.options.customValueDecoders?.find(
          (candidate) => candidate.channel === selection.channel && candidate.valueId === selection.valueId,
        )
      : undefined;

    if (selection.channel === 0 && !decoder) {
      return { channel: selection.channel, valueId: selection.valueId, bytes, verification: "unverified" };
    }
    return {
      channel: selection.channel,
      valueId: selection.valueId,
      bytes,
      verification: "verified",
      ...(decoder ? { decoded: decoder.decode(bytes) } : {}),
    };
  }

  async getMacroCount(): Promise<number> {
    const response = await this.read(DYNAMIC_KEYMAP_MACRO_GET_COUNT);
    return response[1]!;
  }

  async getMacroBufferSize(): Promise<number> {
    return readUint16(await this.read(DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE), 1);
  }

  async getMacroBuffer(offset: number, size: number): Promise<ViaBufferChunk> {
    return this.getBufferChunk(DYNAMIC_KEYMAP_MACRO_GET_BUFFER, offset, size);
  }

  async getDynamicKeymapBuffer(offset: number, size: number): Promise<ViaBufferChunk> {
    return this.getBufferChunk(DYNAMIC_KEYMAP_GET_BUFFER, offset, size);
  }

  async getEncoderKeycode(layer: number, encoder: number, clockwise: boolean): Promise<number> {
    const response = await this.read(DYNAMIC_KEYMAP_GET_ENCODER, [layer, encoder, clockwise ? 1 : 0]);
    return readUint16(response, 4);
  }

  private async getKeyboardUint32(valueId: number): Promise<number> {
    return readUint32(await this.read(GET_KEYBOARD_VALUE, [valueId]), 2);
  }

  private async getBufferChunk(command: number, offset: number, size: number): Promise<ViaBufferChunk> {
    if (!isUint16(offset) || !isBufferReadSize(size)) {
      throw new ViaReadProtocolError("invalid-request");
    }
    const response = await this.read(command, [offset >> 8, offset & 0xff, size]);
    return { offset, bytes: response.slice(4, 4 + size) };
  }

  private async issueRead(command: number, payload: readonly number[]): Promise<Uint8Array> {
    if (!READ_ONLY_COMMANDS.has(command)) {
      throw new ViaReadProtocolError("command-not-allowed");
    }
    if (
      !isByte(command) ||
      !hasExpectedPayloadShape(command, payload) ||
      !payload.every(isByte)
    ) {
      throw new ViaReadProtocolError("invalid-request");
    }
    const timeoutMs = boundedTimeoutMs(this.options.timeoutMs);
    if (this.pending) {
      throw new ViaReadProtocolError("concurrent-read");
    }

    this.pending = true;
    try {
      return await requestRead(
        this.transport,
        command,
        payload,
        timeoutMs,
      );
    } finally {
      this.pending = false;
    }
  }

  async getLayerCount(): Promise<number> {
    const response = await this.read(DYNAMIC_KEYMAP_GET_LAYER_COUNT);
    return response[1]!;
  }

  async getKeycode(layer: number, row: number, column: number): Promise<number> {
    if (![layer, row, column].every(isByte)) {
      throw new ViaReadProtocolError("invalid-request");
    }
    const response = await this.read(DYNAMIC_KEYMAP_GET_KEYCODE, [layer, row, column]);
    return (response[4]! << 8) | response[5]!;
  }
}

export async function readViaKeymap(
  protocol: ViaReadProtocol,
  dimensions: { layerCount: number; rows: number; columns: number },
): Promise<ViaKeymap> {
  if (![dimensions.layerCount, dimensions.rows, dimensions.columns].every(isDimension)) {
    throw new ViaReadProtocolError("invalid-dimensions");
  }

  const observedLayerCount = await protocol.getLayerCount();
  if (observedLayerCount !== dimensions.layerCount) {
    throw new ViaReadProtocolError("layer-count-mismatch");
  }

  const keycodes: number[][][] = [];
  for (let layer = 0; layer < dimensions.layerCount; layer += 1) {
    const layerRows: number[][] = [];
    for (let row = 0; row < dimensions.rows; row += 1) {
      const rowKeycodes: number[] = [];
      for (let column = 0; column < dimensions.columns; column += 1) {
        rowKeycodes.push(await protocol.getKeycode(layer, row, column));
      }
      layerRows.push(rowKeycodes);
    }
    keycodes.push(layerRows);
  }
  return { layerCount: observedLayerCount, keycodes };
}

function requestRead(
  transport: ViaReadTransport,
  command: number,
  payload: readonly number[],
  timeoutMs: number,
): Promise<Uint8Array> {
  const request = new Uint8Array(VIA_REPORT_LENGTH);
  request[0] = command;
  request.set(payload, 1);

  return requestReport(
    transport,
    VIA_REPORT_ID,
    request,
    (response) =>
      response.byteLength === VIA_REPORT_LENGTH && matchesRequest(response, command, payload),
    ViaReadProtocolError,
    timeoutMs,
  );
}

function matchesRequest(response: Uint8Array, command: number, payload: readonly number[]): boolean {
  return response[0] === command && payload.every((value, index) => response[index + 1] === value);
}

function hasExpectedPayloadShape(command: number, payload: readonly number[]): boolean {
  switch (command) {
    case GET_PROTOCOL_VERSION:
    case DYNAMIC_KEYMAP_MACRO_GET_COUNT:
    case DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE:
    case DYNAMIC_KEYMAP_GET_LAYER_COUNT:
      return payload.length === 0;
    case GET_KEYBOARD_VALUE:
      return isKeyboardValueRequest(payload);
    case DYNAMIC_KEYMAP_GET_KEYCODE:
      return payload.length === 3;
    case CUSTOM_GET_VALUE:
      return payload.length === 2 && isValidCustomValueSelection({
        channel: payload[0]!,
        valueId: payload[1]!,
      });
    case DYNAMIC_KEYMAP_MACRO_GET_BUFFER:
    case DYNAMIC_KEYMAP_GET_BUFFER:
      return payload.length === 3 && isBufferReadSize(payload[2]!);
    case DYNAMIC_KEYMAP_GET_ENCODER:
      return payload.length === 3 && (payload[2] === 0 || payload[2] === 1);
    default:
      return false;
  }
}

function isKeyboardValueRequest(payload: readonly number[]): boolean {
  if (payload[0] === KEYBOARD_VALUE_SWITCH_MATRIX_STATE) {
    return payload.length === 2;
  }
  return payload.length === 1 && [
    KEYBOARD_VALUE_UPTIME,
    KEYBOARD_VALUE_LAYOUT_OPTIONS,
    KEYBOARD_VALUE_FIRMWARE_VERSION,
    KEYBOARD_VALUE_KEYCODES_VERSION,
  ].includes(payload[0]!);
}

function isValidCustomValueSelection(selection: { channel: number; valueId: number }): boolean {
  if (!isByte(selection.channel) || !isByte(selection.valueId)) {
    return false;
  }
  switch (selection.channel) {
    case 0:
      return true;
    case 1:
    case 4:
      return selection.valueId === 1 || selection.valueId === 2;
    case 2:
    case 3:
      return selection.valueId >= 1 && selection.valueId <= 4;
    case 5:
      return selection.valueId >= 1 && selection.valueId <= 3;
    default:
      return false;
  }
}

function boundedTimeoutMs(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new ViaReadProtocolError("invalid-timeout");
  }
  return value;
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

function isDimension(value: number): boolean {
  return isByte(value) && value > 0;
}

function isUint16(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff;
}

function isBufferReadSize(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_BUFFER_READ_SIZE;
}

function readUint16(response: Uint8Array, offset: number): number {
  return (response[offset]! << 8) | response[offset + 1]!;
}

// VIA macro buffer encoding (from `the-via/app` macro-api): macros are
// NUL-terminated byte sequences. A key action is a prefix byte (`0x01` tap,
// `0x02` down, `0x03` up) followed by one basic keycode byte; any other byte
// is a literal character typed by the macro.
const MACRO_ACTION_TAP = 0x01;
const MACRO_ACTION_DOWN = 0x02;
const MACRO_ACTION_UP = 0x03;
const MACRO_ACTION_PREFIXES = new Set([MACRO_ACTION_TAP, MACRO_ACTION_DOWN, MACRO_ACTION_UP]);

export type ViaMacroStep =
  | { kind: "tap" | "down" | "up"; keycode: number }
  | { kind: "char"; char: string };

export type ViaMacros = {
  count: number;
  bufferSize: number;
  macros: ViaMacroStep[][];
};

/**
 * Reads every VIA macro from the dynamic keymap macro buffer and decodes it
 * into tap/down/up keycode steps and literal characters. This surfaces the
 * custom key combos and shortcuts a user configured in VIA before ever using
 * QMKUI.
 */
export async function readViaMacros(
  protocol: ViaReadProtocol,
  options: { maxChunkSize?: number } = {},
): Promise<ViaMacros> {
  const maxChunkSize = options.maxChunkSize ?? MAX_BUFFER_READ_SIZE;
  const count = await protocol.getMacroCount();
  if (count === 0) {
    return { count, bufferSize: 0, macros: [] };
  }
  const bufferSize = await protocol.getMacroBufferSize();
  if (bufferSize === 0) {
    return { count, bufferSize, macros: [] };
  }

  const bytes: number[] = [];
  for (let offset = 0; offset < bufferSize; offset += maxChunkSize) {
    const size = Math.min(maxChunkSize, bufferSize - offset);
    const chunk = await protocol.getMacroBuffer(offset, size);
    bytes.push(...Array.from(chunk.bytes));
  }

  return { count, bufferSize, macros: decodeMacroBuffer(bytes, count) };
}

function decodeMacroBuffer(bytes: readonly number[], count: number): ViaMacroStep[][] {
  const macros: ViaMacroStep[][] = [];
  let current: ViaMacroStep[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    if (byte === 0) {
      if (current.length > 0) {
        macros.push(current);
        current = [];
      }
      if (macros.length >= count) {
        break;
      }
      continue;
    }
    if (MACRO_ACTION_PREFIXES.has(byte)) {
      const keycode = bytes[index + 1];
      if (keycode === undefined) {
        break;
      }
      const kind = byte === MACRO_ACTION_TAP ? "tap" : byte === MACRO_ACTION_DOWN ? "down" : "up";
      current.push({ kind, keycode });
      index += 1;
    } else {
      current.push({ kind: "char", char: String.fromCharCode(byte) });
    }
  }
  if (current.length > 0) {
    macros.push(current);
  }
  return macros;
}

function readUint32(response: Uint8Array, offset: number): number {
  return (
    response[offset]! * 0x1_0000_00 +
    response[offset + 1]! * 0x1_0000 +
    response[offset + 2]! * 0x100 +
    response[offset + 3]!
  );
}
