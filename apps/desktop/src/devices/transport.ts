/**
 * Device transport seam. Every HID reader (VIA, Keychron V5 Max, generic VIA)
 * operates on this shape; the browser build supplies a WebHID-backed transport
 * while the native Tauri build will supply a Rust `qmkui-hid` transport that
 * exposes the same interface. Nothing above `devices/transport.ts` touches
 * `navigator.hid` or any native handle directly.
 */

export type HidInputReport = {
  reportId: number;
  data: ArrayBuffer | ArrayBufferView;
};

export type DeviceTransport = {
  opened: boolean;
  open: () => Promise<void>;
  close: () => Promise<void>;
  sendReport: (reportId: number, data: BufferSource) => Promise<void>;
  addEventListener: (
    type: "inputreport",
    listener: (event: HidInputReport) => void,
  ) => void;
  removeEventListener: (
    type: "inputreport",
    listener: (event: HidInputReport) => void,
  ) => void;
};

export type WebHidDevice = {
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  addEventListener(
    type: "inputreport",
    listener: (event: {
      reportId: number;
      data: DataView;
    }) => void,
  ): void;
  removeEventListener(
    type: "inputreport",
    listener: (event: {
      reportId: number;
      data: DataView;
    }) => void,
  ): void;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string;
  readonly collections: readonly { usagePage: number; usage: number }[];
};

export function createWebHidTransport(device: WebHidDevice): DeviceTransport {
  return {
    get opened() {
      return device.opened;
    },
    open: () => device.open(),
    close: () => device.close(),
    sendReport: (reportId, data) => device.sendReport(reportId, data),
    addEventListener: (type, listener) => {
      device.addEventListener(type, listener);
    },
    removeEventListener: (type, listener) => {
      device.removeEventListener(type, listener);
    },
  };
}

/** Opens a device only if QMKUI is the one opening it, then always closes it. */
export async function withOpen<Value>(
  device: Pick<DeviceTransport, "opened" | "open" | "close">,
  run: () => Promise<Value>,
): Promise<Value> {
  const openedByQmkui = !device.opened;
  if (openedByQmkui) {
    await device.open();
  }
  try {
    return await run();
  } finally {
    if (openedByQmkui) {
      await device.close();
    }
  }
}

type ReportTransport = Pick<
  DeviceTransport,
  "sendReport" | "addEventListener" | "removeEventListener"
>;

/**
 * Sends one report and resolves with the matching input response, ignoring
 * unmatched reports until `timeoutMs` elapses. `matches` receives a normalized
 * view of each response for this reader's report ID.
 */
export function requestReport(
  transport: ReportTransport,
  reportId: number,
  request: Uint8Array<ArrayBuffer>,
  matches: (response: Uint8Array) => boolean,
  ErrorCtor: new (code: "timeout" | "transport") => Error,
  timeoutMs: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: Uint8Array | Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      transport.removeEventListener("inputreport", onInputReport);
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    };
    const onInputReport = (event: HidInputReport) => {
      if (event.reportId !== reportId) {
        return;
      }
      const response = normalizeReportData(event.data);
      if (!response || !matches(response)) {
        return;
      }
      finish(response);
    };
    const timeout = setTimeout(() => finish(new ErrorCtor("timeout")), timeoutMs);

    transport.addEventListener("inputreport", onInputReport);
    try {
      Promise.resolve(transport.sendReport(reportId, request)).catch(() =>
        finish(new ErrorCtor("transport")),
      );
    } catch {
      finish(new ErrorCtor("transport"));
    }
  });
}

function normalizeReportData(data: ArrayBuffer | ArrayBufferView): Uint8Array | undefined {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return undefined;
}
