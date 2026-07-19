const VIA_REPORT_ID = 0;
const VIA_REPORT_LENGTH = 32;
const DYNAMIC_KEYMAP_GET_KEYCODE = 0x04;
const DYNAMIC_KEYMAP_GET_LAYER_COUNT = 0x11;
const DEFAULT_TIMEOUT_MS = 1_000;
// A VIA read must always settle promptly; ten seconds is the largest supported wait.
const MAX_TIMEOUT_MS = 10_000;

const READ_ONLY_COMMANDS = new Set<number>([
  DYNAMIC_KEYMAP_GET_KEYCODE,
  DYNAMIC_KEYMAP_GET_LAYER_COUNT,
]);

export type ViaInputReportData = ArrayBuffer | ArrayBufferView;

export type ViaReadTransport = {
  sendReport: (reportId: number, data: BufferSource) => Promise<void>;
  addEventListener: (
    type: "inputreport",
    listener: (event: { reportId: number; data: ViaInputReportData }) => void,
  ) => void;
  removeEventListener: (
    type: "inputreport",
    listener: (event: { reportId: number; data: ViaInputReportData }) => void,
  ) => void;
};

export type ViaKeymap = {
  layerCount: number;
  keycodes: number[][][];
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
 * A deliberately narrow VIA adapter. Its command allow-list contains only
 * dynamic keymap reads, so this module cannot emit write, reset, default, or
 * firmware commands.
 */
export class ViaReadProtocol {
  private pending = false;

  constructor(
    private readonly transport: ViaReadTransport,
    private readonly options: { timeoutMs?: number } = {},
  ) {}

  async read(command: number, payload: readonly number[] = []): Promise<Uint8Array> {
    if (!READ_ONLY_COMMANDS.has(command)) {
      throw new ViaReadProtocolError("command-not-allowed");
    }
    if (!isByte(command) || !hasExpectedPayloadShape(command, payload) || !payload.every(isByte)) {
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
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: Uint8Array | ViaReadProtocolError) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      transport.removeEventListener("inputreport", onInputReport);
      if (result instanceof ViaReadProtocolError) {
        reject(result);
      } else {
        resolve(result);
      }
    };
    const onInputReport = (event: { reportId: number; data: ViaInputReportData }) => {
      if (event.reportId !== VIA_REPORT_ID) {
        return;
      }
      const response = normalizeReportData(event.data);
      if (!response || response.byteLength !== VIA_REPORT_LENGTH || !matchesRequest(response, command, payload)) {
        return;
      }
      finish(response);
    };
    const timeout = setTimeout(() => finish(new ViaReadProtocolError("timeout")), timeoutMs);
    const request = new Uint8Array(VIA_REPORT_LENGTH);
    request[0] = command;
    request.set(payload, 1);

    transport.addEventListener("inputreport", onInputReport);
    try {
      Promise.resolve(transport.sendReport(VIA_REPORT_ID, request)).catch(() =>
        finish(new ViaReadProtocolError("transport")),
      );
    } catch {
      finish(new ViaReadProtocolError("transport"));
    }
  });
}

function matchesRequest(response: Uint8Array, command: number, payload: readonly number[]): boolean {
  if (response[0] !== command) {
    return false;
  }
  return command !== DYNAMIC_KEYMAP_GET_KEYCODE || payload.every((value, index) => response[index + 1] === value);
}

function hasExpectedPayloadShape(command: number, payload: readonly number[]): boolean {
  if (command === DYNAMIC_KEYMAP_GET_LAYER_COUNT) {
    return payload.length === 0;
  }
  return command === DYNAMIC_KEYMAP_GET_KEYCODE && payload.length === 3;
}

function boundedTimeoutMs(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new ViaReadProtocolError("invalid-timeout");
  }
  return value;
}

function normalizeReportData(data: ViaInputReportData): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return undefined;
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

function isDimension(value: number): boolean {
  return isByte(value) && value > 0;
}
