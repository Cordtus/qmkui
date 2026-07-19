import { describe, expect, it, vi } from "vitest";
import {
  chooseBrowserKeyboard,
  discoverAuthorizedBrowserKeyboard,
} from "./browserKeyboardDiscovery";
import type { KeychronV5MaxReaderDevice } from "./keychronV5MaxReader";

const exactV5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  productName: "Keychron V5 Max",
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("browser keyboard discovery", () => {
  it("recognizes an already-authorized exact V5 Max without opening it or sending a report", async () => {
    const device = {
      ...exactV5MaxAnsiKnob,
      open: vi.fn(),
      sendReport: vi.fn(),
      receiveFeatureReport: vi.fn(),
    };

    const requestDevice = vi.fn(async () => []);
    const result = await discoverAuthorizedBrowserKeyboard({
      hid: { getDevices: async () => [device], requestDevice },
    });

    expect(result).toMatchObject({
      state: "selected",
      identity: exactV5MaxAnsiKnob,
      contract: {
        state: "partial",
        capabilities: { protocolVersion: true, read: true, write: false, flash: false },
      },
    });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("reads the current V5 state only when its explicit session method is invoked", async () => {
    const device = createTranscriptDevice();
    const result = await discoverAuthorizedBrowserKeyboard({
      hid: { getDevices: async () => [device], requestDevice: async () => [] },
    });

    if (result.state !== "selected" || result.contract.state !== "partial" || !("session" in result)) {
      throw new Error("expected a recognized V5 Max session");
    }

    expect(result.session.capabilities).toEqual({ canRead: true, canWrite: false, canFlash: false });
    expect(sentCommands(device)).toEqual([]);

    const snapshot = await result.session.readSnapshot();

    expect(snapshot.identity).toEqual({
      state: "available",
      value: {
        model: "Keychron V5 Max ANSI Knob",
        protocolVersion: [0x02, 0x00, 0x02],
        firmwareVersion: "v1.0.0",
        defaultLayer: 2,
      },
    });
    expect(snapshot.capabilities).toEqual({
      state: "available",
      value: { featureBitmap: [0x00, 0x81] },
    });
    expect(snapshot.keymap).toEqual({
      state: "unavailable",
      reason: "No verified V5 Max matrix dimensions were supplied.",
    });
    expect(snapshot.lighting).toMatchObject({
      state: "available",
      value: { rgbProtocol: [0x01, 0x00], indicators: [0x11], ledCount: 0 },
    });
    expect(sentCommands(device)).toEqual([
      [0xa0],
      [0xa1],
      [0xa3],
      [0xa2],
      [0xa8, 0x01],
      [0xa8, 0x03],
      [0xa8, 0x05],
    ]);
    expect(device.open).toHaveBeenCalledOnce();
    expect(device.close).toHaveBeenCalledOnce();
  });

  it("preserves a failed live read rather than replacing it with a static default", async () => {
    const device = { ...exactV5MaxAnsiKnob };
    const failedLiveRead = {
      identity: { state: "unverified" as const, reason: "Firmware version response is not printable ASCII." },
      capabilities: { state: "unavailable" as const, reason: "Feature bitmap read failed: timeout." },
      keymap: { state: "unavailable" as const, reason: "Dynamic keymap read failed: timeout." },
      lighting: { state: "unavailable" as const, reason: "RGB state read failed: timeout." },
      readAt: "2026-07-18T18:00:00.000Z",
    };
    const readSnapshot = vi.fn(async () => failedLiveRead);
    const result = await discoverAuthorizedBrowserKeyboard(
      { hid: { getDevices: async () => [device], requestDevice: async () => [] } },
      { readSnapshot },
    );

    if (result.state !== "selected" || result.contract.state !== "partial" || !("session" in result)) {
      throw new Error("expected a recognized V5 Max session");
    }

    await expect(result.session.readSnapshot()).resolves.toEqual(failedLiveRead);
    expect(readSnapshot).toHaveBeenCalledWith(device);
  });

  it("returns a neutral unsupported selection without issuing model-specific I/O", async () => {
    const device = {
      vendorId: 0xfeed,
      productId: 0xbeef,
      productName: "Example keyboard",
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      open: vi.fn(),
      sendReport: vi.fn(),
      receiveFeatureReport: vi.fn(),
    };

    await expect(
      discoverAuthorizedBrowserKeyboard({
        hid: {
          getDevices: async () => [device],
          requestDevice: async () => [],
        },
      }),
    ).resolves.toEqual({
      state: "selected",
      identity: {
        vendorId: 0xfeed,
        productId: 0xbeef,
        collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      },
      contract: { state: "unsupported" },
    });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
  });

  it("does not infer a catalog model for an unsupported keyboard", async () => {
    const device = {
      vendorId: 0x3434,
      productId: 0x0913,
      productName: "Keychron V1 Max",
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      open: vi.fn(),
      sendReport: vi.fn(),
      receiveFeatureReport: vi.fn(),
    };
    const requestDevice = vi.fn(async () => []);

    const result = await discoverAuthorizedBrowserKeyboard({
      hid: { getDevices: async () => [device], requestDevice },
    });

    expect(result).toMatchObject({
      state: "selected",
      contract: { state: "unsupported" },
      identity: {
        vendorId: 0x3434,
        productId: 0x0913,
        collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      },
    });
    expect("session" in result).toBe(false);
    expect(requestDevice).not.toHaveBeenCalled();
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
  });

  it("uses a generic user chooser and prefers the exact supported keyboard among selected HID interfaces", async () => {
    const unsupported = {
      vendorId: 0xfeed,
      productId: 0xbeef,
      productName: "Example keyboard",
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
    };
    const requestDevice = vi.fn(async () => [unsupported, exactV5MaxAnsiKnob]);

    const result = await chooseBrowserKeyboard({ hid: { getDevices: async () => [], requestDevice } });

    expect(requestDevice).toHaveBeenCalledWith({ filters: [] });
    expect(result).toMatchObject({
      state: "selected",
      identity: exactV5MaxAnsiKnob,
      contract: { state: "partial" },
    });
  });

  it("distinguishes no previously authorized keyboard from an unavailable browser", async () => {
    await expect(
      discoverAuthorizedBrowserKeyboard({
        hid: { getDevices: async () => [], requestDevice: async () => [] },
      }),
    ).resolves.toEqual({ state: "no-authorized-device" });
    await expect(discoverAuthorizedBrowserKeyboard({})).resolves.toEqual({ state: "unavailable" });
  });

  it("refreshes only through an explicit read call and never sends a write command", async () => {
    const device = { ...exactV5MaxAnsiKnob, sendReport: vi.fn() };
    const readSnapshot = vi.fn(async () => ({
      identity: { state: "unavailable" as const, reason: "transport unavailable" },
      capabilities: { state: "unavailable" as const, reason: "transport unavailable" },
      keymap: { state: "unavailable" as const, reason: "transport unavailable" },
      lighting: { state: "unavailable" as const, reason: "transport unavailable" },
      readAt: "2026-07-18T18:00:00.000Z",
    }));
    const result = await discoverAuthorizedBrowserKeyboard(
      { hid: { getDevices: async () => [device], requestDevice: async () => [] } },
      { readSnapshot },
    );

    if (result.state !== "selected" || result.contract.state !== "partial" || !("session" in result)) {
      throw new Error("expected a recognized V5 Max session");
    }

    expect(readSnapshot).not.toHaveBeenCalled();
    await result.session.readSnapshot();
    await result.session.readSnapshot();

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(readSnapshot).toHaveBeenNthCalledWith(1, device);
    expect(readSnapshot).toHaveBeenNthCalledWith(2, device);
    expect(device.sendReport).not.toHaveBeenCalled();
  });
});

function createTranscriptDevice(): KeychronV5MaxReaderDevice & {
  emit: (event: { reportId: number; data: Uint8Array }) => void;
} {
  const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
  const device: KeychronV5MaxReaderDevice & {
    emit: (event: { reportId: number; data: Uint8Array }) => void;
  } = {
    ...exactV5MaxAnsiKnob,
    opened: false,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    sendReport: vi.fn(async (_reportId: number, data: BufferSource) => {
      const request = new Uint8Array(data as ArrayBuffer);
      const response = responseFor(request);
      if (response) device.emit({ reportId: 0, data: response });
    }),
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    emit: (event) => listeners.forEach((listener) => listener(event)),
  };
  return device;
}

function responseFor(request: Uint8Array): Uint8Array | undefined {
  if (request[0] === 0xa0) return report([0xa0, 0x02, 0x00, 0x02]);
  if (request[0] === 0xa1) return report([0xa1, ...ascii("v1.0.0")]);
  if (request[0] === 0xa2) return report([0xa2, 0x00, 0x81]);
  if (request[0] === 0xa3) return report([0xa3, 0x02]);
  if (request[0] !== 0xa8) return undefined;
  if (request[1] === 0x01) return report([0xa8, 0x01, 0x01, 0x00]);
  if (request[1] === 0x03) return report([0xa8, 0x03, 0x11]);
  if (request[1] === 0x05) return report([0xa8, 0x05, 0]);
  return undefined;
}

function report(bytes: number[]): Uint8Array {
  const result = new Uint8Array(32);
  result.set(bytes);
  return result;
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function sentCommands(device: KeychronV5MaxReaderDevice): number[][] {
  return (device.sendReport as ReturnType<typeof vi.fn>).mock.calls.map(([, data]) => {
    const frame = new Uint8Array(data as ArrayBuffer);
    return [...frame.slice(0, frame[0] === 0xa8 ? 4 : 1)].filter((_, index) => index === 0 || frame[index] !== 0);
  });
}
