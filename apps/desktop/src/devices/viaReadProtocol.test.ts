import { describe, expect, it, vi } from "vitest";
import {
  ViaReadProtocol,
  readViaKeymap,
  type ViaReadTransport,
} from "./viaReadProtocol";

describe("VIA read protocol", () => {
  it("frames a 32-byte layer-count read and decodes its response", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    const layerCount = protocol.getLayerCount();

    expect(transport.sendReport).toHaveBeenCalledWith(0, report([0x11]));
    transport.emit({ reportId: 0, data: report([0x11, 4]) });

    await expect(layerCount).resolves.toBe(4);
    expect(transport.listenerCount()).toBe(0);
  });

  it("rejects a mutation command before it can reach the transport", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    await expect(protocol.read(0x05)).rejects.toMatchObject({ code: "command-not-allowed" });

    expect(transport.sendReport).not.toHaveBeenCalled();
    expect(transport.listenerCount()).toBe(0);
  });

  it("ignores unrelated reports until the exact requested keycode response arrives", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    const keycode = protocol.getKeycode(1, 2, 3);

    transport.emit({ reportId: 1, data: report([0x04, 1, 2, 3, 0x12, 0x34]) });
    transport.emit({ reportId: 0, data: report([0x11, 4]) });
    transport.emit({ reportId: 0, data: report([0x04, 1, 2, 4, 0x12, 0x34]) });
    expect(transport.listenerCount()).toBe(1);

    transport.emit({
      reportId: 0,
      data: new Uint8Array(report([0x04, 1, 2, 3, 0x12, 0x34]).buffer),
    });

    await expect(keycode).resolves.toBe(0x1234);
    expect(transport.listenerCount()).toBe(0);
  });

  it("rejects a concurrent read without sending a second report", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);
    const firstRead = protocol.getLayerCount();

    await expect(protocol.getLayerCount()).rejects.toMatchObject({ code: "concurrent-read" });

    expect(transport.sendReport).toHaveBeenCalledOnce();
    transport.emit({ reportId: 0, data: report([0x11, 3]) });
    await expect(firstRead).resolves.toBe(3);
  });

  it("times out and removes its input report listener", async () => {
    vi.useFakeTimers();
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport, { timeoutMs: 25 });
    const pending = protocol.getLayerCount();
    const rejection = expect(pending).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(transport.removeEventListener).toHaveBeenCalledWith("inputreport", expect.any(Function));
    expect(transport.listenerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("cleans up its listener when the transport throws while sending", async () => {
    const transport = createTransport({
      sendReport: vi.fn((() => {
        throw new Error("HID write failed");
      }) as unknown as ViaReadTransport["sendReport"]),
    });
    const protocol = new ViaReadProtocol(transport);

    await expect(protocol.getLayerCount()).rejects.toMatchObject({ code: "transport" });

    expect(transport.removeEventListener).toHaveBeenCalledWith("inputreport", expect.any(Function));
    expect(transport.listenerCount()).toBe(0);
  });

  it("validates the expected layer count before reading the map", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);
    const keymap = readViaKeymap(protocol, { layerCount: 2, rows: 1, columns: 1 });

    transport.emit({ reportId: 0, data: report([0x11, 1]) });

    await expect(keymap).rejects.toMatchObject({ code: "layer-count-mismatch" });
    expect(transport.sendReport).toHaveBeenCalledOnce();
  });

  it("reads a small multi-layer map in coordinate order with exact keycode correlations", async () => {
    const transport = createTransport({
      sendReport: vi.fn(async (_reportId: number, data: BufferSource) => {
        const request = new Uint8Array(data as ArrayBuffer);
        if (request[0] === 0x11) {
          transport.emit({ reportId: 0, data: report([0x11, 2]) });
          return;
        }
        const [layer, row, column] = [request[1]!, request[2]!, request[3]!];
        transport.emit({
          reportId: 0,
          data: report([0x04, layer, row, column, layer + 1, column]),
        });
      }),
    });
    const protocol = new ViaReadProtocol(transport);

    await expect(readViaKeymap(protocol, { layerCount: 2, rows: 1, columns: 2 })).resolves.toEqual({
      layerCount: 2,
      keycodes: [
        [[0x0100, 0x0101]],
        [[0x0200, 0x0201]],
      ],
    });
    expect(sentCommands(transport)).toEqual([
      [0x11],
      [0x04, 0, 0, 0],
      [0x04, 0, 0, 1],
      [0x04, 1, 0, 0],
      [0x04, 1, 0, 1],
    ]);
  });
});

function createTransport(
  overrides: Partial<ViaReadTransport> = {},
): ViaReadTransport & { emit: (event: { reportId: number; data: DataView | Uint8Array }) => void; listenerCount: () => number } {
  const listeners = new Set<(event: { reportId: number; data: DataView | Uint8Array }) => void>();
  return {
    sendReport: vi.fn(async () => undefined),
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
    emit: (event) => listeners.forEach((listener) => listener(event)),
    listenerCount: () => listeners.size,
    ...overrides,
  };
}

function report(bytes: number[]): Uint8Array {
  const response = new Uint8Array(32);
  response.set(bytes);
  return response;
}

function sentCommands(transport: ViaReadTransport): number[][] {
  return (transport.sendReport as ReturnType<typeof vi.fn>).mock.calls.map(([, data]) => {
    const request = new Uint8Array(data as ArrayBuffer);
    return request[0] === 0x11 ? [request[0]] : [...request].slice(0, 4);
  });
}
