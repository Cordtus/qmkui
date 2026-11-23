import { describe, expect, it } from "vitest";
import catalog from "../../../fixtures/catalog/keyboards.json";
import type { KeyboardDefinition } from "./domain";
import { lightingSystemsForKeyboard } from "./lightingCapabilities";
import { keychronV5MaxKeyboard } from "./presets";

describe("lighting capabilities", () => {
  it("identifies RGB Matrix support from keyboard metadata", () => {
    expect(
      lightingSystemsForKeyboard(keychronV5MaxKeyboard).find(
        (system) => system.id === "rgbMatrix",
      ),
    ).toMatchObject({ capability: { support: "supported" } });
  });

  it("marks unsupported systems", () => {
    const keyboard = catalog[0] as KeyboardDefinition;

    expect(lightingSystemsForKeyboard(keyboard).find((system) => system.id === "rgblight"))
      .toMatchObject({
        capability: { support: "unsupported" },
      });
  });
});
