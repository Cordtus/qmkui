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
        state: "via",
        capabilities: { protocolVersion: true, read: true, write: false, flash: false },
      },
    });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("uses the verified V5 definition dimensions to read the current keymap only when its explicit session method is invoked", async () => {
    const device = createTranscriptDevice();
    const result = await discoverAuthorizedBrowserKeyboard({
      hid: { getDevices: async () => [device], requestDevice: async () => [] },
    });

    if (result.state !== "selected" || result.contract.state !== "via" || !("session" in result)) {
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
    expect(snapshot.keymap.state).toBe("available");
    if (snapshot.keymap.state !== "available") throw new Error("expected an available keymap");
    expect(snapshot.keymap.value.layerCount).toBe(4);
    expect(snapshot.keymap.value.keycodes).toHaveLength(4);
    expect(snapshot.keymap.value.keycodes[0]).toHaveLength(6);
    expect(snapshot.keymap.value.keycodes[0]?.[0]).toHaveLength(19);
    expect(snapshot.keymap.value.keycodes[3]?.[5]?.[18]).toBe(0x1234);
    expect(snapshot.lighting).toMatchObject({
      state: "available",
      value: { brightness: 0, effect: 0, effectSpeed: 0, hue: 0, saturation: 0 },
    });
    expect(sentCommands(device).slice(0, 5)).toEqual([
      [0xa0],
      [0xa1],
      [0xa3],
      [0xa2],
      [0x11],
    ]);
    expect(sentCommands(device).filter(([command]) => command === 0x04)).toHaveLength(4 * 6 * 19);
    expect(sentCommands(device).slice(-5)).toEqual([
      [0x08, 0x03, 0x01],
      [0x08, 0x03, 0x02],
      [0x08, 0x03, 0x03],
      [0x08, 0x03, 0x04],
      [0x0c],
    ]);
    expect(snapshot.macros).toEqual({ state: "available", value: { count: 0, bufferSize: 0, macros: [] } });
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
      macros: { state: "unavailable" as const, reason: "Macro read failed: timeout." },
      readAt: "2026-07-18T18:00:00.000Z",
    };
    const readSnapshot = vi.fn(async () => failedLiveRead);
    const result = await discoverAuthorizedBrowserKeyboard(
      { hid: { getDevices: async () => [device], requestDevice: async () => [] } },
      { readSnapshot },
    );

    if (result.state !== "selected" || result.contract.state !== "via" || !("session" in result)) {
      throw new Error("expected a recognized V5 Max session");
    }

    await expect(result.session.readSnapshot()).resolves.toEqual(failedLiveRead);
    expect(readSnapshot).toHaveBeenCalledWith(device, {
      model: expect.objectContaining({ qmkKeyboard: "keychron/v5_max/ansi_encoder" }),
    });
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
        productName: "Example keyboard",
        collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      },
      contract: { state: "unsupported" },
    });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
  });

  it("confirms a generic VIA keyboard through standard protocol verification before standard-only reads", async () => {
    const device = createGenericViaDevice();
    const result = await discoverAuthorizedBrowserKeyboard({
      hid: { getDevices: async () => [device], requestDevice: async () => [] },
    });

    expect(result).toMatchObject({
      state: "selected",
      identity: {
        vendorId: 0xfeed,
        productId: 0xbeef,
        collections: [{ usagePage: 0xff60, usage: 0x0061 }],
      },
      contract: { state: "unverified-via" },
    });
    expect(sentCommands(device)).toEqual([]);

    const generic = result as unknown as {
      viaSession: {
        capabilities: { canRead: boolean; canWrite: boolean; canFlash: boolean };
        verifyProtocolVersion: () => Promise<{ version: number }>;
        readStandardState: () => Promise<{
          identity: { state: string; reason?: string };
          protocolVersion: { state: string; value?: number };
          uptime: { state: string; value?: number };
          keymap: { state: string; reason?: string };
          lighting: { rgbMatrixEffect: { state: string; value?: number } };
        }>;
      };
    };

    expect(generic.viaSession.capabilities).toEqual({ canRead: false, canWrite: false, canFlash: false });
    await expect(generic.viaSession.verifyProtocolVersion()).resolves.toEqual({ version: 0x000c });
    expect(sentCommands(device)).toEqual([[0x01]]);
    expect(generic.viaSession.capabilities).toEqual({ canRead: true, canWrite: false, canFlash: false });

    const snapshot = await generic.viaSession.readStandardState();

    expect(snapshot.protocolVersion).toEqual({ state: "available", value: 0x000c });
    expect(snapshot.uptime).toEqual({ state: "available", value: 0x12345678 });
    expect(snapshot.lighting.rgbMatrixEffect).toEqual({ state: "available", value: 7 });
    expect(snapshot.identity).toEqual({
      state: "unverified",
      reason: "No verified keyboard definition is available for this VIA device.",
    });
    expect(snapshot.keymap).toEqual({
      state: "unverified",
      reason: "No verified matrix dimensions are available for this VIA device.",
    });
    expect(sentCommands(device)).not.toContainEqual([0xa0]);
    expect(sentCommands(device).every(([command]) => command !== 0xa0 && command !== 0xa8)).toBe(true);
  });

  it("prefers a generic VIA raw-HID interface over an unrelated authorized HID device without probing either", async () => {
    const unrelated = {
      vendorId: 0xfeed,
      productId: 0x1111,
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      open: vi.fn(),
      sendReport: vi.fn(),
    };
    const genericVia = createGenericViaDevice();

    const result = await discoverAuthorizedBrowserKeyboard({
      hid: { getDevices: async () => [unrelated, genericVia], requestDevice: async () => [] },
    });

    expect(result).toMatchObject({
      state: "selected",
      identity: {
        vendorId: 0xfeed,
        productId: 0xbeef,
        collections: [{ usagePage: 0xff60, usage: 0x0061 }],
      },
      contract: { state: "unverified-via" },
    });
    expect("viaSession" in result).toBe(true);
    expect(unrelated.open).not.toHaveBeenCalled();
    expect(unrelated.sendReport).not.toHaveBeenCalled();
    expect(genericVia.open).not.toHaveBeenCalled();
    expect(genericVia.sendReport).not.toHaveBeenCalled();
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
      contract: { state: "via" },
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
      macros: { state: "unavailable" as const, reason: "transport unavailable" },
      readAt: "2026-07-18T18:00:00.000Z",
    }));
    const result = await discoverAuthorizedBrowserKeyboard(
      { hid: { getDevices: async () => [device], requestDevice: async () => [] } },
      { readSnapshot },
    );

    if (result.state !== "selected" || result.contract.state !== "via" || !("session" in result)) {
      throw new Error("expected a recognized V5 Max session");
    }

    expect(readSnapshot).not.toHaveBeenCalled();
    await result.session.readSnapshot();
    await result.session.readSnapshot();

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    const modelArg = {
      model: expect.objectContaining({ qmkKeyboard: "keychron/v5_max/ansi_encoder" }),
    };
    expect(readSnapshot).toHaveBeenNthCalledWith(1, device, modelArg);
    expect(readSnapshot).toHaveBeenNthCalledWith(2, device, modelArg);
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

