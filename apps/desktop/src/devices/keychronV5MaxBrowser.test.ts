import { describe, expect, it, vi } from "vitest";
import { selectKeychronV5MaxBrowserDevice } from "./keychronV5MaxBrowser";

const exactV5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("Keychron V5 Max browser selection", () => {
  it("asks the browser for only the exact V5 Max and preserves the exact selected device only for protocol verification", async () => {
    const wrongDevice = {
      vendorId: 0x3434,
      productId: 0x0950,
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
    };
    const device = {
      ...exactV5MaxAnsiKnob,
      open: vi.fn(),
      sendReport: vi.fn(),
      receiveFeatureReport: vi.fn(),
    };
    const requestDevice = vi.fn(async () => [wrongDevice, device]);
    const verifyProtocolVersion = vi.fn(async () => ({ version: 0x000c as const }));

    const result = await selectKeychronV5MaxBrowserDevice({
      hid: { requestDevice },
    }, { verifyProtocolVersion });

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [{ vendorId: 0x3434, productId: 0x0950, usagePage: 0xff60, usage: 0x0061 }],
    });
    expect(result).toMatchObject({
      state: "selected",
      identity: exactV5MaxAnsiKnob,
      contract: {
        state: "partial",
        capabilities: { protocolVersion: true, read: false, write: false, flash: false },
      },
    });
    if (result.state === "selected" && result.contract.state === "partial" && "session" in result) {
      await expect(result.session.verifyProtocolVersion()).resolves.toEqual({ version: 0x000c });
    } else {
      throw new Error("expected the exact V5 Max selection");
    }
    expect(verifyProtocolVersion).toHaveBeenCalledWith(device);
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
  });

  it("returns an explicit unsupported result only when no selected entry has the exact identity", async () => {
    const unsupportedIdentity = {
      vendorId: 0x3434,
      productId: 0x0950,
      collections: [{ usagePage: 0x0001, usage: 0x0006 }],
    };

    await expect(
      selectKeychronV5MaxBrowserDevice({
        hid: { requestDevice: async () => [unsupportedIdentity] },
      }),
    ).resolves.toEqual({
      state: "selected",
      identity: unsupportedIdentity,
      contract: { state: "unsupported" },
    });
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
