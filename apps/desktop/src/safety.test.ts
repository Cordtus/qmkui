import { describe, expect, it } from "vitest";
import { validateProject, type Project } from "./domain";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import {
  appendSafetyEvent,
  createEmptySafetyLedger,
  createRecoveryBundle,
  createSafetyAssessment,
  importRecoveryBundleJson,
  serializeRecoveryBundle,
} from "./safety";

describe("safety foundation", () => {
  it("requires a backup for a valid project until that exact project and device are recorded", () => {
    const project = structuredClone(keychronV5MaxProject);
    const issues = validateProject(project, keychronV5MaxKeyboard);
    const emptyLedger = createEmptySafetyLedger();

    const beforeBackup = createSafetyAssessment(project, keychronV5MaxKeyboard, issues, emptyLedger);
    const ledger = appendSafetyEvent(
      emptyLedger,
      "backupCreated",
      project,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );
    const afterBackup = createSafetyAssessment(project, keychronV5MaxKeyboard, issues, ledger);

    expect(beforeBackup.state).toBe("backupRequired");
    expect(afterBackup.state).toBe("backupRecorded");
    expect(afterBackup.projectRevision).toBe(beforeBackup.projectRevision);
    expect(afterBackup.deviceRevision).toBe(beforeBackup.deviceRevision);
  });

  it("invalidates a recorded backup when the project or catalog source changes", () => {
    const project = structuredClone(keychronV5MaxProject);
    const issues = validateProject(project, keychronV5MaxKeyboard);
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupCreated",
      project,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );
    const editedProject = structuredClone(project);
    editedProject.layers[0].assignments[0].qmk = "KC_F13";
    const updatedKeyboard = structuredClone(keychronV5MaxKeyboard);
    updatedKeyboard.source = {
      kind: updatedKeyboard.source?.kind ?? "qmk",
      version: "different-source",
    };

    expect(createSafetyAssessment(editedProject, keychronV5MaxKeyboard, issues, ledger).state).toBe(
      "backupRequired",
    );
    expect(createSafetyAssessment(project, updatedKeyboard, issues, ledger).state).toBe("backupRequired");
  });

  it("blocks future write eligibility while project validation has errors", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.keymapName = "not a valid keymap";
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupCreated",
      keychronV5MaxProject,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );

    const assessment = createSafetyAssessment(
      project,
      keychronV5MaxKeyboard,
      validateProject(project, keychronV5MaxKeyboard),
      ledger,
    );

    expect(assessment.state).toBe("blocked");
  });

  it("blocks backup eligibility when the selected catalog definition is not the project target", () => {
    const mismatchedKeyboard = structuredClone(keychronV5MaxKeyboard);
    mismatchedKeyboard.id = "different/keyboard";
    mismatchedKeyboard.qmkKeyboard = "different/keyboard";

    const assessment = createSafetyAssessment(
      keychronV5MaxProject,
      mismatchedKeyboard,
      [],
      createEmptySafetyLedger(),
    );

    expect(assessment.state).toBe("blocked");
    expect(assessment.reason).toContain("does not match");
  });

  it("records an explicit decline for only the exact current project and device", () => {
    const project = structuredClone(keychronV5MaxProject);
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupDeclined",
      project,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );

    expect(
      createSafetyAssessment(
        project,
        keychronV5MaxKeyboard,
        validateProject(project, keychronV5MaxKeyboard),
        ledger,
      ).state,
    ).toBe("declined");
  });

  it("round-trips a local recovery bundle with the project, exact device facts, and ledger", () => {
    const project = structuredClone(keychronV5MaxProject);
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupCreated",
      project,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );

    const bundle = createRecoveryBundle({
      project,
      keyboard: keychronV5MaxKeyboard,
      ledger,
      createdAt: "2026-07-17T20:00:00.000Z",
    });
    const restored = importRecoveryBundleJson(serializeRecoveryBundle(bundle));

    expect(restored.project).toEqual(project);
    expect(restored.device).toMatchObject({
      keyboardId: "keychron/v5_max/ansi_encoder",
      qmkKeyboard: "keychron/v5_max/ansi_encoder",
      sourceVersion: "keychron-qmk-b4bdf3f1-v5-max",
      usb: { vid: "3434", pid: "0950" },
    });
    expect(restored.ledger.events).toHaveLength(1);
  });

  it("rejects a recovery bundle with an invalid project payload", () => {
    const invalidBundle = {
      format: "qmkui.recovery-bundle",
      version: 1,
      createdAt: "2026-07-17T20:00:00.000Z",
      notice: "Local-only recovery data.",
      project: { id: "not-a-project" } satisfies Partial<Project>,
      device: {},
      ledger: { version: 1, events: [] },
    };

    expect(() => importRecoveryBundleJson(JSON.stringify(invalidBundle))).toThrow(
      "Recovery bundle project is invalid",
    );
  });
});
