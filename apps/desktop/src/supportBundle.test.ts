import { describe, expect, it } from "vitest";
import project from "../../../fixtures/projects/example-60.json";
import { buildSupportBundle } from "./supportBundle";
import { Project } from "./domain";
import type { MacroRecord } from "./macros";

const fixtureProject = project as Project;

function withMacro(actions: string): Project {
  const copy = structuredClone(fixtureProject);
  const macro: MacroRecord = {
    id: "m1",
    name: "Sensitive",
    exportMode: "json",
    enabled: true,
    actions,
  };
  copy.macros = [macro];
  return copy;
}

describe("support bundle", () => {
  it("redacts macro action text by default", () => {
    const bundle = JSON.parse(
      buildSupportBundle({ project: withMacro("TAP KC_W TAP KC_S"), includeSensitiveMacroText: false }),
    );
    expect(bundle.macros[0].actions).toBe("[redacted]");
  });

  it("includes macro actions when explicitly requested", () => {
    const bundle = JSON.parse(
      buildSupportBundle({ project: withMacro("TAP KC_W"), includeSensitiveMacroText: true }),
    );
    expect(bundle.macros[0].actions).toBe("TAP KC_W");
  });

  it("summarizes project identity without leaking local paths", () => {
    const bundle = JSON.parse(
      buildSupportBundle({ project: fixtureProject, includeSensitiveMacroText: false }),
    );
    expect(bundle.project.qmkKeyboard).toBe("example/keyboard");
    expect(JSON.stringify(bundle)).not.toMatch(/home\/|\/home\//);
    expect(bundle.doctor).toBeNull();
  });
});
