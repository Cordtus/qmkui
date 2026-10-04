import { describe, expect, it } from "vitest";
import { classifyViaIdentity } from "./keychronV5MaxContract";

const v5MaxAnsiKnob = {
  vendorId: 0x3434,
  productId: 0x0950,
  collections: [{ usagePage: 0xff60, usage: 0x0061 }],
};

describe("VIA identity contract", () => {
  it("recognizes a known Keychron model and permits only read operations", () => {
    expect(classifyViaIdentity(v5MaxAnsiKnob)).toEqual({
      state: "via",
      model: expect.objectContaining({ qmkKeyboard: "keychron/v5_max/ansi_encoder" }),
      capabilities: { protocolVersion: true, read: true, write: false, flash: false },
    });
  });

  it("recognizes any Keychron PID as VIA, without a model", () => {
    const contract = classifyViaIdentity({ ...v5MaxAnsiKnob, productId: 0x0999 });
    expect(contract).toMatchObject({ state: "via", capabilities: { read: false } });
    expect(contract).not.toHaveProperty("model");
  });

  it("recognizes a non-Keychron vendor that exposes the VIA collection", () => {
    expect(classifyViaIdentity({ ...v5MaxAnsiKnob, vendorId: 0x1234 })).toMatchObject({
      state: "via",
      capabilities: { read: false },
    });
  });

  it("is unsupported when the VIA collection is absent", () => {
    expect(
      classifyViaIdentity({
        ...v5MaxAnsiKnob,
        collections: [{ usagePage: 0x0001, usage: 0x0006 }],
      }),
    ).toEqual({ state: "unsupported" });
  });
});
