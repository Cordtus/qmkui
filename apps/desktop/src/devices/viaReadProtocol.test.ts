import { describe, expect, it, vi } from "vitest";
import {
  ViaReadProtocol,
  readViaKeymap,
  type ViaReadTransport,
} from "./viaReadProtocol";

describe("VIA read protocol", () => {
  const standardReadCases: readonly {
      readonly name: string;
      readonly start: (protocol: ViaReadProtocol) => Promise<unknown>;
      readonly request: readonly number[];
      readonly response: readonly number[];
      readonly expected: unknown;
  }[] = [
      {
        name: "protocol version",
        start: (protocol) => protocol.getProtocolVersion(),
        request: [0x01],
        response: [0x01, 0x00, 0x0c],
        expected: 12,
      },
      {
        name: "uptime",
        start: (protocol) => protocol.getUptime(),
        request: [0x02, 0x01],
        response: [0x02, 0x01, 0x12, 0x34, 0x56, 0x78],
        expected: 0x12345678,
      },
      {
        name: "layout options",
        start: (protocol) => protocol.getLayoutOptions(),
        request: [0x02, 0x02],
        response: [0x02, 0x02, 0x01, 0x02, 0x03, 0x04],
        expected: 0x01020304,
      },
      {
        name: "switch matrix state",
        start: (protocol) => protocol.getSwitchMatrixState(2),
        request: [0x02, 0x03, 0x02],
        response: [0x02, 0x03, 0x02, 0xa1, 0xb2],
        expected: {
          offset: 2,
          bytes: new Uint8Array([0xa1, 0xb2, ...new Array<number>(27).fill(0)]),
        },
      },
      {
        name: "firmware version",
        start: (protocol) => protocol.getFirmwareVersion(),
        request: [0x02, 0x04],
        response: [0x02, 0x04, 0x87, 0x65, 0x43, 0x21],
        expected: 0x87654321,
      },
      {
        name: "keycodes version",
        start: (protocol) => protocol.getKeycodesVersion(),
        request: [0x02, 0x06],
        response: [0x02, 0x06, 0x00, 0x00, 0x00, 0x08],
        expected: 8,
      },
      {
        name: "keycode",
        start: (protocol) => protocol.getKeycode(1, 2, 3),
        request: [0x04, 0x01, 0x02, 0x03],
        response: [0x04, 0x01, 0x02, 0x03, 0x12, 0x34],
        expected: 0x1234,
      },
      {
        name: "macro count",
        start: (protocol) => protocol.getMacroCount(),
        request: [0x0c],
        response: [0x0c, 0x10],
        expected: 16,
      },
      {
        name: "macro buffer size",
        start: (protocol) => protocol.getMacroBufferSize(),
        request: [0x0d],
        response: [0x0d, 0x01, 0x20],
        expected: 0x0120,
      },
      {
        name: "macro buffer",
        start: (protocol) => protocol.getMacroBuffer(0x0123, 3),
        request: [0x0e, 0x01, 0x23, 0x03],
        response: [0x0e, 0x01, 0x23, 0x03, 0xde, 0xad, 0xbe],
        expected: { offset: 0x0123, bytes: new Uint8Array([0xde, 0xad, 0xbe]) },
      },
      {
        name: "layer count",
        start: (protocol) => protocol.getLayerCount(),
        request: [0x11],
        response: [0x11, 0x04],
        expected: 4,
      },
      {
        name: "dynamic keymap buffer",
        start: (protocol) => protocol.getDynamicKeymapBuffer(0x0456, 2),
        request: [0x12, 0x04, 0x56, 0x02],
        response: [0x12, 0x04, 0x56, 0x02, 0xca, 0xfe],
        expected: { offset: 0x0456, bytes: new Uint8Array([0xca, 0xfe]) },
      },
      {
        name: "encoder keycode",
        start: (protocol) => protocol.getEncoderKeycode(2, 1, true),
        request: [0x14, 0x02, 0x01, 0x01],
        response: [0x14, 0x02, 0x01, 0x01, 0xab, 0xcd],
        expected: 0xabcd,
      },
  ];

  it.each(standardReadCases)("frames and decodes $name", async (testCase) => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);
    const result = testCase.start(protocol);

    expect(transport.sendReport).toHaveBeenCalledWith(0, report([...testCase.request]));
    transport.emit({ reportId: 0, data: report([...testCase.response]) });

    await expect(result).resolves.toEqual(testCase.expected);
    expect(transport.listenerCount()).toBe(0);
  });

  it("frames a standard RGB Matrix custom-get read without issuing a mutation", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);
    const color = protocol.getCustomValue({ channel: 3, valueId: 4 });

    expect(transport.sendReport).toHaveBeenCalledWith(0, report([0x08, 0x03, 0x04]));
    transport.emit({ reportId: 0, data: report([0x08, 0x03, 0x04, 0x80, 0x40]) });

    await expect(color).resolves.toEqual({
      channel: 3,
      valueId: 4,
      bytes: new Uint8Array([0x80, 0x40, ...new Array<number>(27).fill(0)]),
      verification: "verified",
    });
    expect(transport.sendReport).toHaveBeenCalledOnce();
  });

  it("labels a vendor custom value as unverified unless its decoder is registered", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);
    const reading = protocol.getCustomValue({ channel: 0, valueId: 0x31 });

    transport.emit({ reportId: 0, data: report([0x08, 0x00, 0x31, 0x99]) });

    await expect(reading).resolves.toEqual({
      channel: 0,
      valueId: 0x31,
      bytes: new Uint8Array([0x99, ...new Array<number>(28).fill(0)]),
      verification: "unverified",
    });
  });

  it("uses a registered decoder to verify a vendor custom value", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport, {
      customValueDecoders: [{
        channel: 0,
        valueId: 0x31,
        decode: (bytes) => ({ enabled: bytes[0] === 1 }),
      }],
    });
    const reading = protocol.getCustomValue({ channel: 0, valueId: 0x31 });

    transport.emit({ reportId: 0, data: report([0x08, 0x00, 0x31, 0x01]) });

    await expect(reading).resolves.toMatchObject({
      channel: 0,
      valueId: 0x31,
      verification: "verified",
      decoded: { enabled: true },
    });
  });

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

  it.each([
    ["set keyboard value", 0x03],
    ["set keycode", 0x05],
    ["dynamic keymap reset", 0x06],
    ["custom set", 0x07],
    ["custom save", 0x09],
    ["EEPROM reset", 0x0a],
    ["bootloader jump", 0x0b],
    ["set macro buffer", 0x0f],
    ["macro reset", 0x10],
    ["set dynamic keymap buffer", 0x13],
    ["set encoder", 0x15],
  ])("rejects %s before transport I/O", async (_name, command) => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    await expect(protocol.read(command)).rejects.toMatchObject({ code: "command-not-allowed" });

    expect(transport.sendReport).not.toHaveBeenCalled();
    expect(transport.listenerCount()).toBe(0);
  });

  it("requires an explicit standard custom channel and value selection", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    await expect(protocol.getCustomValue({ channel: 3, valueId: 5 } as never)).rejects.toMatchObject({
      code: "invalid-request",
    });

    expect(transport.sendReport).not.toHaveBeenCalled();
  });

  it.each([
    ["a layer-count payload", 0x11, [0]],
    ["an empty keycode payload", 0x04, []],
    ["a short keycode payload", 0x04, [1, 2]],
    ["a long keycode payload", 0x04, [1, 2, 3, 4]],
    ["a device-indication keyboard value", 0x02, [0x05]],
    ["an oversized macro-buffer request", 0x0e, [0, 0, 29]],
    ["a non-binary encoder direction", 0x14, [0, 0, 2]],
    ["a direct custom-get request that bypasses channel selection", 0x08, [3, 4]],
  ])("rejects %s before transport I/O", async (_name, command, payload) => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    await expect(protocol.read(command, payload)).rejects.toMatchObject({ code: "invalid-request" });

    expect(transport.sendReport).not.toHaveBeenCalled();
    expect(transport.listenerCount()).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    "rejects timeout %s before transport I/O",
    async (timeoutMs) => {
      const transport = createTransport();
      const protocol = new ViaReadProtocol(transport, { timeoutMs });

      await expect(protocol.getLayerCount()).rejects.toMatchObject({ code: "invalid-timeout" });

      expect(transport.sendReport).not.toHaveBeenCalled();
      expect(transport.listenerCount()).toBe(0);
    },
  );

  it("ignores unrelated reports until the exact requested keycode response arrives", async () => {
    const transport = createTransport();
    const protocol = new ViaReadProtocol(transport);

    const keycode = protocol.getKeycode(1, 2, 3);

    transport.emit({ reportId: 1, data: report([0x04, 1, 2, 3, 0x12, 0x34]) });
    transport.emit({ reportId: 0, data: report([0x11, 4]) });
    transport.emit({ reportId: 0, data: report([0x04, 1, 2, 4, 0x12, 0x34]) });
    expect(transport.listenerCount()).toBe(1);

    transport.emit({ reportId: 0, data: offsetReportView([0x04, 1, 2, 3, 0x12, 0x34]) });

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

function offsetReportView(bytes: number[]): DataView {
  const paddedResponse = new Uint8Array(34);
  paddedResponse.set(report(bytes), 1);
  return new DataView(paddedResponse.buffer, 1, 32);
}

function sentCommands(transport: ViaReadTransport): number[][] {
  return (transport.sendReport as ReturnType<typeof vi.fn>).mock.calls.map(([, data]) => {
    const request = new Uint8Array(data as ArrayBuffer);
    return request[0] === 0x11 ? [request[0]] : [...request].slice(0, 4);
  });
}
