import { describe, expect, it, vi } from "vitest";
import {
  readKeychronV5MaxSnapshot,
  requestKeychronV5MaxRead,
  type KeychronV5MaxReaderDevice,
} from "./keychronV5MaxReader";

const exactV5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("Keychron V5 Max reader", () => {
  it("frames only read queries, decodes a recorded response, and batches per-key RGB colors at nine keys", async () => {
    const device = createTranscriptDevice();

    const snapshot = await readKeychronV5MaxSnapshot(device, {
      keymap: { layerCount: 1, rows: 1, columns: 1 },
      now: () => "2026-07-18T12:00:00.000Z",
    });

    expect(snapshot.identity).toEqual({
      state: "available",
      value: {
        model: "Keychron V5 Max ANSI Knob",
        protocolVersion: [0x02, 0x00, 0x02],
        firmwareVersion: "v1.0.0 2026-07-18",
        defaultLayer: 2,
      },
    });
    expect(snapshot.capabilities).toEqual({
      state: "available",
      value: { featureBitmap: [0x00, 0x81] },
    });
    expect(snapshot.keymap).toEqual({
      state: "available",
      value: { layerCount: 1, keycodes: [[[0x1234]]] },
    });
    expect(snapshot.lighting).toMatchObject({
      state: "available",
      value: {
        rgbProtocol: [0x01, 0x01, 0x00],
        indicators: [0x03, 0x11],
        ledCount: 10,
      },
    });
    if (snapshot.lighting.state !== "available") throw new Error("Expected RGB state");
    expect(snapshot.lighting.value.ledIndices).toHaveLength(10);
    expect(snapshot.lighting.value.effects).toHaveLength(10);
    expect(snapshot.lighting.value.colors).toHaveLength(10);
    expect(snapshot.lighting.value.ledIndices).toContainEqual({ led: 0, matrix: { row: 0, column: 0 } });
    expect(snapshot.lighting.value.effects).toContainEqual({ led: 0, effect: 1 });
    expect(snapshot.lighting.value.colors).toContainEqual({ led: 0, hue: 12, saturation: 240, value: 255 });
    expect(snapshot.lighting.value.colors).toContainEqual({ led: 9, hue: 21, saturation: 249, value: 255 });
    expect(snapshot.readAt).toBe("2026-07-18T12:00:00.000Z");
    expect(sent(device)).toEqual([
      [0xa0],
      [0xa1],
      [0xa3],
      [0xa2],
      [0x11],
      [0x04, 0, 0, 0],
      [0xa8, 0x01],
      [0xa8, 0x03],
      [0xa8, 0x05],
      ...Array.from({ length: 10 }, (_, led) => [[0xa8, 0x06, led], [0xa8, 0x07, led]]).flat(),
      [0xa8, 0x09, 0, 9],
      [0xa8, 0x09, 9, 1],
    ]);
    expect(device.open).toHaveBeenCalledOnce();
    expect(device.close).toHaveBeenCalledOnce();
    expect(device.listenerCount()).toBe(0);
  });

  it("returns an unverified firmware fact rather than decoding non-printable response bytes", async () => {
    const device = createTranscriptDevice({ firmware: [0xff, 0x00] });

    const snapshot = await readKeychronV5MaxSnapshot(device, {
      keymap: { layerCount: 1, rows: 1, columns: 1 },
    });

    expect(snapshot.identity).toEqual({
      state: "unverified",
      reason: "Firmware version response is not printable ASCII.",
    });
  });

  it("rejects a save/set command before it can reach HID", async () => {
    const device = createTranscriptDevice();

    await expect(requestKeychronV5MaxRead(device, 0xa4)).rejects.toMatchObject({
      code: "command-not-allowed",
    });

    expect(device.sendReport).not.toHaveBeenCalled();
  });

  it("rejects an unsupported RGB operation before it can reach HID", async () => {
    const device = createTranscriptDevice();

    await expect(requestKeychronV5MaxRead(device, 0xa8, [0x02])).rejects.toMatchObject({
      code: "rgb-operation-not-allowed",
    });

    expect(device.sendReport).not.toHaveBeenCalled();
  });

  it("ignores a cross-matched report until the exact vendor response arrives", async () => {
    const device = createDevice();
    const pending = requestKeychronV5MaxRead(device, 0xa8, [0x09, 0, 1]);

    device.emit(new Uint8Array(31));
    device.emit(report([0xa8, 0x09, 1, 1, 10, 20, 30]));
    expect(device.listenerCount()).toBe(1);
    device.emit(report([0xa8, 0x09, 0, 1, 10, 20, 30]));

    await expect(pending).resolves.toEqual(report([0xa8, 0x09, 0, 1, 10, 20, 30]));
    expect(device.listenerCount()).toBe(0);
  });

  it("bounds a vendor read timeout and removes its input listener", async () => {
    vi.useFakeTimers();
    const device = createDevice();
    const pending = requestKeychronV5MaxRead(device, 0xa0, [], { timeoutMs: 25 });
    const rejection = expect(pending).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(device.removeEventListener).toHaveBeenCalledWith("inputreport", expect.any(Function));
    expect(device.listenerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("rejects a concurrent snapshot before a second read can cross-match HID responses", async () => {
    const device = createDevice();
    device.sendReport = vi.fn((() => {
      throw new Error("HID unavailable");
    }) as unknown as KeychronV5MaxReaderDevice["sendReport"]);
    const first = readKeychronV5MaxSnapshot(device, { keymap: { layerCount: 1, rows: 1, columns: 1 } });

    await expect(
      readKeychronV5MaxSnapshot(device, { keymap: { layerCount: 1, rows: 1, columns: 1 } }),
    ).rejects.toMatchObject({ code: "concurrent-read" });

    await expect(first).resolves.toMatchObject({ identity: { state: "unavailable" } });
  });
});

function createTranscriptDevice(
  options: { firmware?: number[] } = {},
): KeychronV5MaxReaderDevice & { emit: (data: Uint8Array) => void; listenerCount: () => number } {
  const device = createDevice();
  const firmware = options.firmware ?? ascii("v1.0.0 2026-07-18");
  device.sendReport = vi.fn(async (_reportId: number, data: BufferSource) => {
    const request = new Uint8Array(data as ArrayBuffer);
    const response = responseFor(request, firmware);
    if (response) device.emit(response);
  });
  return device;
}

function responseFor(request: Uint8Array, firmware: number[]): Uint8Array | undefined {
  if (request[0] === 0xa0) return report([0xa0, 0x02, 0x00, 0x02]);
  if (request[0] === 0xa1) return report([0xa1, ...firmware]);
  if (request[0] === 0xa2) return report([0xa2, 0x00, 0x81]);
  if (request[0] === 0xa3) return report([0xa3, 0x02]);
  if (request[0] === 0x11) return report([0x11, 1]);
  if (request[0] === 0x04) return report([0x04, request[1]!, request[2]!, request[3]!, 0x12, 0x34]);
  if (request[0] !== 0xa8) return undefined;

  if (request[1] === 0x01) return report([0xa8, 0x01, 0x01, 0x00]);
  if (request[1] === 0x03) return report([0xa8, 0x03, 0x11]);
  if (request[1] === 0x05) return report([0xa8, 0x05, 10]);
  if (request[1] === 0x06) return report([0xa8, 0x06, request[2]!, 0, 0]);
  if (request[1] === 0x07) return report([0xa8, 0x07, request[2]!, 1]);
  if (request[1] === 0x09 && request[2] === 0) {
    return report([0xa8, 0x09, 0, 9, 12, 240, 255, 13, 241, 255, 14, 242, 255, 15, 243, 255, 16, 244, 255, 17, 245, 255, 18, 246, 255, 19, 247, 255, 20, 248, 255]);
  }
  if (request[1] === 0x09 && request[2] === 9) return report([0xa8, 0x09, 9, 1, 21, 249, 255]);
  return undefined;
}

function createDevice(): KeychronV5MaxReaderDevice & {
  emit: (data: Uint8Array) => void;
  listenerCount: () => number;
} {
  const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
  return {
    ...exactV5MaxAnsiKnob,
    opened: false,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    sendReport: vi.fn(async () => undefined),
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    emit: (data) => listeners.forEach((listener) => listener({ reportId: 0, data })),
    listenerCount: () => listeners.size,
  };
}

function report(bytes: number[]): Uint8Array {
  const value = new Uint8Array(32);
  value.set(bytes);
  return value;
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function sent(device: KeychronV5MaxReaderDevice): number[][] {
  return (device.sendReport as ReturnType<typeof vi.fn>).mock.calls.map(([, data]) => {
    const packet = new Uint8Array(data as ArrayBuffer);
    if (packet[0] === 0x04) return [...packet.slice(0, 4)];
    if (packet[0] === 0xa8) {
      return packet[1] === 0x06 || packet[1] === 0x07
        ? [...packet.slice(0, 3)]
        : packet[1] === 0x09
          ? [...packet.slice(0, 4)]
          : [...packet.slice(0, 2)];
    }
    return [packet[0]!];
  });
}
