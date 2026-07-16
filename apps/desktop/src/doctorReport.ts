import type { DoctorReport } from "./domain";

const localDoctorReportUrl = "/doctor-readiness.local.json";

export async function loadLocalDoctorReport(
  fetcher: typeof fetch,
  enabled: boolean,
): Promise<DoctorReport | null> {
  if (!enabled) {
    return null;
  }

  try {
    const response = await fetcher(localDoctorReportUrl, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const report: unknown = await response.json();
    return isDoctorReport(report) ? report : null;
  } catch {
    return null;
  }
}

function isDoctorReport(value: unknown): value is DoctorReport {
  if (!isRecord(value) || !isRecord(value.snapshot) || !Array.isArray(value.findings)) {
    return false;
  }

  const snapshot = value.snapshot;
  return (
    value.findings.every(isFinding) &&
    isOptionalArray(snapshot.commands, isCommandStatus) &&
    isOptionalString(snapshot.distroId) &&
    isOptionalString(snapshot.packageManager) &&
    isQmkPackage(snapshot.qmkPackage) &&
    isHardwareProbe(snapshot.hardwareProbe)
  );
}

function isFinding(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.severity === "string" &&
    typeof value.title === "string" &&
    typeof value.message === "string"
  );
}

function isCommandStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (typeof value.path === "string" || value.path === null) &&
    (value.requiredFor === "localBuild" ||
      value.requiredFor === "flashing" ||
      value.requiredFor === "catalogSync")
  );
}

function isQmkPackage(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (isRecord(value) &&
      typeof value.name === "string" &&
      isOptionalString(value.version) &&
      typeof value.installed === "boolean")
  );
}

function isHardwareProbe(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.status === "skipped" || value.status === "ready" || value.status === "blocked") &&
    typeof value.reason === "string" &&
    isOptionalArray(value.devices, isUsbDevice) &&
    isOptionalArray(value.detectedKeyboards, isDetectedKeyboard)
  );
}

function isUsbDevice(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.sysfsName === "string" &&
    typeof value.vid === "string" &&
    typeof value.pid === "string" &&
    isOptionalString(value.manufacturer) &&
    isOptionalString(value.product)
  );
}

function isDetectedKeyboard(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.catalogKeyboardId === "string" &&
    typeof value.displayName === "string" &&
    isOptionalString(value.qmkKeyboard) &&
    typeof value.layoutId === "string" &&
    (value.matchKind === "usbVidPid" || value.matchKind === "productText") &&
    typeof value.confidence === "number" &&
    isUsbDevice(value.device) &&
    isOptionalString(value.note)
  );
}

function isOptionalArray(
  value: unknown,
  itemGuard: (item: unknown) => boolean,
): boolean {
  return value === undefined || (Array.isArray(value) && value.every(itemGuard));
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
