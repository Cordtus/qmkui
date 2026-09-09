import type { KeyboardDefinition, Project, UiIssue } from "./domain";
import { importProjectJson } from "./projectStorage";

const RECOVERY_BUNDLE_FORMAT = "qmkui.recovery-bundle";
const RECOVERY_BUNDLE_VERSION = 1;
const SAFETY_AUDIT_FORMAT = "qmkui.safety-audit";
const SAFETY_AUDIT_VERSION = 1;
const LOCAL_ONLY_NOTICE =
  "This bundle is local-only recovery data. QMKUI does not transmit it, and user-controlled storage cannot be tamper-proof.";

export type SafetyEventKind = "backupConfirmed" | "backupDeclined";
export type SafetyLedgerAvailability = "available" | "unavailable" | "corrupt";

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
  requiresRunConfirmation: boolean;
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
  keyboard: KeyboardDefinition;
  ledger: SafetyLedger;
};

export type SafetyAuditReceipt = {
  format: typeof SAFETY_AUDIT_FORMAT;
  version: typeof SAFETY_AUDIT_VERSION;
  createdAt: string;
  notice: string;
  device: RecoveryDevice;
  event: SafetyEvent;
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
  ledgerAvailability: SafetyLedgerAvailability = "available",
): SafetyAssessment {
  const deviceRevision = revisionFor(keyboard);
  const projectRevision = revisionFor(project);

  if (ledgerAvailability !== "available") {
    return {
      state: "blocked",
      projectRevision,
      deviceRevision,
      requiresRunConfirmation: false,
      reason: `The private safety ledger is ${ledgerAvailability} and cannot be used for future write preparation.`,
    };
  }

  if (!matchesProjectTarget(project, keyboard)) {
    return {
      state: "blocked",
      projectRevision,
      deviceRevision,
      requiresRunConfirmation: false,
      reason: "The selected catalog definition does not match the project target.",
    };
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {
      state: "blocked",
      projectRevision,
      deviceRevision,
      requiresRunConfirmation: false,
      reason: "Resolve project validation errors before preparing a backup or future write.",
    };
  }

  const matchingEvents = ledger.events.filter(
    (event) =>
      event.projectRevision === projectRevision && event.deviceRevision === deviceRevision,
  );
  const latestEvent = matchingEvents.at(-1);
  if (latestEvent?.kind === "backupConfirmed") {
    return {
      state: "backupRecorded",
      projectRevision,
      deviceRevision,
      requiresRunConfirmation: true,
      reason: "A recovery bundle was recorded for this exact project and device state.",
    };
  }
  if (latestEvent?.kind === "backupDeclined") {
    return {
      state: "declined",
      projectRevision,
      deviceRevision,
      requiresRunConfirmation: true,
      reason: "Recovery data was explicitly declined for this exact project and device state.",
    };
  }

  return {
    state: "backupRequired",
    projectRevision,
    deviceRevision,
    requiresRunConfirmation: false,
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
    keyboard: structuredClone(input.keyboard),
    ledger: structuredClone(input.ledger),
  };
}

export function serializeRecoveryBundle(bundle: RecoveryBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function createSafetyAuditReceipt(input: {
  project: Project;
  keyboard: KeyboardDefinition;
  event: SafetyEvent;
}): SafetyAuditReceipt {
  return {
    format: SAFETY_AUDIT_FORMAT,
    version: SAFETY_AUDIT_VERSION,
    createdAt: input.event.occurredAt,
    notice: LOCAL_ONLY_NOTICE,
    device: recoveryDeviceFor(input.project, input.keyboard),
    event: structuredClone(input.event),
  };
}

export function serializeSafetyAuditReceipt(receipt: SafetyAuditReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export function importSafetyAuditReceiptJson(json: string): SafetyAuditReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("Safety audit JSON is invalid", { cause: error });
  }

  if (!isRecord(parsed) || parsed.format !== SAFETY_AUDIT_FORMAT || parsed.version !== 1) {
    throw new Error("Safety audit format is not supported");
  }
  if (typeof parsed.createdAt !== "string" || typeof parsed.notice !== "string") {
    throw new Error("Safety audit metadata is invalid");
  }
  const device = parseRecoveryDevice(parsed.device);
  if (!isSafetyEvent(parsed.event) || parsed.event.kind !== "backupDeclined") {
    throw new Error("Safety audit event is invalid");
  }
  if (parsed.createdAt !== parsed.event.occurredAt) {
    throw new Error("Safety audit timestamps do not match");
  }

  return {
    format: SAFETY_AUDIT_FORMAT,
    version: SAFETY_AUDIT_VERSION,
    createdAt: parsed.createdAt,
    notice: parsed.notice,
    device,
    event: { ...parsed.event },
  };
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
  const keyboard = parseRecoveryKeyboard(parsed.keyboard, device);
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
    keyboard,
    ledger,
  };
}

export function recoveryBundleMatchesKeyboard(
  bundle: RecoveryBundle,
  keyboard: KeyboardDefinition,
): boolean {
  return revisionFor(bundle.keyboard) === revisionFor(keyboard);
}

export function safetyAuditMatchesCurrent(
  receipt: SafetyAuditReceipt,
  project: Project,
  keyboard: KeyboardDefinition,
): boolean {
  return (
    matchesProjectTarget(project, keyboard) &&
    revisionFor(receipt.device) === revisionFor(recoveryDeviceFor(project, keyboard)) &&
    receipt.event.projectRevision === revisionFor(project) &&
    receipt.event.deviceRevision === revisionFor(keyboard)
  );
}

export function mergeSafetyLedgers(
  localLedger: SafetyLedger,
  importedLedger: SafetyLedger,
): SafetyLedger {
  const knownEvents = new Set<string>();
  const events = [...localLedger.events, ...importedLedger.events]
    .filter((event) => {
      const signature = JSON.stringify({
        occurredAt: event.occurredAt,
        kind: event.kind,
        projectRevision: event.projectRevision,
        deviceRevision: event.deviceRevision,
      });
      if (knownEvents.has(signature)) {
        return false;
      }
      knownEvents.add(signature);
      return true;
    })
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((event, index) => ({ ...event, sequence: index + 1 }));

  return { version: 1, events };
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
  return JSON.stringify(canonicalize(value));
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

function parseRecoveryKeyboard(value: unknown, device: RecoveryDevice): KeyboardDefinition {
  if (!isRecord(value) || !Array.isArray(value.layouts)) {
    throw new Error("Recovery bundle catalog definition is invalid");
  }
  if (
    value.id !== device.keyboardId ||
    value.qmkKeyboard !== device.qmkKeyboard ||
    typeof value.displayName !== "string"
  ) {
    throw new Error("Recovery bundle catalog definition is invalid");
  }

  return structuredClone(value) as KeyboardDefinition;
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
    (value.kind === "backupConfirmed" || value.kind === "backupDeclined") &&
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
