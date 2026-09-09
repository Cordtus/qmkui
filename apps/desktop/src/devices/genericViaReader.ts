import { available, unavailable, unverified, type ValueState } from "./hardwareSnapshot";
import type { DeviceTransport } from "./transport";
import { ViaReadProtocol } from "./viaReadProtocol";

export type GenericViaReaderDevice = DeviceTransport;

export type GenericViaStandardState = {
  identity: ValueState<never>;
  protocolVersion: ValueState<number>;
  uptime: ValueState<number>;
  layoutOptions: ValueState<number>;
  firmwareVersion: ValueState<number>;
  keycodesVersion: ValueState<number>;
  layerCount: ValueState<number>;
  keymap: ValueState<never>;
  switchMatrix: ValueState<never>;
  lighting: {
    backlightEffect: ValueState<number>;
    backlightBrightness: ValueState<number>;
    rgblightEffect: ValueState<number>;
    rgblightHue: ValueState<number>;
    rgblightSaturation: ValueState<number>;
    rgblightValue: ValueState<number>;
    rgbMatrixEffect: ValueState<number>;
    rgbMatrixHue: ValueState<number>;
    rgbMatrixSaturation: ValueState<number>;
    rgbMatrixValue: ValueState<number>;
    ledMatrixEffect: ValueState<number>;
    ledMatrixBrightness: ValueState<number>;
  };
  readAt: string;
};

export type GenericViaReaderOptions = {
  protocolVersion: number;
  now?: () => string;
  timeoutMs?: number;
};

const UNKNOWN_DEFINITION = "No verified keyboard definition is available for this VIA device.";
const UNKNOWN_MATRIX_DIMENSIONS = "No verified matrix dimensions are available for this VIA device.";

/**
 * Reads only standard VIA/QMK state for a browser-authorized VIA device whose
 * keyboard definition is unknown. It deliberately cannot infer a model,
 * layout, key map, or vendor-specific lighting protocol.
 */
export async function readGenericViaStandardState(
  device: GenericViaReaderDevice,
  options: GenericViaReaderOptions,
): Promise<GenericViaStandardState> {
  const openedByQmkui = !device.opened;
  if (openedByQmkui) {
    await device.open();
  }

  try {
    const protocol = new ViaReadProtocol(device, { timeoutMs: options.timeoutMs });
    return {
      identity: unverified(UNKNOWN_DEFINITION),
      protocolVersion: available(options.protocolVersion),
      uptime: await standardValue("Uptime", () => protocol.getUptime()),
      layoutOptions: await standardValue("Layout options", () => protocol.getLayoutOptions()),
      firmwareVersion: await standardValue("Firmware version", () => protocol.getFirmwareVersion()),
      keycodesVersion: await standardValue("Keycodes version", () => protocol.getKeycodesVersion()),
      layerCount: await standardValue("Layer count", () => protocol.getLayerCount()),
      keymap: unverified(UNKNOWN_MATRIX_DIMENSIONS),
      switchMatrix: unverified(UNKNOWN_MATRIX_DIMENSIONS),
      lighting: {
        backlightEffect: await standardValue("Backlight effect", () => customByte(protocol, 1, 1)),
        backlightBrightness: await standardValue("Backlight brightness", () => customByte(protocol, 1, 2)),
        rgblightEffect: await standardValue("RGB light effect", () => customByte(protocol, 2, 1)),
        rgblightHue: await standardValue("RGB light hue", () => customByte(protocol, 2, 2)),
        rgblightSaturation: await standardValue("RGB light saturation", () => customByte(protocol, 2, 3)),
        rgblightValue: await standardValue("RGB light value", () => customByte(protocol, 2, 4)),
        rgbMatrixEffect: await standardValue("RGB matrix effect", () => customByte(protocol, 3, 1)),
        rgbMatrixHue: await standardValue("RGB matrix hue", () => customByte(protocol, 3, 2)),
        rgbMatrixSaturation: await standardValue("RGB matrix saturation", () => customByte(protocol, 3, 3)),
        rgbMatrixValue: await standardValue("RGB matrix value", () => customByte(protocol, 3, 4)),
        ledMatrixEffect: await standardValue("LED matrix effect", () => customByte(protocol, 4, 1)),
        ledMatrixBrightness: await standardValue("LED matrix brightness", () => customByte(protocol, 4, 2)),
      },
      readAt: (options.now ?? (() => new Date().toISOString()))(),
    };
  } finally {
    if (openedByQmkui) {
      await device.close();
    }
  }
}

async function standardValue<Value>(
  label: string,
  read: () => Promise<Value>,
): Promise<ValueState<Value>> {
  try {
    return available(await read());
  } catch (error) {
    return unavailable(`${label} read failed: ${failureCode(error)}.`);
  }
}

async function customByte(protocol: ViaReadProtocol, channel: 1 | 2 | 3 | 4, valueId: 1 | 2 | 3 | 4): Promise<number> {
  const value = await protocol.getCustomValue({ channel, valueId } as never);
  return value.bytes[0]!;
}

function failureCode(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^VIA read protocol failed: /, "") : "unknown error";
}
