import { describe, expect, it, vi } from "vitest";
import { readGenericViaStandardState, type GenericViaReaderDevice } from "./genericViaReader";

describe("generic VIA standard reader", () => {
  it("keeps unsupported standard reads unavailable instead of substituting configuration defaults", async () => {
    const device = createDevice((request) => {
      if (request[0] === 0x02 && request[1] === 0x01) {
        return report([0x02, 0x01, 0, 0, 0, 42]);
      }
      return undefined;
    });

    const snapshot = await readGenericViaStandardState(device, {
      protocolVersion: 0x000c,
      timeoutMs: 1,
      now: () => "2026-07-24T00:00:00.000Z",
    });

    expect(snapshot.protocolVersion).toEqual({ state: "available", value: 0x000c });
    expect(snapshot.uptime).toEqual({ state: "available", value: 42 });
    expect(snapshot.layoutOptions).toEqual({ state: "unavailable", reason: "Layout options read failed: timeout." });
    expect(snapshot.layerCount).toEqual({ state: "unavailable", reason: "Layer count read failed: timeout." });
    expect(snapshot.keymap).toEqual({
      state: "unverified",
      reason: "No verified matrix dimensions are available for this VIA device.",
    });
    expect(snapshot.lighting.rgbMatrixEffect).toEqual({
      state: "unavailable",
      reason: "RGB matrix effect read failed: timeout.",
    });
    expect(sentCommands(device).every((command) => command !== 0xa0 && command !== 0xa8)).toBe(true);
  });
});

function createDevice(
  responseFor: (request: Uint8Array) => Uint8Array | undefined,
): GenericViaReaderDevice & { sendReport: ReturnType<typeof vi.fn> } {
  const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
  return {
    opened: false,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    sendReport: vi.fn(async (_reportId: number, data: BufferSource) => {
      const response = responseFor(new Uint8Array(data as ArrayBuffer));
      if (response) listeners.forEach((listener) => listener({ reportId: 0, data: response }));
    }),
    addEventListener: vi.fn((_type, listener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type, listener) => listeners.delete(listener)),
  };
}

function report(bytes: number[]): Uint8Array {
  const response = new Uint8Array(32);
  response.set(bytes);
  return response;
}

function sentCommands(device: GenericViaReaderDevice): number[] {
  return (device.sendReport as ReturnType<typeof vi.fn>).mock.calls.map(([, data]) => new Uint8Array(data as ArrayBuffer)[0]!);
}
