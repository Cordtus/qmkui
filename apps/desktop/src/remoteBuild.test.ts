import { describe, expect, it, vi } from "vitest";
import project from "../../../fixtures/projects/example-60.json";
import { remoteBuildEligibility, submitRemoteBuild } from "./remoteBuild";
import { Project, UiIssue } from "./domain";

const fixtureProject = project as Project;

describe("remote build eligibility", () => {
  it("is eligible for a clean JSON-exportable project", () => {
    expect(remoteBuildEligibility(fixtureProject, [])).toEqual({
      eligible: true,
      blockers: [],
    });
  });

  it("blocks on validation errors", () => {
    const issues: UiIssue[] = [
      {
        code: "layer.assignmentCount.mismatch",
        severity: "error",
        title: "Assignment count mismatch",
        path: "layers[1]",
      },
    ];
    const result = remoteBuildEligibility(fixtureProject, issues);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes("validation"))).toBe(true);
  });

  it("blocks generated-C features", () => {
    const withMacro = structuredClone(fixtureProject);
    withMacro.macros = [{ id: "m1", name: "Warp", exportMode: "c", enabled: true }];
    const result = remoteBuildEligibility(withMacro, []);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some((blocker) => blocker.includes("generated C"))).toBe(true);
  });
});

describe("remote build submission", () => {
  it("refuses to upload without consent", async () => {
    await expect(
      submitRemoteBuild(
        { keymapJson: {}, keymapName: "default", consentGranted: false, blockers: [] },
        vi.fn(),
      ),
    ).rejects.toThrow("Consent is required");
  });

  it("refuses a project that is not JSON-exportable", async () => {
    await expect(
      submitRemoteBuild(
        {
          keymapJson: {},
          keymapName: "default",
          consentGranted: true,
          blockers: ["Combos require generated C and cannot be exported as QMK JSON."],
        },
        vi.fn(),
      ),
    ).rejects.toThrow("generated C");
  });

  it("submits and returns a queued job when eligible and consented", async () => {
    const submit = vi.fn(async () => ({ id: "job-1" }));
    const job = await submitRemoteBuild(
      { keymapJson: { keyboard: "example/keyboard" }, keymapName: "default", consentGranted: true, blockers: [] },
      submit,
    );
    expect(job).toEqual({ id: "job-1", status: "queued", keymapName: "default" });
    expect(submit).toHaveBeenCalledWith({
      keymapJson: { keyboard: "example/keyboard" },
      keymapName: "default",
    });
  });
});
