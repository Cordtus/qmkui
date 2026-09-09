import { describe, expect, it } from "vitest";
import { createMacroRecord, macroExportMode } from "./macros";

describe("macro export mode", () => {
  it("classifies simple tap/hold/delay timelines as JSON-exportable", () => {
    expect(macroExportMode("TAP KC_A TAP KC_B DELAY 50")).toBe("json");
    expect(macroExportMode("HOLD KC_LSFT TAP KC_A")).toBe("json");
  });

  it("classifies anything beyond simple steps as generated C", () => {
    expect(macroExportMode("TAP KC_A MOD_TAP 0x01 KC_B")).toBe("c");
    expect(macroExportMode("")).toBe("c");
    expect(macroExportMode("UNICODE 0x1F600")).toBe("c");
  });

  it("creates a record carrying the detected export mode", () => {
    const record = createMacroRecord("F12 dump", "TAP KC_F12");
    expect(record.name).toBe("F12 dump");
    expect(record.exportMode).toBe("json");
    expect(record.enabled).toBe(true);
    expect(record.actions).toBe("TAP KC_F12");
    expect(record.id).toMatch(/^macro_/);
  });
});
