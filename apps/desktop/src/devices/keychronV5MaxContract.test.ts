import { describe, expect, it } from "vitest";
import { classifyKeychronV5MaxIdentity } from "./keychronV5MaxContract";

const exactV5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("Keychron V5 Max identity contract", () => {
  it("recognizes the exact ANSI Knob HID identity as partial and permits only the observed protocol-version check", () => {
    expect(classifyKeychronV5MaxIdentity(exactV5MaxAnsiKnob)).toEqual({
      state: "partial",
      capabilities: {
        protocolVersion: true,
        read: false,
        write: false,
        flash: false,
      },
    });
  });

  it("rejects a different Keychron product ID", () => {
    expect(
      classifyKeychronV5MaxIdentity({
        ...exactV5MaxAnsiKnob,
        productId: 0x0951,
      }),
    ).toEqual({ state: "unsupported" });
  });

  it("rejects a non-Keychron vendor ID", () => {
    expect(
      classifyKeychronV5MaxIdentity({
        ...exactV5MaxAnsiKnob,
        vendorId: 0x1234,
      }),
    ).toEqual({ state: "unsupported" });
  });

  it("rejects the matching USB ID when the required vendor collection is absent", () => {
    expect(
      classifyKeychronV5MaxIdentity({
        ...exactV5MaxAnsiKnob,
        collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      }),
    ).toEqual({ state: "unsupported" });
  });

});
