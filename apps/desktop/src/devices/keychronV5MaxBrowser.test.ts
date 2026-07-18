import { describe, expect, it, vi } from "vitest";
import { selectKeychronV5MaxBrowserDevice } from "./keychronV5MaxBrowser";

const exactV5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("Keychron V5 Max browser selection", () => {
  it("asks the browser for only the exact V5 Max and maps its static identity without opening it", async () => {
    const device = {
      ...exactV5MaxAnsiKnob,
      open: vi.fn(),
      sendReport: vi.fn(),
      receiveFeatureReport: vi.fn(),
    };
    const requestDevice = vi.fn(async () => [device]);

    const result = await selectKeychronV5MaxBrowserDevice({
      hid: { requestDevice },
    });

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ vendorId: 0x3434, productId: 0x0950 }],
    });
    expect(result).toEqual({
      state: "selected",
      identity: exactV5MaxAnsiKnob,
      contract: {
        state: "partial",
        capabilities: { open: false, read: false, write: false, flash: false },
      },
    });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
  });

  it("reports an unavailable chooser when the browser has no WebHID support", async () => {
    await expect(selectKeychronV5MaxBrowserDevice({})).resolves.toEqual({
      state: "unavailable",
    });
  });

  it("reports a concise no-selection outcome when the chooser returns no device", async () => {
    await expect(
      selectKeychronV5MaxBrowserDevice({
        hid: { requestDevice: async () => [] },
      }),
    ).resolves.toEqual({ state: "no-selection" });
  });
});
