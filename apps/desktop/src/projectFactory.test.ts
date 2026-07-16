import { describe, expect, it } from "vitest";
import catalog from "../../../fixtures/catalog/keyboards.json";
import { exportQmkJson, type KeyboardDefinition, validateProject } from "./domain";
import { createProjectFromKeyboard } from "./projectFactory";

const keyboard = catalog[0] as KeyboardDefinition;

describe("project factory", () => {
  it("creates a valid project from a catalog keyboard", () => {
    const project = createProjectFromKeyboard(keyboard);
    const exported = exportQmkJson(project, keyboard);

    expect(validateProject(project, keyboard)).toEqual([]);
    expect(project.target).toMatchObject({
      keyboardId: "example/keyboard",
      qmkKeyboard: "example/keyboard",
      layoutId: "LAYOUT",
      qmkLayoutMacro: "LAYOUT",
    });
    expect(exported.layers).toEqual([
      ["KC_ESC", "KC_A", "MO(1)"],
      ["KC_TRNS", "KC_TRNS", "KC_TRNS"],
    ]);
  });
});
