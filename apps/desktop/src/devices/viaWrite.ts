import writeCommands from "../../../../fixtures/protocol/write-commands.json";
import type { ViaReadTransport } from "./viaReadProtocol";
import { requestReport } from "./transport";

const SET_KEYCODE = writeCommands.viaWriteCommands.setKeycode;
const SAVE_EEPROM = writeCommands.viaWriteCommands.saveEeprom;
const REPORT_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 1_000;

export class ViaWriteProtocolError extends Error {
  constructor(
    readonly code: "command-not-allowed" | "invalid-request" | "timeout" | "transport",
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
    const request = new Uint8Array(REPORT_LENGTH);
    request[0] = command;
    request.set(payload, 1);

    return requestReport(
      this.transport,
      0,
      request,
      (response) => response.byteLength === REPORT_LENGTH && response[0] === command,
      ViaWriteProtocolError,
      this.timeoutMs,
    ).then(() => undefined);
  }
}

function isAllowedWriteCommand(command: number): boolean {
  const allowed = Object.values(writeCommands.viaWriteCommands);
  return allowed.includes(command);
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}
