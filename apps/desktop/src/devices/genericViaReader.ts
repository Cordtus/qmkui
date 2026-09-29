import { available, unavailable, unverified, type ValueState } from "./hardwareSnapshot";
import { withOpen, type DeviceTransport } from "./transport";
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
  // Standard VIA lighting channels (`quantum/via.h`). An unsupported channel
  // answers VIA `id_unhandled` (0xff), which fails the read and surfaces as an
  // unavailable field rather than a bogus value.
  lighting: {
    backlightBrightness: ValueState<number>;
    backlightEffect: ValueState<number>;
    rgblightBrightness: ValueState<number>;
    rgblightEffect: ValueState<number>;
    rgblightEffectSpeed: ValueState<number>;
    rgblightHue: ValueState<number>;
    rgblightSaturation: ValueState<number>;
    rgbMatrixBrightness: ValueState<number>;
    rgbMatrixEffect: ValueState<number>;
    rgbMatrixEffectSpeed: ValueState<number>;
    rgbMatrixHue: ValueState<number>;
    rgbMatrixSaturation: ValueState<number>;
    ledMatrixBrightness: ValueState<number>;
    ledMatrixEffect: ValueState<number>;
    ledMatrixEffectSpeed: ValueState<number>;
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
  return withOpen(device, async () => {
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
        backlightBrightness: await standardValue("Backlight brightness", () => customByte(protocol, 1, 1)),
        backlightEffect: await standardValue("Backlight effect", () => customByte(protocol, 1, 2)),
        rgblightBrightness: await standardValue("RGB light brightness", () => customByte(protocol, 2, 1)),
        rgblightEffect: await standardValue("RGB light effect", () => customByte(protocol, 2, 2)),
        rgblightEffectSpeed: await standardValue("RGB light effect speed", () => customByte(protocol, 2, 3)),
        rgblightHue: await standardValue("RGB light hue", () => customPair(protocol, 2, 4, 0)),
        rgblightSaturation: await standardValue("RGB light saturation", () => customPair(protocol, 2, 4, 1)),
        rgbMatrixBrightness: await standardValue("RGB matrix brightness", () => customByte(protocol, 3, 1)),
        rgbMatrixEffect: await standardValue("RGB matrix effect", () => customByte(protocol, 3, 2)),
        rgbMatrixEffectSpeed: await standardValue("RGB matrix effect speed", () => customByte(protocol, 3, 3)),
        rgbMatrixHue: await standardValue("RGB matrix hue", () => customPair(protocol, 3, 4, 0)),
        rgbMatrixSaturation: await standardValue("RGB matrix saturation", () => customPair(protocol, 3, 4, 1)),
        ledMatrixBrightness: await standardValue("LED matrix brightness", () => customByte(protocol, 5, 1)),
        ledMatrixEffect: await standardValue("LED matrix effect", () => customByte(protocol, 5, 2)),
        ledMatrixEffectSpeed: await standardValue("LED matrix effect speed", () => customByte(protocol, 5, 3)),
      },
      readAt: (options.now ?? (() => new Date().toISOString()))(),
    };
  });
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

type LightingChannel = 1 | 2 | 3 | 5;

async function customByte(
  protocol: ViaReadProtocol,
  channel: LightingChannel,
  valueId: number,
): Promise<number> {
  const value = await protocol.getCustomValue({ channel, valueId } as never);
  return value.bytes[0]!;
}

/** Colour values are a hue/saturation pair in one response (value id 4). */
async function customPair(
  protocol: ViaReadProtocol,
  channel: LightingChannel,
  valueId: number,
  index: 0 | 1,
): Promise<number> {
  const value = await protocol.getCustomValue({ channel, valueId } as never);
  return value.bytes[index]!;
}

function failureCode(error: unknown): string {
  return error instanceof Error ? error.message.replace(/^VIA read protocol failed: /, "") : "unknown error";
}
