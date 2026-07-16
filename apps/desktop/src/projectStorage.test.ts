import { describe, expect, it } from "vitest";
import project from "../../../fixtures/projects/example-60.json";
import type { Project } from "./domain";
import { createMemoryProjectStorage, importProjectJson } from "./projectStorage";

const fixtureProject = project as Project;

describe("project storage", () => {
  it("saves projects as snapshots and lists the most recent first", () => {
    const storage = createMemoryProjectStorage(() => "2026-06-27T19:00:00.000Z");
    const firstProject = structuredClone(fixtureProject);
    firstProject.id = "project_a";
    firstProject.name = "Alpha";
    const secondProject = structuredClone(fixtureProject);
    secondProject.id = "project_b";
    secondProject.name = "Beta";

    storage.save(firstProject);
    storage.save(secondProject);
    firstProject.name = "Mutated after save";

    expect(storage.list()).toEqual([
      {
        id: "project_b",
        name: "Beta",
        keyboardId: "example/keyboard",
        qmkKeyboard: "example/keyboard",
        updatedAt: "2026-06-27T19:00:00.000Z",
      },
      {
        id: "project_a",
        name: "Alpha",
        keyboardId: "example/keyboard",
        qmkKeyboard: "example/keyboard",
        updatedAt: "2026-06-27T19:00:00.000Z",
      },
    ]);
    expect(storage.load("project_a")?.name).toBe("Alpha");
  });

  it("loads projects as editable copies", () => {
    const storage = createMemoryProjectStorage(() => "2026-06-27T19:00:00.000Z");
    storage.save(fixtureProject);

    const loaded = storage.load(fixtureProject.id);
    expect(loaded).not.toBeNull();
    loaded!.name = "Edited";

    expect(storage.load(fixtureProject.id)?.name).toBe(fixtureProject.name);
  });

  it("imports valid project JSON and rejects non-project payloads", () => {
    expect(importProjectJson(JSON.stringify(fixtureProject))).toMatchObject({
      id: fixtureProject.id,
      target: { keyboardId: "example/keyboard" },
    });

    expect(() => importProjectJson("{bad json")).toThrow("Project JSON is invalid");
    expect(() => importProjectJson(JSON.stringify({ id: "missing-fields" }))).toThrow(
      "Project JSON is missing schemaVersion",
    );
  });

  it("rejects a project whose build settings are incomplete", () => {
    const malformedProject = {
      ...fixtureProject,
      build: {},
    };

    expect(() => importProjectJson(JSON.stringify(malformedProject))).toThrow(
      "Project JSON has invalid build",
    );
  });

  it("rejects malformed nested layer entries", () => {
    const malformedProject = {
      ...fixtureProject,
      layers: [{}],
    };

    expect(() => importProjectJson(JSON.stringify(malformedProject))).toThrow(
      "Project JSON has invalid layers[0]",
    );
  });
});
