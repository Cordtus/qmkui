import { describe, expect, it } from "vitest";
import type { DoctorReport } from "./domain";
import { loadLocalDoctorReport } from "./doctorReport";

describe("local Doctor report loading", () => {
  it("does not fetch when local reports are disabled", async () => {
    let calls = 0;

    const report = await loadLocalDoctorReport(async () => {
      calls += 1;
      throw new Error("must not fetch");
    }, false);

    expect(report).toBeNull();
    expect(calls).toBe(0);
  });

  it("returns a local report after a successful response", async () => {
    const expected = {
      findings: [],
      snapshot: {
        commands: [],
        hardwareProbe: {
          status: "skipped",
          reason: "test",
          devices: [],
          detectedKeyboards: [],
        },
      },
    } as DoctorReport;

    const report = await loadLocalDoctorReport(
      async () => new Response(JSON.stringify(expected), { status: 200 }),
      true,
    );

    expect(report).toEqual(expected);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a missing snapshot", { findings: [] }],
    [
      "an invalid hardware probe",
      { findings: [], snapshot: { commands: [], hardwareProbe: null } },
    ],
    [
      "an invalid finding",
      {
        findings: [null],
        snapshot: {
          commands: [],
          hardwareProbe: { status: "skipped", reason: "test" },
        },
      },
    ],
  ])("treats %s JSON payload as unavailable", async (_scenario, payload) => {
    const report = await loadLocalDoctorReport(
      async () => new Response(JSON.stringify(payload), { status: 200 }),
      true,
    );

    expect(report).toBeNull();
  });

  it("treats a missing local report as unavailable", async () => {
    const report = await loadLocalDoctorReport(
      async () => new Response("missing", { status: 404 }),
      true,
    );

    expect(report).toBeNull();
  });

  it("treats fetch and parsing errors as unavailable", async () => {
    const rejected = await loadLocalDoctorReport(async () => {
      throw new Error("network unavailable");
    }, true);
    const malformed = await loadLocalDoctorReport(
      async () => new Response("not JSON", { status: 200 }),
      true,
    );

    expect(rejected).toBeNull();
    expect(malformed).toBeNull();
  });
});
