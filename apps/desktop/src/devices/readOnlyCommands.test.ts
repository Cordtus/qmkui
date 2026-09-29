import { describe, expect, it } from "vitest";
import readOnlyCommands from "../../../../fixtures/protocol/read-only-commands.json";

/**
 * Conformance guard for the single-source read allow-list. The JSON in
 * `fixtures/protocol/read-only-commands.json` is the one source of truth for
 * every command frame the readers are allowed to emit; these assertions lock
 * the documented values so an accidental edit cannot silently widen (or
 * narrow) the read surface.
 */
describe("read-only command allow-list", () => {
  it("contains the standard VIA read commands", () => {
    expect(Object.values(readOnlyCommands.viaReadCommands).sort((a, b) => a - b)).toEqual([
      0x01, 0x02, 0x04, 0x08, 0x0c, 0x0d, 0x0e, 0x11, 0x12, 0x14,
    ]);
  });

  it("contains the Keychron V5 Max read commands", () => {
    // No 0xa8: the V5 Max firmware answers it with VIA id_unhandled. Lighting
    // is read through the standard VIA RGB-matrix channel (0x08, channel 3).
    expect(Object.values(readOnlyCommands.keychronReadCommands).sort((a, b) => a - b)).toEqual([
      0xa0, 0xa1, 0xa2, 0xa3,
    ]);
  });

  it("does not include any VIA set, save, reset, or bootloader command", () => {
    const viaCommands = new Set(Object.values(readOnlyCommands.viaReadCommands));
    for (const command of [0x03, 0x05, 0x06, 0x07, 0x09, 0x0a, 0x0b, 0x0f, 0x10, 0x13, 0x15]) {
      expect(viaCommands.has(command)).toBe(false);
    }
  });
});
