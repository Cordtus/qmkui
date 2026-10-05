import writeCommands from "../../../../fixtures/protocol/write-commands.json";
import type { ViaReadTransport } from "./viaReadProtocol";
import { requestReport } from "./transport";

const SET_KEYCODE = writeCommands.viaWriteCommands.setKeycode;
const SET_CUSTOM_VALUE = writeCommands.viaWriteCommands.setCustomValue;
const SAVE_EEPROM = writeCommands.viaWriteCommands.saveEeprom;
const REPORT_LENGTH = 32;
const DEFAULT_TIMEOUT_MS = 1_000;

// VIA channel and value ids (`quantum/via.h`). The RGB-matrix channel is global
// (brightness/effect/effect-speed/color); VIA has no per-key/per-LED command.
export const RGB_MATRIX_CHANNEL = 3;
export const RGB_MATRIX_BRIGHTNESS = 1;
export const RGB_MATRIX_EFFECT = 2;
export const RGB_MATRIX_EFFECT_SPEED = 3;
export const RGB_MATRIX_COLOR = 4;

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

  /**
   * Sets a VIA custom channel value (`id_custom_set_value`, 0x07), framed as
   * `[command, channel, value_id, ...bytes]`. This is the same frame VIA's own
   * configurator emits for lighting; it persists only after {@link saveEeprom}.
   */
  setCustomValue(channel: number, valueId: number, bytes: readonly number[]): Promise<void> {
    return this.write(SET_CUSTOM_VALUE, [channel, valueId, ...bytes]);
  }

  /** Global RGB-matrix brightness (0-255). */
  setRgbMatrixBrightness(brightness: number): Promise<void> {
    return this.setCustomValue(RGB_MATRIX_CHANNEL, RGB_MATRIX_BRIGHTNESS, [brightness]);
  }

  /** Global RGB-matrix effect id. */
  setRgbMatrixEffect(effect: number): Promise<void> {
    return this.setCustomValue(RGB_MATRIX_CHANNEL, RGB_MATRIX_EFFECT, [effect]);
  }

  /** Global RGB-matrix effect speed (0-255). */
  setRgbMatrixEffectSpeed(speed: number): Promise<void> {
    return this.setCustomValue(RGB_MATRIX_CHANNEL, RGB_MATRIX_EFFECT_SPEED, [speed]);
  }

  /** Global RGB-matrix colour as VIA hue/saturation bytes (each 0-255). */
  setRgbMatrixColor(hue: number, saturation: number): Promise<void> {
    return this.setCustomValue(RGB_MATRIX_CHANNEL, RGB_MATRIX_COLOR, [hue, saturation]);
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
