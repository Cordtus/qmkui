import { describe, expect, it, vi } from "vitest";
import {
  KeychronV5MaxProtocolError,
  verifyKeychronV5MaxProtocolVersion,
  type KeychronV5MaxProtocolDevice,
} from "./keychronV5MaxProtocol";

const exactV5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("Keychron V5 Max protocol version", () => {
  it("sends only the observed 32-byte protocol-version request and returns version 0x000c", async () => {
    const device = createDevice();

    const verification = verifyKeychronV5MaxProtocolVersion(device);
    await vi.waitFor(() => expect(device.sendReport).toHaveBeenCalledOnce());
    const request = (device.sendReport as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(request?.[0]).toBe(0);
    expect([...new Uint8Array(request?.[1] as ArrayBuffer)]).toEqual([0x01, ...Array(31).fill(0)]);

    device.emit({ reportId: 0, data: report([0x01, 0x00, 0x0c]) });

    await expect(verification).resolves.toEqual({ version: 0x000c });
    expect(device.open).toHaveBeenCalledOnce();
    expect(device.removeEventListener).toHaveBeenCalledWith("inputreport", expect.any(Function));
    expect(device.close).toHaveBeenCalledOnce();
  });

  it.each([
    ["report ID", { reportId: 1, data: report([0x01, 0x00, 0x0c]) }, "report-id"],
    ["report length", { reportId: 0, data: report([0x01, 0x00, 0x0c], 31) }, "report-length"],
    ["response command", { reportId: 0, data: report([0x02, 0x00, 0x0c]) }, "report-command"],
  ] as const)("rejects an unexpected %s without keeping the device open", async (_name, input, code) => {
    const device = createDevice();

    const verification = verifyKeychronV5MaxProtocolVersion(device);
    await vi.waitFor(() => expect(device.sendReport).toHaveBeenCalledOnce());
    device.emit(input);

    await expect(verification).rejects.toMatchObject({ code });
    expect(device.removeEventListener).toHaveBeenCalledWith("inputreport", expect.any(Function));
    expect(device.close).toHaveBeenCalledOnce();
  });

  it("rejects a protocol version other than the captured 0x000c response", async () => {
    const device = createDevice();

    const verification = verifyKeychronV5MaxProtocolVersion(device);
    await vi.waitFor(() => expect(device.sendReport).toHaveBeenCalledOnce());
    device.emit({ reportId: 0, data: report([0x01, 0x00, 0x0d]) });

    await expect(verification).rejects.toMatchObject({
      code: "unsupported-version",
    });
    expect(device.close).toHaveBeenCalledOnce();
  });

  it("times out, removes its listener, and closes only a device it opened", async () => {
    vi.useFakeTimers();
    const device = createDevice({ opened: true });

    const verification = verifyKeychronV5MaxProtocolVersion(device, { timeoutMs: 25 });
    const rejection = expect(verification).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.runAllTimersAsync();

    await rejection;
    expect(device.open).not.toHaveBeenCalled();
    expect(device.removeEventListener).toHaveBeenCalledWith("inputreport", expect.any(Function));
    expect(device.close).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("rejects a non-matching device before opening it", async () => {
    const device = createDevice({ productId: 0x0951 });

    await expect(verifyKeychronV5MaxProtocolVersion(device)).rejects.toMatchObject({ code: "identity" });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
  });
});

function createDevice(
  overrides: Partial<KeychronV5MaxProtocolDevice> = {},
): KeychronV5MaxProtocolDevice & { emit: (event: { reportId: number; data: DataView }) => void } {
  let listener: ((event: { reportId: number; data: DataView }) => void) | undefined;
  return {
    ...exactV5MaxAnsiKnob,
    opened: false,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    sendReport: vi.fn(async () => undefined),
    addEventListener: vi.fn((_type, nextListener) => {
      listener = nextListener;
    }),
    removeEventListener: vi.fn(),
    emit: (event) => listener?.(event),
    ...overrides,
  };
}

function report(bytes: number[], length = 32): DataView {
  const buffer = new ArrayBuffer(length);
  new Uint8Array(buffer).set(bytes);
  return new DataView(buffer);
}
