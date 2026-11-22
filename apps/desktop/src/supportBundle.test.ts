import { describe, expect, it } from "vitest";
import project from "../../../fixtures/projects/example-60.json";
import type { DoctorReport } from "./domain";
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
      buildSupportBundle({
        project: fixtureProject,
        includeSensitiveMacroText: false,
        device: { model: "Keychron V5 Max", firmware: "v1.0.0" },
        validation: [
          { code: "x", severity: "error", title: "Bad", path: "layers[0]" } as never,
        ],
        environment: { webhid: true, mode: "production" },
      }),
    );
    expect(bundle.project.target.qmkKeyboard).toBe("example/keyboard");
    expect(bundle.keymap.layers).toHaveLength(fixtureProject.layers.length);
    expect(bundle.lighting.perKey).toEqual({});
    expect(bundle.device.model).toBe("Keychron V5 Max");
    expect(bundle.validation.errors).toBe(1);
    expect(bundle.app.webhid).toBe(true);
    expect(JSON.stringify(bundle)).not.toMatch(/home\/|\/home\//);
    expect(bundle.doctor).toBeNull();
  });

  it("includes lighting rules and keymap assignments", () => {
    const project = structuredClone(fixtureProject);
    project.lightingProfiles = [
      { id: "p", name: "Default", mode: "static", perKey: { k: "#ff0000" } },
    ];
    project.lightingRules = [
      {
        id: "r",
        targetKeyId: "k",
        color: "#00ff00",
        trigger: { kind: "lock", lock: "capsLock" },
      },
    ];
    const bundle = JSON.parse(
      buildSupportBundle({ project, includeSensitiveMacroText: false }),
    );
    expect(bundle.lighting.perKey.k).toBe("#ff0000");
    expect(bundle.lighting.rules[0].trigger.lock).toBe("capsLock");
    expect(bundle.keymap.layers[0].assignments).toHaveLength(
      fixtureProject.layers[0].assignments.length,
    );
  });

  it("redacts local paths and keeps probe/command facts", () => {
    const doctor = {
      snapshot: {
        commands: [
          { name: "qmk", path: "/home/u/bin/qmk", requiredFor: "localBuild" },
          { name: "dfu", path: null, requiredFor: "flashing" },
        ],
        distroId: "arch",
        packageManager: "pacman",
        hardwareProbe: {
          status: "ready",
          reason: "probe failed at /home/u/usb",
          detectedKeyboards: [
            { displayName: "Keychron V5 Max", device: { vid: "3434", pid: "0950" } },
          ],
        },
      },
      findings: [
        {
          code: "x",
          severity: "warning",
          title: "path /home/u/project",
          message: "also C:\\Users\\u\\project",
        },
      ],
    } as unknown as DoctorReport;

    const bundle = JSON.parse(
      buildSupportBundle({ project: fixtureProject, doctor, includeSensitiveMacroText: false }),
    );
    const text = JSON.stringify(bundle);

    expect(text).not.toContain("/home/u");
    expect(text).not.toContain("C:\\Users\\u");
    expect(text).toContain("[path]");
    expect(bundle.doctor.hardwareProbe.detectedKeyboards).toEqual(["3434:0950"]);
    expect(bundle.doctor.commands[0]).toEqual({
      name: "qmk",
      ready: true,
      requiredFor: "localBuild",
    });
  });
});
