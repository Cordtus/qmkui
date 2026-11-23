import { describe, expect, it } from "vitest";
import { dryRunFlash, flashTargetFromArtifact, previewFlashRequest, FlashRequest } from "./flashPlan";
function request(confirmed: boolean): FlashRequest {
  return {
    target: {
      projectDigest: "digest-a",
      qmkKeyboard: "example/one",
      bootloader: "atmel-dfu",
    },
    operatorConfirmed: confirmed,
  };
}

describe("browser flash preview", () => {
  it("checks confirmation and freshness without claiming bootloader detection", () => {
    const ready = previewFlashRequest(request(true), "digest-a");
    expect(ready.pass).toBe(true);
    expect(ready.reason).toContain("qmkui-flash checks");

    const unconfirmed = previewFlashRequest(request(false), "digest-a");
    expect(unconfirmed.pass).toBe(false);
    if (!unconfirmed.pass) expect(unconfirmed.reason).toContain("confirm");

    const stale = previewFlashRequest(request(true), "digest-changed");
    expect(stale.pass).toBe(false);
  });
});

describe("flash dry run", () => {
  it("records the would-be command sequence without executing", () => {
    const run = dryRunFlash(request(true));
    expect(run.status).toBe("success");
    expect(run.log[0]).toContain("preview:");
    expect(run.log.some((line) => line.includes("no command was executed"))).toBe(true);
  });
});

describe("flash target from artifact", () => {
  it("maps an artifact to a flash target", () => {
    const target = flashTargetFromArtifact(
      {
        id: "sha256-a",
        projectDigest: "digest-a",
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