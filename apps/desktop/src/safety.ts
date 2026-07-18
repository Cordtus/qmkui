import type { KeyboardDefinition, Project, UiIssue } from "./domain";
import { importProjectJson } from "./projectStorage";

const RECOVERY_BUNDLE_FORMAT = "qmkui.recovery-bundle";
const RECOVERY_BUNDLE_VERSION = 1;
const LOCAL_ONLY_NOTICE =
  "This bundle is local-only recovery data. QMKUI does not transmit it, and user-controlled storage cannot be tamper-proof.";

export type SafetyEventKind = "backupCreated" | "backupDeclined";

export type SafetyEvent = {
  sequence: number;
  occurredAt: string;
  kind: SafetyEventKind;
  projectRevision: string;
  deviceRevision: string;
};

export type SafetyLedger = {
  version: 1;
  events: SafetyEvent[];
};

export type SafetyState = "blocked" | "backupRequired" | "backupRecorded" | "declined";

export type SafetyAssessment = {
  state: SafetyState;
  projectRevision: string;
  deviceRevision: string;
  reason: string;
};

export type RecoveryDevice = {
  keyboardId: string;
  qmkKeyboard: string;
  layoutId: string;
  qmkLayoutMacro: string;
  catalogVersion: string | null;
  sourceKind: string | null;
  sourceVersion: string | null;
  usb: { vid: string; pid: string } | null;
};

export type RecoveryBundle = {
  format: typeof RECOVERY_BUNDLE_FORMAT;
  version: typeof RECOVERY_BUNDLE_VERSION;
  createdAt: string;
  notice: string;
  project: Project;
  device: RecoveryDevice;
  ledger: SafetyLedger;
};

export function createEmptySafetyLedger(): SafetyLedger {
  return { version: 1, events: [] };
}

export function appendSafetyEvent(
  ledger: SafetyLedger,
  kind: SafetyEventKind,
  project: Project,
  keyboard: KeyboardDefinition,
  occurredAt: string,
): SafetyLedger {
  const assessment = createSafetyAssessment(project, keyboard, [], ledger);
  const sequence = Math.max(0, ...ledger.events.map((event) => event.sequence)) + 1;

  return {
    version: 1,
    events: [
      ...ledger.events.map((event) => ({ ...event })),
      {
        sequence,
        occurredAt,
        kind,
        projectRevision: assessment.projectRevision,
        deviceRevision: assessment.deviceRevision,
      },
    ],
  };
}

export function createSafetyAssessment(
  project: Project,
  keyboard: KeyboardDefinition,
  issues: UiIssue[],
  ledger: SafetyLedger,
): SafetyAssessment {
  const deviceRevision = revisionFor(recoveryDeviceFor(project, keyboard));
  const projectRevision = revisionFor(project);

  if (!matchesProjectTarget(project, keyboard)) {
    return {
      state: "blocked",
      projectRevision,
      deviceRevision,
      reason: "The selected catalog definition does not match the project target.",
    };
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      state: "blocked",
      projectRevision,
      deviceRevision,
      reason: "Resolve project validation errors before preparing a backup or future write.",
    };
  }

  const matchingEvents = ledger.events.filter(
    (event) =>
      event.projectRevision === projectRevision && event.deviceRevision === deviceRevision,
  );
  const latestEvent = matchingEvents.at(-1);
  if (latestEvent?.kind === "backupCreated") {
    return {
      state: "backupRecorded",
      projectRevision,
      deviceRevision,
      reason: "A recovery bundle was recorded for this exact project and device state.",
    };
  }
  if (latestEvent?.kind === "backupDeclined") {
    return {
      state: "declined",
      projectRevision,
      deviceRevision,
      reason: "Recovery data was explicitly declined for this exact project and device state.",
    };
  }

  return {
    state: "backupRequired",
    projectRevision,
    deviceRevision,
    reason: "Create a recovery bundle before any future write operation.",
  };
}

export function createRecoveryBundle(input: {
  project: Project;
  keyboard: KeyboardDefinition;
  ledger: SafetyLedger;
  createdAt: string;
}): RecoveryBundle {
  if (!matchesProjectTarget(input.project, input.keyboard)) {
    throw new Error("Recovery bundle keyboard does not match the project target");
  }

  return {
    format: RECOVERY_BUNDLE_FORMAT,
    version: RECOVERY_BUNDLE_VERSION,
    createdAt: input.createdAt,
    notice: LOCAL_ONLY_NOTICE,
    project: structuredClone(input.project),
    device: recoveryDeviceFor(input.project, input.keyboard),
    ledger: structuredClone(input.ledger),
  };
}

