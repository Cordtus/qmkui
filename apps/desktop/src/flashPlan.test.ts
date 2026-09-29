import { describe, expect, it } from "vitest";
import { assessFlashRequest, dryRunFlash, flashTargetFromArtifact, FlashRequest } from "./flashPlan";
import project from "../../../fixtures/projects/example-60.json";
import { Project } from "./domain";

const fixtureProject = project as Project;

function request(confirmed: boolean): FlashRequest {
  return {
    target: {
      projectDigest: "digest-a",
      firmwareSha256: "0123456789abcdef",
      qmkKeyboard: "example/one",
      bootloader: "atmel-dfu",
    },
    expectedDevice: { vendorId: "3434", productId: "0950" },
    operatorConfirmed: confirmed,
  };
}

describe("flash policy", () => {
  it("passes when everything matches", () => {
    expect(assessFlashRequest(request(true), "digest-a", { vendorId: "3434", productId: "0950" }, "atmel-dfu")).toEqual({
      pass: true,
    });
  });

  it("blocks without operator confirmation", () => {
    const verdict = assessFlashRequest(request(false), "digest-a", { vendorId: "3434", productId: "0950" }, "atmel-dfu");
    expect(verdict.pass).toBe(false);
    if (!verdict.pass) expect(verdict.reason).toContain("confirm");
  });

  it("blocks stale artifacts", () => {
    const verdict = assessFlashRequest(request(true), "digest-changed", { vendorId: "3434", productId: "0950" }, "atmel-dfu");
    expect(verdict.pass).toBe(false);
    if (!verdict.pass) expect(verdict.reason).toContain("stale");
  });

  it("blocks wrong device identity", () => {
    const verdict = assessFlashRequest(request(true), "digest-a", { vendorId: "0000", productId: "0000" }, "atmel-dfu");
    expect(verdict.pass).toBe(false);
    if (!verdict.pass) expect(verdict.reason).toContain("does not match");
  });

  it("blocks bootloader mismatch and no-device cases", () => {
    const mismatch = assessFlashRequest(request(true), "digest-a", { vendorId: "3434", productId: "0950" }, "rp2040");
    expect(mismatch.pass).toBe(false);
    const noDevice = assessFlashRequest(request(true), "digest-a", null, "atmel-dfu");
    expect(noDevice.pass).toBe(false);
    if (!noDevice.pass) expect(noDevice.reason).toContain("No bootloader device");
  });
});

describe("flash dry run", () => {
  it("records the would-be command sequence without executing", () => {
    const run = dryRunFlash(request(true));
    expect(run.status).toBe("succeeded");
    expect(run.log[0]).toContain("would flash");
    expect(run.log.some((line) => line.includes("no command was executed"))).toBe(true);
  });
});

describe("flash target from artifact", () => {
  it("maps an artifact to a flash target", () => {
    const target = flashTargetFromArtifact(
      {
        id: "sha256-a",
        projectDigest: "digest-a",
        firmwareSha256: "sha256-a",
        qmkKeyboard: "example/one",
        createdAt: "2026-08-11T00:00:00.000Z",
      },
      "atmel-dfu",
    );
    expect(target.qmkKeyboard).toBe("example/one");
    expect(target.bootloader).toBe("atmel-dfu");
    expect(target.projectDigest).toBe("digest-a");
  });
});