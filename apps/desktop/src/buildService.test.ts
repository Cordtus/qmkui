import { describe, expect, it, vi } from "vitest";
import { runLocalBuild, unsupportedBrowserRunner } from "./buildService";
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