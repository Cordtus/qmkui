import { describe, expect, it } from "vitest";
import project from "../../../fixtures/projects/example-60.json";
import { migrateProject } from "./migrations";

describe("project migration", () => {
  it("passes a current-version project through unchanged", () => {
    const result = migrateProject(project);
    expect(result).toMatchObject({
      schemaVersion: "0.1.0",
      target: { keyboardId: "example/keyboard" },
    });
  });

  it("rejects a non-object payload", () => {
    expect(() => migrateProject("not an object")).toThrow("Project JSON is not an object");
  });

  it("rejects a payload without a schemaVersion", () => {
    expect(() => migrateProject({ id: "no-version" })).toThrow(
      "Project JSON is missing schemaVersion",
    );
  });

  it("rejects a version with no migration path", () => {
    expect(() => migrateProject({ ...project, schemaVersion: "99.0.0" })).toThrow(
      "Project schema version 99.0.0 is not supported",
    );
  });
});
