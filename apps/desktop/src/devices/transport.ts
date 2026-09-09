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
  const wrappedListeners = new WeakMap<
    (event: HidInputReport) => void,
    (event: { reportId: number; data: DataView }) => void
  >();

  const wrap = (listener: (event: HidInputReport) => void) => {
    let wrapped = wrappedListeners.get(listener);
    if (!wrapped) {
      wrapped = (event) => listener({ reportId: event.reportId, data: event.data });
      wrappedListeners.set(listener, wrapped);
    }
    return wrapped;
  };

  return {
    get opened() {
      return device.opened;
    },
    open: () => device.open(),
    close: () => device.close(),
    sendReport: (reportId, data) => device.sendReport(reportId, data),
    addEventListener: (type, listener) => {
      device.addEventListener(type, wrap(listener));
    },
    removeEventListener: (type, listener) => {
      const wrapped = wrappedListeners.get(listener);
      if (wrapped) {
        device.removeEventListener(type, wrapped);
      }
    },
  };
}
