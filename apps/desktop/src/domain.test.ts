import { describe, expect, it } from "vitest";
import catalog from "../../../fixtures/catalog/keyboards.json";
import project from "../../../fixtures/projects/example-60.json";
import {
  exportQmkJson,
  KeyboardDefinition,
  Project,
  validateProject,
} from "./domain";

const keyboard = catalog[0] as KeyboardDefinition;
const fixtureProject = project as Project;

describe("project validation", () => {
  it("exports fixture project to QMK keymap JSON", () => {
    const exported = exportQmkJson(fixtureProject, keyboard);

    expect(exported).toEqual({
      keyboard: "example/keyboard",
      keymap: "example_60",
      layout: "LAYOUT",
      layers: [
        ["KC_ESC", "KC_A", "MO(1)"],
        ["KC_TRNS", "KC_MUTE", "KC_TRNS"],
      ],
    });
  });

  it("catches missing layer references before build", () => {
    const invalidProject = {
      ...project,
      layers: project.layers.slice(0, 1),
    } as Project;

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("assignment.layerReference.missing");
  });

  it("catches visual key mismatches before export", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.layers[0].assignments[0].visualKeyId = "ghost";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("assignment.visualKey.unknown");
    expect(issues.map((issue) => issue.code)).toContain("assignment.visualKey.missing");
    expect(() => exportQmkJson(invalidProject, keyboard)).toThrow("Missing assignment");
  });

  it("requires layer zero before build", () => {
    const invalidProject = {
      ...fixtureProject,
      layers: fixtureProject.layers.slice(1),
    };

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("layer.base.missing");
  });

  it("validates common QMK layer wrappers", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.layers[0].assignments[2].qmk = "LM(9, MOD_LSFT)";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("assignment.layerReference.missing");
  });

  it("rejects unsupported schema versions", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.schemaVersion = "9.9.9";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("project.schemaVersion.unsupported");
  });

  it("rejects mismatched layout macros", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.target.qmkLayoutMacro = "LAYOUT_split_bs";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("target.qmkLayoutMacro.mismatch");
  });

  it("rejects invalid keymap names", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.build.keymapName = "bad keymap";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("build.keymapName.invalid");
  });

  it("rejects mismatched keyboard targets", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.target.qmkKeyboard = "wrong/keyboard";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("target.qmkKeyboard.mismatch");
  });

  it("rejects mismatched keyboard ids", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.target.keyboardId = "wrong/keyboard";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("target.keyboardId.mismatch");
  });

  it("rejects mismatched layout ids", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.target.layoutId = "LAYOUT_ortho";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("layout.missing");
  });

  it("rejects sparse layer indexes for JSON export", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.layers[1].index = 2;
    invalidProject.layers[0].assignments[2].qmk = "MO(2)";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("layer.index.sparse");
  });

  it("rejects layer wrappers with extra arguments", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.layers[0].assignments[2].qmk = "LT(1, KC_A, KC_B)";

    const issues = validateProject(invalidProject, keyboard);

    expect(issues.map((issue) => issue.code)).toContain("assignment.layerReference.malformed");
  });

  it("rejects layer indexes and references outside QMK's supported range", () => {
    const invalidProject = structuredClone(fixtureProject);
    invalidProject.layers[1].index = 32;
    invalidProject.layers[0].assignments[2].qmk = "MO(32)";

    const codes = validateProject(invalidProject, keyboard).map((issue) => issue.code);

    expect(codes).toContain("layer.index.range");
    expect(codes).toContain("assignment.layerReference.range");

    const negativeProject = structuredClone(fixtureProject);
    negativeProject.layers[1].index = -1;
    expect(validateProject(negativeProject, keyboard).map((issue) => issue.code)).toContain(
      "layer.index.range",
    );

    const fractionalProject = structuredClone(fixtureProject);
    fractionalProject.layers[1].index = 0.5;
    expect(validateProject(fractionalProject, keyboard).map((issue) => issue.code)).toContain(
      "layer.index.range",
    );
  });

  it("rejects LT and LM references above their QMK layer limit", () => {
    const invalidProject = structuredClone(fixtureProject);
    for (let index = 2; index <= 16; index += 1) {
      invalidProject.layers.push({
        id: `layer_${index}`,
        index,
        name: `Layer ${index}`,
        enabled: true,
        assignments: keyboard.layouts[0].keys.map((key, keyIndex) => ({
          id: `layer_${index}_${keyIndex}`,
          visualKeyId: key.id,
          kind: "transparent",
          qmk: "KC_TRNS",
        })),
      });
    }
    invalidProject.layers[0].assignments[2].qmk = "LT(16, KC_SPC)";

    expect(validateProject(invalidProject, keyboard).map((issue) => issue.code)).toContain(
      "assignment.layerReference.range",
    );

    invalidProject.layers[0].assignments[2].qmk = "LM(16, MOD_LSFT)";
    expect(validateProject(invalidProject, keyboard).map((issue) => issue.code)).toContain(
      "assignment.layerReference.range",
    );
  });

  it("rejects unsupported raw tap-hold tap keys before export", () => {
    [
      "LT(1, KC_TILD)",
      "LT(1, KC_DQUO)",
      "LT(1, LCTL(KC_A))",
      "LT(1, MT(MOD_LCTL, KC_ESC))",
      "MT(MOD_LCTL, KC_DQUO)",
      "MT(MOD_LCTL, KC_TILD)",
      "MT(MOD_LCTL, LT(1, KC_SPC))",
      "LCTL_T(KC_TILD)",
    ].forEach((qmk) => {
      const invalidProject = structuredClone(fixtureProject);
      invalidProject.layers[0].assignments[2].qmk = qmk;
      expect(validateProject(invalidProject, keyboard).map((issue) => issue.code)).toContain(
        "assignment.tapHold.unsupported",
      );
    });

    ["LT(1, KC_SPC)", "MT(MOD_LCTL, KC_ESC)", "LCTL_T(KC_ESC)"].forEach((qmk) => {
      const validProject = structuredClone(fixtureProject);
      validProject.layers[0].assignments[2].qmk = qmk;
      expect(validateProject(validProject, keyboard).map((issue) => issue.code)).not.toContain(
        "assignment.tapHold.unsupported",
      );
    });
  });
});