function createGenericViaDevice(): KeychronV5MaxReaderDevice & {
  emit: (event: { reportId: number; data: Uint8Array }) => void;
} {
  const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
  const device: KeychronV5MaxReaderDevice & {
    emit: (event: { reportId: number; data: Uint8Array }) => void;
  } = {
    vendorId: 0xfeed,
    productId: 0xbeef,
    collections: [{ usagePage: 0xff60, usage: 0x0061 }],
    opened: false,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    sendReport: vi.fn(async (_reportId: number, data: BufferSource) => {
      const request = new Uint8Array(data as ArrayBuffer);
      const response = genericViaResponseFor(request);
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
  if (request[0] === 0x11) return report([0x11, 0x04]);
  if (request[0] === 0x04) {
    return report([0x04, request[1]!, request[2]!, request[3]!, 0x12, 0x34]);
  }
  if (request[0] === 0x0c) return report([0x0c, 0]);
  if (request[0] === 0x08 && request[1] === 0x03) {
    if (request[2] === 0x01) return report([0x08, 0x03, 0x01, 0]);
    if (request[2] === 0x02) return report([0x08, 0x03, 0x02, 0]);
    if (request[2] === 0x03) return report([0x08, 0x03, 0x03, 0]);
    if (request[2] === 0x04) return report([0x08, 0x03, 0x04, 0, 0]);
  }
  return undefined;
}

function genericViaResponseFor(request: Uint8Array): Uint8Array | undefined {
  if (request[0] === 0x01) return report([0x01, 0x00, 0x0c]);
  if (request[0] === 0x02 && request[1] === 0x01) return report([0x02, 0x01, 0x12, 0x34, 0x56, 0x78]);
  if (request[0] === 0x02 && request[1] === 0x02) return report([0x02, 0x02, 0, 0, 0, 3]);
  if (request[0] === 0x02 && request[1] === 0x04) return report([0x02, 0x04, 0, 0, 0, 9]);
  if (request[0] === 0x02 && request[1] === 0x06) return report([0x02, 0x06, 0, 0, 0, 2]);
  if (request[0] === 0x11) return report([0x11, 3]);
  if (request[0] === 0x08 && request[1] === 0x01 && request[2] === 0x01) return report([0x08, 0x01, 0x01, 4]);
  if (request[0] === 0x08 && request[1] === 0x01 && request[2] === 0x02) return report([0x08, 0x01, 0x02, 20]);
  if (request[0] === 0x08 && request[1] === 0x02) return report([0x08, 0x02, request[2]!, request[2]!]);
  if (request[0] === 0x08 && request[1] === 0x03) {
    // value ids: 1 brightness, 2 effect, 3 effect speed, 4 colour pair
    if (request[2] === 0x01) return report([0x08, 0x03, 0x01, 200]);
    if (request[2] === 0x02) return report([0x08, 0x03, 0x02, 7]);
    if (request[2] === 0x03) return report([0x08, 0x03, 0x03, 128]);
    if (request[2] === 0x04) return report([0x08, 0x03, 0x04, 40, 220]);
  }
  if (request[0] === 0x08 && request[1] === 0x04) return report([0x08, 0x04, request[2]!, request[2]!]);
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
    // Custom-get-value frames carry a channel and value id worth asserting on.
    return [...frame.slice(0, frame[0] === 0x08 ? 3 : 1)];
  });
}
