import { describe, expect, it } from "vitest";
import project from "../../../fixtures/projects/example-60.json";
import type { Project } from "./domain";
import {
  createLocalStorageProjectStorage,
  createMemoryProjectStorage,
  importProjectJson,
} from "./projectStorage";

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
    expect(() => importProjectJson(JSON.stringify("x"))).toThrow(
      "Project JSON is not an object",
    );
    expect(() => importProjectJson(JSON.stringify({ id: "missing-fields" }))).toThrow(
      "Project JSON is missing schemaVersion",
    );
    expect(() =>
      importProjectJson(JSON.stringify({ ...fixtureProject, schemaVersion: "99.0.0" })),
    ).toThrow("Project schema version 99.0.0 is not supported");
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

describe("localStorage project storage", () => {
  it("persists projects across adapter instances like a page reload", () => {
    const storage = createFakeStorage();
    const first = createLocalStorageProjectStorage(() => "2026-06-27T19:00:00.000Z", storage);
    const savedProject = structuredClone(fixtureProject);
    savedProject.id = "project_reload";
    savedProject.name = "Survives Reload";
    first.save(savedProject);

    const second = createLocalStorageProjectStorage(() => "2026-06-27T19:00:00.000Z", storage);
    expect(second.list()).toEqual([
      {
        id: "project_reload",
        name: "Survives Reload",
        keyboardId: "example/keyboard",
        qmkKeyboard: "example/keyboard",
        updatedAt: "2026-06-27T19:00:00.000Z",
      },
    ]);
    expect(second.load("project_reload")?.name).toBe("Survives Reload");
  });

  it("returns editable copies that do not mutate the stored project", () => {
    const storage = createFakeStorage();
    const persisted = createLocalStorageProjectStorage(() => "2026-06-27T19:00:00.000Z", storage);
    persisted.save(fixtureProject);

    const loaded = persisted.load(fixtureProject.id);
    loaded!.name = "Edited";

    expect(persisted.load(fixtureProject.id)?.name).toBe(fixtureProject.name);
  });

  it("ignores corrupt entries and still lists valid ones", () => {
    const storage = createFakeStorage();
    storage.setItem("qmkui.projects.v1.corrupt", "{not json");
    const persisted = createLocalStorageProjectStorage(() => "2026-06-27T19:00:00.000Z", storage);
    persisted.save(fixtureProject);

    expect(persisted.list().map((summary) => summary.id)).toEqual([fixtureProject.id]);
  });

  it("removes only the requested project and reports existence", () => {
    const storage = createFakeStorage();
    const persisted = createLocalStorageProjectStorage(() => "2026-06-27T19:00:00.000Z", storage);
    persisted.save(fixtureProject);

    expect(persisted.remove("missing")).toBe(false);
    expect(persisted.remove(fixtureProject.id)).toBe(true);
    expect(persisted.list()).toEqual([]);
  });
});

function createFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  } as Storage;
}
