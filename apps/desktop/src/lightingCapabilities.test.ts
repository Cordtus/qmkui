import { describe, expect, it } from "vitest";
import catalog from "../../../fixtures/catalog/keyboards.json";
import type { KeyboardDefinition } from "./domain";
import { lightingSystemsForKeyboard, supportedLightingSystems } from "./lightingCapabilities";
import { keychronV5MaxKeyboard } from "./presets";

describe("lighting capabilities", () => {
  it("identifies RGB Matrix support from keyboard metadata", () => {
    expect(supportedLightingSystems(keychronV5MaxKeyboard).map((system) => system.id)).toContain(
      "rgbMatrix",
    );
  });

  it("keeps unsupported systems out of supported controls", () => {
    const keyboard = catalog[0] as KeyboardDefinition;

    expect(lightingSystemsForKeyboard(keyboard).find((system) => system.id === "rgblight"))
      .toMatchObject({
        capability: { support: "unsupported" },
      });
    expect(supportedLightingSystems(keyboard).map((system) => system.id)).not.toContain(
      "rgblight",
    );
  });
});
