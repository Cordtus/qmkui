import { describe, expect, it } from "vitest";
import { validateProject, type Project } from "./domain";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import {
  appendSafetyEvent,
  createEmptySafetyLedger,
  createRecoveryBundle,
  createSafetyAssessment,
  createSafetyAuditReceipt,
  importSafetyAuditReceiptJson,
  importRecoveryBundleJson,
  mergeSafetyLedgers,
  recoveryBundleMatchesKeyboard,
  safetyAuditMatchesCurrent,
  serializeSafetyAuditReceipt,
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
      "backupConfirmed",
      project,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );
    const afterBackup = createSafetyAssessment(project, keychronV5MaxKeyboard, issues, ledger);

    expect(beforeBackup.state).toBe("backupRequired");
    expect(afterBackup.state).toBe("backupRecorded");
    expect(afterBackup.requiresRunConfirmation).toBe(true);
    expect(afterBackup.projectRevision).toBe(beforeBackup.projectRevision);
    expect(afterBackup.deviceRevision).toBe(beforeBackup.deviceRevision);
  });

  it("invalidates a recorded backup when the project or catalog source changes", () => {
    const project = structuredClone(keychronV5MaxProject);
    const issues = validateProject(project, keychronV5MaxKeyboard);
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupConfirmed",
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

    const layoutChangedKeyboard = structuredClone(keychronV5MaxKeyboard);
    layoutChangedKeyboard.layouts[0].keys[0].matrix = { row: 9, col: 9 };
    expect(
      createSafetyAssessment(project, layoutChangedKeyboard, issues, ledger).state,
    ).toBe("backupRequired");
  });

  it("blocks future write eligibility while project validation has errors", () => {
    const project = structuredClone(keychronV5MaxProject);
    project.build.keymapName = "not a valid keymap";
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupConfirmed",
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
      "backupConfirmed",
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
    expect(recoveryBundleMatchesKeyboard(restored, keychronV5MaxKeyboard)).toBe(true);
  });

  it("does not accept a recovery bundle’s prior verification for a changed catalog definition", () => {
    const bundle = createRecoveryBundle({
      project: keychronV5MaxProject,
      keyboard: keychronV5MaxKeyboard,
      ledger: createEmptySafetyLedger(),
      createdAt: "2026-07-17T20:00:00.000Z",
    });
    const changedKeyboard = structuredClone(keychronV5MaxKeyboard);
    changedKeyboard.layouts[0].keys[0].matrix = { row: 9, col: 9 };

    expect(recoveryBundleMatchesKeyboard(bundle, changedKeyboard)).toBe(false);
  });

  it("round-trips a decline audit and only applies it to its exact current state", () => {
    const project = structuredClone(keychronV5MaxProject);
    const ledger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupDeclined",
      project,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );
    const receipt = createSafetyAuditReceipt({
      project,
      keyboard: keychronV5MaxKeyboard,
      event: ledger.events[0],
    });
    const restored = importSafetyAuditReceiptJson(serializeSafetyAuditReceipt(receipt));
    const editedProject = structuredClone(project);
    editedProject.layers[0].assignments[0].qmk = "KC_F13";

    expect(restored.event).toEqual(ledger.events[0]);
    expect(safetyAuditMatchesCurrent(restored, project, keychronV5MaxKeyboard)).toBe(true);
    expect(safetyAuditMatchesCurrent(restored, editedProject, keychronV5MaxKeyboard)).toBe(false);
  });

  it("merges imported safety history without reusing conflicting sequence numbers", () => {
    const localLedger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupConfirmed",
      keychronV5MaxProject,
      keychronV5MaxKeyboard,
      "2026-07-17T20:00:00.000Z",
    );
    const importedLedger = appendSafetyEvent(
      createEmptySafetyLedger(),
      "backupDeclined",
      keychronV5MaxProject,
      keychronV5MaxKeyboard,
      "2026-07-17T20:01:00.000Z",
    );

    expect(mergeSafetyLedgers(localLedger, importedLedger).events).toEqual([
      expect.objectContaining({ sequence: 1, kind: "backupConfirmed" }),
      expect.objectContaining({ sequence: 2, kind: "backupDeclined" }),
    ]);
  });

  it("blocks future write preparation when the private ledger cannot be read safely", () => {
    const assessment = createSafetyAssessment(
      keychronV5MaxProject,
      keychronV5MaxKeyboard,
      validateProject(keychronV5MaxProject, keychronV5MaxKeyboard),
      createEmptySafetyLedger(),
      "corrupt",
    );

    expect(assessment.state).toBe("blocked");
    expect(assessment.reason).toContain("ledger");
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
