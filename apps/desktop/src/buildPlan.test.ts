import { describe, expect, it } from "vitest";
import { createBuildPlan } from "./buildPlan";
import { validateProject } from "./domain";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";

describe("build plan", () => {
  it("creates the local QMK command for an exportable project", () => {
    const project = structuredClone(keychronV5MaxProject);
    const issues = validateProject(project, keychronV5MaxKeyboard);

    const plan = createBuildPlan(project, issues, true);

    expect(plan.localCommand).toEqual([
      "qmk",
      "compile",
      "-kb",
      "keychron/v5_max/ansi_encoder",
      "-km",
      "keychron_v5_max",
    ]);
    expect(plan.output).toBe("json");
    expect(plan.localReady).toBe(true);
    expect(plan.selectedReady).toBe(true);
  });

  it("requires local generated C when project features cannot be represented as JSON", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.mode = "remoteApi";
    project.combos = [{ id: "combo_escape", name: "Esc combo", exportMode: "c" }];
    const issues = validateProject(project, keychronV5MaxKeyboard);

    const plan = createBuildPlan(project, issues, true);

    expect(plan.output).toBe("c");
    expect(plan.requiresGeneratedC).toBe(true);
    expect(plan.selectedReady).toBe(false);
    expect(plan.blockers).toContain("build.remote.generatedC");
  });

  it("keeps validation errors and selected-mode dependency gaps as blockers", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.keymapName = "bad keymap";
    const issues = validateProject(project, keychronV5MaxKeyboard);

    const plan = createBuildPlan(project, issues, true);

    expect(plan.canExport).toBe(false);
    expect(plan.localReady).toBe(false);
    expect(plan.selectedReady).toBe(false);
    expect(plan.blockers).toContain("build.keymapName.invalid");

    const missingQmkPlan = createBuildPlan(structuredClone(keychronV5MaxProject), [], false);
    expect(missingQmkPlan.selectedReady).toBe(false);
    expect(missingQmkPlan.blockers).toContain("command.qmk.missing");
  });

  it("forces generated C for a combo/tap-dance/encoder assignment reference", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.outputPreference = "json";
    project.layers[0]!.assignments[0]!.kind = "comboRef";

    const plan = createBuildPlan(project, [], true);

    expect(plan.requiresGeneratedC).toBe(true);
    expect(plan.output).toBe("c");
  });

  it("forces generated C for a JSON-incompatible macro, tap dance, or encoder record", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.outputPreference = "json";
    project.macros = [{ id: "m_off", exportMode: "c", enabled: false }];
    project.tapDances = [{ id: "td", exportMode: "c" }];
    project.encoders = [{ id: "enc", exportMode: "json" }];

    const plan = createBuildPlan(project, [], true);

    expect(plan.requiresGeneratedC).toBe(true);
    expect(plan.output).toBe("c");
  });

  it("does not force generated C when only disabled non-JSON records exist", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.outputPreference = "json";
    project.encoders = [{ id: "enc", exportMode: "c", enabled: false }];

    const plan = createBuildPlan(project, [], true);

    expect(plan.requiresGeneratedC).toBe(false);
    expect(plan.output).toBe("json");
  });
});
