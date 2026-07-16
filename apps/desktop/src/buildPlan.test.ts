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
    expect(plan.remoteReady).toBe(false);
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
    expect(plan.remoteReady).toBe(false);
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
});
