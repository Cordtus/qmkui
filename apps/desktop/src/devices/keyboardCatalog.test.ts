import { describe, expect, it } from "vitest";
import { findKeyboardByUsbIdentity, initialKeyboardCatalog } from "./keyboardCatalog";

describe("initial keyboard identity catalog", () => {
  it.each([
    [0x0810, "Keychron Q1 Max ANSI Knob", "keychron/q1_max/ansi_encoder", "LAYOUT_ansi_82", 82, "identityOnly"],
    [0x0913, "Keychron V1 Max ANSI Knob", "keychron/v1_max/ansi_encoder", "LAYOUT_ansi_82", 82, "identityOnly"],
    [0x0950, "Keychron V5 Max ANSI Knob", "keychron/v5_max/ansi_encoder", "LAYOUT_ansi_98", 98, "protocolVersion"],
    [0x0960, "Keychron V6 Max ANSI Knob", "keychron/v6_max/ansi_encoder", "LAYOUT_ansi_109", 109, "identityOnly"],
    [0x0280, "Keychron K8 Pro ANSI RGB", "keychron/k8_pro/ansi/rgb", "LAYOUT_tkl_ansi", 87, "identityOnly"],
  ] as const)(
    "maps Keychron USB product %s to its pinned model and layout contract",
    (productId, displayName, qmkKeyboard, layoutMacro, keyCount, deviceSupport) => {
      expect(findKeyboardByUsbIdentity({ vendorId: 0x3434, productId })).toMatchObject({
        displayName,
        qmkKeyboard,
        layout: { macro: layoutMacro, keyCount },
        deviceSupport,
        upstream: {
          identity: {
            repository: "Keychron/qmk_firmware",
            commit: "bc1bdeb85f39cccd5e503f4d8f472078a8c1472a",
          },
          layout: {
            repository: "Keychron/qmk_firmware",
            commit: "bc1bdeb85f39cccd5e503f4d8f472078a8c1472a",
          },
        },
      });
    },
  );

  it("does not treat a matching vendor alone as a known keyboard", () => {
    expect(findKeyboardByUsbIdentity({ vendorId: 0x3434, productId: 0xffff })).toBeUndefined();
  });

  it("keeps the catalog immutable and free of unpinned sources", () => {
    expect(initialKeyboardCatalog).toHaveLength(5);
    initialKeyboardCatalog.forEach((keyboard) => {
      for (const source of [keyboard.upstream.identity, keyboard.upstream.layout]) {
        expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
        expect(source.path.startsWith("keyboards/keychron/")).toBe(true);
        expect(source.blob).toMatch(/^[0-9a-f]{40}$/);
      }
    });
  });

  it("pins K8 Pro identity and inherited layout to their separate upstream files", () => {
    const keyboard = findKeyboardByUsbIdentity({ vendorId: 0x3434, productId: 0x0280 });

    expect(keyboard?.upstream).toEqual({
      identity: {
        repository: "Keychron/qmk_firmware",
        commit: "bc1bdeb85f39cccd5e503f4d8f472078a8c1472a",
        path: "keyboards/keychron/k8_pro/ansi/rgb/keyboard.json",
        blob: "11d5c5fcbfea0f9b87945b4a8c5ab6fb19f7f57a",
      },
      layout: {
        repository: "Keychron/qmk_firmware",
        commit: "bc1bdeb85f39cccd5e503f4d8f472078a8c1472a",
        path: "keyboards/keychron/k8_pro/info.json",
        blob: "420badc24df3e6a541b5d3ceb8ef4eb2699dbfa8",
      },
    });
  });
});
