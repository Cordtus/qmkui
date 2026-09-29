import {
  classifyKeychronV5MaxIdentity,
  type HidIdentityMetadata,
} from "./keychronV5MaxContract";
import { withOpen, type DeviceTransport } from "./transport";

const PROTOCOL_VERSION_COMMAND = 0x01;
const PROTOCOL_VERSION_RESPONSE_LENGTH = 32;
const OBSERVED_PROTOCOL_VERSION = 0x000c;
const DEFAULT_TIMEOUT_MS = 1_000;

type InputReport = {
  reportId: number;
  data: ArrayBuffer | ArrayBufferView;
};

export type KeychronV5MaxProtocolDevice = DeviceTransport & HidIdentityMetadata;

export type KeychronV5MaxProtocolVersion = {
  version: 0x000c;
};

export class KeychronV5MaxProtocolError extends Error {
  constructor(
    readonly code:
      | "identity"
      | "report-id"
      | "report-length"
      | "report-command"
      | "unsupported-version"
      | "timeout",
  ) {
    super(`Keychron V5 Max protocol check failed: ${code}`);
    this.name = "KeychronV5MaxProtocolError";
  }
}

export async function verifyKeychronV5MaxProtocolVersion(
  device: KeychronV5MaxProtocolDevice,
  options: { timeoutMs?: number } = {},
): Promise<KeychronV5MaxProtocolVersion> {
  if (classifyKeychronV5MaxIdentity(device).state !== "partial") {
    throw new KeychronV5MaxProtocolError("identity");
  }

  return withOpen(device, () =>
    requestProtocolVersion(device, options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  );
}

function requestProtocolVersion(
  device: KeychronV5MaxProtocolDevice,
  timeoutMs: number,
): Promise<KeychronV5MaxProtocolVersion> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: KeychronV5MaxProtocolVersion | KeychronV5MaxProtocolError) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      device.removeEventListener("inputreport", onInputReport);
      if (result instanceof KeychronV5MaxProtocolError) {
        reject(result);
      } else {
        resolve(result);
      }
    };
    const onInputReport = (event: InputReport) => {
      const data = toDataView(event.data);
      if (event.reportId !== 0) {
        finish(new KeychronV5MaxProtocolError("report-id"));
        return;
      }
      if (data.byteLength !== PROTOCOL_VERSION_RESPONSE_LENGTH) {
        finish(new KeychronV5MaxProtocolError("report-length"));
        return;
      }
      if (data.getUint8(0) !== PROTOCOL_VERSION_COMMAND) {
        finish(new KeychronV5MaxProtocolError("report-command"));
        return;
      }
      if (data.getUint16(1) !== OBSERVED_PROTOCOL_VERSION) {
        finish(new KeychronV5MaxProtocolError("unsupported-version"));
        return;
      }
      finish({ version: OBSERVED_PROTOCOL_VERSION });
    };
    const timeout = setTimeout(() => finish(new KeychronV5MaxProtocolError("timeout")), timeoutMs);
    const request = new Uint8Array(PROTOCOL_VERSION_RESPONSE_LENGTH);
    request[0] = PROTOCOL_VERSION_COMMAND;

    device.addEventListener("inputreport", onInputReport);
    device.sendReport(0, request).catch(() => finish(new KeychronV5MaxProtocolError("timeout")));
  });
}

function toDataView(data: ArrayBuffer | ArrayBufferView): DataView {
  if (data instanceof ArrayBuffer) {
    return new DataView(data);
  }
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
