import { describe, expect, it, vi } from "vitest";
import { BuildArtifactStore, runLocalBuild, unsupportedBrowserRunner } from "./buildService";
import { createBuildPlan } from "./buildPlan";
import project from "../../../fixtures/projects/example-60.json";
import { Project } from "./domain";

const fixtureProject = project as Project;

describe("local build execution", () => {
  it("reports a successful run with stdout and duration", async () => {
    const runner = vi.fn(async () => ({
      ok: true,
      stdout: "compiled",
      stderr: "",
      durationMs: 42,
    }));
    const plan = createBuildPlan(fixtureProject, [], true);

    const step = await runLocalBuild(plan, runner);

    expect(step.status).toBe("succeeded");
    if (step.status === "succeeded") {
      expect(step.output).toBe("compiled");
      expect(step.command).toContain("qmk compile");
    }
    expect(runner).toHaveBeenCalledWith(plan.localCommand);
  });

  it("reports a failed run with stderr", async () => {
    const runner = vi.fn(async () => ({
      ok: false,
      stdout: "",
      stderr: "qmk: command not found",
      durationMs: 10,
    }));
    const plan = createBuildPlan(fixtureProject, [], true);

    const step = await runLocalBuild(plan, runner);

    expect(step.status).toBe("failed");
    if (step.status === "failed") {
      expect(step.output).toContain("qmk: command not found");
    }
  });

  it("defaults to an unsupported browser runner", async () => {
    const step = await runLocalBuild(
      createBuildPlan(fixtureProject, [], true),
      unsupportedBrowserRunner(),
    );
    expect(step.status).toBe("failed");
    if (step.status === "failed") {
      expect(step.output).toContain("desktop app");
    }
  });
});

describe("build artifact store", () => {
  it("content-addresses artifacts and reports staleness", () => {
    const store = new BuildArtifactStore();
    const artifact = store.put({
      id: "sha256-a",
      projectDigest: "digest-a",
      firmwareSha256: "sha256-a",
      qmkKeyboard: "example/keyboard",
      createdAt: "2026-08-11T00:00:00.000Z",
    });

    expect(store.list()).toEqual([artifact]);
    expect(store.isStale("sha256-a", "digest-a")).toBe(false);
    expect(store.isStale("sha256-a", "digest-changed")).toBe(true);
    expect(store.isStale("missing", "digest-a")).toBe(false);
  });
});