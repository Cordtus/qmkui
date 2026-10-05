import { describe, expect, it } from "vitest";
import type { KeyboardDefinition } from "../domain";
import { buildViaModels, findViaModel, isKeychronVendor } from "./keychronModels";

const keyboards = [
  {
    id: "keychron/v5_max/ansi_encoder",
    qmkKeyboard: "keychron/v5_max/ansi_encoder",
    displayName: "Keychron V5 Max ANSI Knob",
    usb: { vid: "3434", pid: "0950" },
    layouts: [],
  },
  {
    id: "example/no-usb",
    qmkKeyboard: "example/no-usb",
    displayName: "No USB Board",
    layouts: [],
  },
  {
    id: "example/upper-hex",
    qmkKeyboard: "example/upper-hex",
    displayName: "Upper-case USB id",
    usb: { vid: "FEED", pid: "6060" },
    layouts: [],
  },
] as unknown as KeyboardDefinition[];

describe("VIA model registry", () => {
  it("builds a model per keyboard that declares a USB id", () => {
    const models = buildViaModels(keyboards);
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      vendorId: "0x3434",
      productId: "0x0950",
      qmkKeyboard: "keychron/v5_max/ansi_encoder",
    });
  });

  it("normalizes un-prefixed, upper-case USB ids", () => {
    const models = buildViaModels(keyboards);
    const model = findViaModel(models, 0xfeed, 0x6060);
    expect(model?.qmkKeyboard).toBe("example/upper-hex");
  });

  it("resolves a model by VID/PID", () => {
    const models = buildViaModels(keyboards);
    expect(findViaModel(models, 0x3434, 0x0950)).toBeDefined();
    expect(findViaModel(models, 0x3434, 0xffff)).toBeUndefined();
  });

  it("recognises the Keychron vendor id for any product", () => {
    expect(isKeychronVendor(0x3434)).toBe(true);
    expect(isKeychronVendor(0x1234)).toBe(false);
  });
});
