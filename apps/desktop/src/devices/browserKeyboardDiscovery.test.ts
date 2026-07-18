import { describe, expect, it, vi } from "vitest";
import {
  chooseBrowserKeyboard,
  discoverAuthorizedBrowserKeyboard,
} from "./browserKeyboardDiscovery";

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
        capabilities: { protocolVersion: true, read: false, write: false, flash: false },
      },
    });
    expect(device.open).not.toHaveBeenCalled();
    expect(device.sendReport).not.toHaveBeenCalled();
    expect(device.receiveFeatureReport).not.toHaveBeenCalled();
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("reports an authorized keyboard outside the exact catalog contract as unsupported", async () => {
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

  it("identifies a cataloged V1 Max without creating a protocol session or device I/O", async () => {
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
      catalogKeyboard: {
        displayName: "Keychron V1 Max ANSI Knob",
        qmkKeyboard: "keychron/v1_max/ansi_encoder",
        layout: { macro: "LAYOUT_ansi_82", keyCount: 82 },
        deviceSupport: "identityOnly",
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
});
