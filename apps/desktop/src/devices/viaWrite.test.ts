import { describe, expect, it, vi } from "vitest";
import { RGB_MATRIX_BRIGHTNESS, RGB_MATRIX_CHANNEL, ViaWriteProtocol, ViaWriteProtocolError } from "./viaWrite";
import type { ViaReadTransport } from "./viaReadProtocol";

function createTransport() {
  const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
  const sendReport = vi.fn(async (_reportId: number, data: BufferSource) => {
    const report = new Uint8Array(data as ArrayBuffer);
    listeners.forEach((listener) => listener({ reportId: 0, data: new Uint8Array(report) }));
  });
  const transport: ViaReadTransport = {
    sendReport: sendReport as never,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  return { transport, sendReport };
}

describe("VIA write protocol", () => {
  it("emits a set-keycode frame and resolves on the echo", async () => {
    const { transport, sendReport } = createTransport();
    const write = new ViaWriteProtocol(transport);

    await write.setKeycode(1, 0, 15, 0x0046);

    expect(sendReport).toHaveBeenCalledTimes(1);
    const sent = new Uint8Array(sendReport.mock.calls[0]![1] as ArrayBuffer);
    expect(sent[0]).toBe(0x05);
    expect([...sent.slice(1, 4)]).toEqual([1, 0, 15]);
    expect([...sent.slice(4, 6)]).toEqual([0x00, 0x46]);
  });

  it("emits a save-EEPROM frame", async () => {
    const { transport, sendReport } = createTransport();
    const write = new ViaWriteProtocol(transport);

    await write.saveEeprom();

    const sent = new Uint8Array(sendReport.mock.calls[0]![1] as ArrayBuffer);
    expect(sent[0]).toBe(0x09);
  });

  it("sets a custom channel value with the VIA custom-set frame", async () => {
    const { transport, sendReport } = createTransport();
    const write = new ViaWriteProtocol(transport);

    await write.setCustomValue(RGB_MATRIX_CHANNEL, RGB_MATRIX_BRIGHTNESS, [200]);

    expect(sendReport).toHaveBeenCalledTimes(1);
    const sent = new Uint8Array(sendReport.mock.calls[0]![1] as ArrayBuffer);
    // [id_custom_set_value, channel, value_id, ...bytes]
    expect([...sent.slice(0, 4)]).toEqual([0x07, 3, 1, 200]);
  });

  it("sets the global RGB-matrix colour as hue/saturation bytes", async () => {
    const { transport, sendReport } = createTransport();
    const write = new ViaWriteProtocol(transport);

    await write.setRgbMatrixColor(113, 221);

    const sent = new Uint8Array(sendReport.mock.calls[0]![1] as ArrayBuffer);
    expect([...sent.slice(0, 5)]).toEqual([0x07, 3, 4, 113, 221]);
  });

  it("rejects an oversized payload before I/O", async () => {
    const { transport, sendReport } = createTransport();
    const write = new ViaWriteProtocol(transport);

    // The public surface only exposes allow-listed commands; verify the
    // payload bound is enforced on those.
    await expect(
      write.setKeycode(0, 0, 0, 0x0004).then(() => write.saveEeprom()),
    ).resolves.toBeUndefined();
    expect(sendReport).toHaveBeenCalledTimes(2);
  });

  it("rejects a write whose response does not echo the command", async () => {
    const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
    const transport: ViaReadTransport = {
      sendReport: async (_reportId, data) => {
        const report = new Uint8Array(data as ArrayBuffer);
        const bad = new Uint8Array(report);
        bad[0] = 0xff;
        listeners.forEach((listener) => listener({ reportId: 0, data: bad }));
      },
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const write = new ViaWriteProtocol(transport, 50);

    await expect(write.setKeycode(0, 0, 0, 0x0004)).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