export function serializeRecoveryBundle(bundle: RecoveryBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function importRecoveryBundleJson(json: string): RecoveryBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("Recovery bundle JSON is invalid", { cause: error });
  }

  if (!isRecord(parsed) || parsed.format !== RECOVERY_BUNDLE_FORMAT || parsed.version !== 1) {
    throw new Error("Recovery bundle format is not supported");
  }
  if (typeof parsed.createdAt !== "string" || typeof parsed.notice !== "string") {
    throw new Error("Recovery bundle metadata is invalid");
  }

  let project: Project;
  try {
    project = importProjectJson(JSON.stringify(parsed.project));
  } catch (error) {
    throw new Error("Recovery bundle project is invalid", { cause: error });
  }
  const device = parseRecoveryDevice(parsed.device);
  const ledger = parseSafetyLedger(parsed.ledger);

  if (
    device.keyboardId !== project.target.keyboardId ||
    device.qmkKeyboard !== project.target.qmkKeyboard ||
    device.layoutId !== project.target.layoutId ||
    device.qmkLayoutMacro !== project.target.qmkLayoutMacro
  ) {
    throw new Error("Recovery bundle device does not match its project target");
  }

  return {
    format: RECOVERY_BUNDLE_FORMAT,
    version: RECOVERY_BUNDLE_VERSION,
    createdAt: parsed.createdAt,
    notice: parsed.notice,
    project,
    device,
    ledger,
  };
}

export function recoveryDeviceFor(project: Project, keyboard: KeyboardDefinition): RecoveryDevice {
  return {
    keyboardId: project.target.keyboardId,
    qmkKeyboard: project.target.qmkKeyboard,
    layoutId: project.target.layoutId,
    qmkLayoutMacro: project.target.qmkLayoutMacro,
    catalogVersion: project.target.catalogVersion ?? null,
    sourceKind: keyboard.source?.kind ?? null,
    sourceVersion: keyboard.source?.version ?? null,
    usb: keyboard.usb ? { ...keyboard.usb } : null,
  };
}

function revisionFor(value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function matchesProjectTarget(project: Project, keyboard: KeyboardDefinition): boolean {
  return (
    project.target.keyboardId === keyboard.id &&
    project.target.qmkKeyboard === keyboard.qmkKeyboard &&
    keyboard.layouts.some(
      (layout) =>
        layout.id === project.target.layoutId &&
        layout.qmkLayoutMacro === project.target.qmkLayoutMacro,
    )
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function parseRecoveryDevice(value: unknown): RecoveryDevice {
  if (!isRecord(value)) {
    throw new Error("Recovery bundle device is invalid");
  }
  if (
    typeof value.keyboardId !== "string" ||
    typeof value.qmkKeyboard !== "string" ||
    typeof value.layoutId !== "string" ||
    typeof value.qmkLayoutMacro !== "string" ||
    !isNullableString(value.catalogVersion) ||
    !isNullableString(value.sourceKind) ||
    !isNullableString(value.sourceVersion)
  ) {
    throw new Error("Recovery bundle device is invalid");
  }
  if (value.usb !== null && !isUsb(value.usb)) {
    throw new Error("Recovery bundle device is invalid");
  }

  return {
    keyboardId: value.keyboardId,
    qmkKeyboard: value.qmkKeyboard,
    layoutId: value.layoutId,
    qmkLayoutMacro: value.qmkLayoutMacro,
    catalogVersion: value.catalogVersion,
    sourceKind: value.sourceKind,
    sourceVersion: value.sourceVersion,
    usb: value.usb === null ? null : { ...value.usb },
  };
}

export function parseSafetyLedger(value: unknown): SafetyLedger {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) {
    throw new Error("Recovery bundle safety ledger is invalid");
  }
  if (!value.events.every(isSafetyEvent)) {
    throw new Error("Recovery bundle safety ledger is invalid");
  }

  return {
    version: 1,
    events: value.events.map((event) => ({ ...event })),
  };
}

function isSafetyEvent(value: unknown): value is SafetyEvent {
  return (
    isRecord(value) &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence > 0 &&
    typeof value.occurredAt === "string" &&
    (value.kind === "backupCreated" || value.kind === "backupDeclined") &&
    typeof value.projectRevision === "string" &&
    typeof value.deviceRevision === "string"
  );
}

function isUsb(value: unknown): value is { vid: string; pid: string } {
  return isRecord(value) && typeof value.vid === "string" && typeof value.pid === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
