import writeCommands from "../../../../fixtures/protocol/write-commands.json";
import type { ViaInputReportData, ViaReadTransport } from "./viaReadProtocol";

const SET_KEYCODE = writeCommands.viaWriteCommands.setKeycode;
const SAVE_EEPROM = writeCommands.viaWriteCommands.saveEeprom;
const REPORT_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 1_000;

export class ViaWriteProtocolError extends Error {
  constructor(
    readonly code: "command-not-allowed" | "invalid-request" | "timeout" | "transport" | "response-mismatch",
  ) {
    super(`VIA write protocol failed: ${code}`);
    this.name = "ViaWriteProtocolError";
  }
}

/**
 * Gated VIA write adapter. Only commands in the explicit write allow-list
 * (`fixtures/protocol/write-commands.json`) can be emitted; operator consent
 * and target validation are enforced above this layer.
 */
export class ViaWriteProtocol {
  constructor(
    private readonly transport: ViaReadTransport,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  setKeycode(layer: number, row: number, col: number, keycode: number): Promise<void> {
    return this.write(SET_KEYCODE, [layer, row, col, (keycode >> 8) & 0xff, keycode & 0xff]);
  }

  saveEeprom(): Promise<void> {
    return this.write(SAVE_EEPROM, []);
  }

  private write(command: number, payload: readonly number[]): Promise<void> {
    if (!isAllowedWriteCommand(command)) {
      return Promise.reject(new ViaWriteProtocolError("command-not-allowed"));
    }
    if (payload.length > REPORT_LENGTH - 1 || !payload.every(isByte)) {
      return Promise.reject(new ViaWriteProtocolError("invalid-request"));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error: ViaWriteProtocolError | null) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.transport.removeEventListener("inputreport", onInputReport);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const onInputReport = (event: { reportId: number; data: ViaInputReportData }) => {
        if (event.reportId !== 0) {
          return;
        }
        const response = normalizeReportData(event.data);
        if (!response || response.byteLength !== REPORT_LENGTH || response[0] !== command) {
          return;
        }
        finish(null);
      };
      const timeout = setTimeout(() => finish(new ViaWriteProtocolError("timeout")), this.timeoutMs);
      const request = new Uint8Array(REPORT_LENGTH);
      request[0] = command;
      request.set(payload, 1);

      this.transport.addEventListener("inputreport", onInputReport);
      try {
        Promise.resolve(this.transport.sendReport(0, request)).catch(() =>
          finish(new ViaWriteProtocolError("transport")),
        );
      } catch {
        finish(new ViaWriteProtocolError("transport"));
      }
    });
  }
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

function isAllowedWriteCommand(command: number): boolean {
  const allowed = Object.values(writeCommands.viaWriteCommands);
  return allowed.includes(command);
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}
