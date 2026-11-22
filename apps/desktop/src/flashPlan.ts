import { BuildArtifact } from "./buildService";

export type FlashTarget = {
  projectDigest: string;
  firmwareSha256: string;
  qmkKeyboard: string;
  bootloader: string;
};

export type DeviceIdentity = {
  vendorId: string;
  productId: string;
};

export type FlashRequest = {
  target: FlashTarget;
  expectedDevice: DeviceIdentity;
  operatorConfirmed: boolean;
};

export type PolicyVerdict =
  | { pass: true }
  | { pass: false; reason: string };

/**
 * Wrong-target blocking, mirroring `qmkui-flash::policy::assess_request`. A
 * flash request only passes when the operator has explicitly confirmed, the
 * artifact matches the current project digest, and the detected device and
 * bootloader family match the target.
 */
export function assessFlashRequest(
  request: FlashRequest,
  currentProjectDigest: string,
  detectedDevice: DeviceIdentity | null,
  detectedBootloader: string | null,
): PolicyVerdict {
  if (!request.operatorConfirmed) {
    return { pass: false, reason: "Operator has not confirmed the flash target." };
  }
  if (request.target.projectDigest !== currentProjectDigest) {
    return { pass: false, reason: "Artifact is stale relative to the current project." };
  }
  if (!detectedDevice) {
    return { pass: false, reason: "No bootloader device was detected." };
  }
  if (detectedDevice.vendorId !== request.expectedDevice.vendorId || detectedDevice.productId !== request.expectedDevice.productId) {
    return { pass: false, reason: "Connected device does not match the flash target." };
  }
  if (!detectedBootloader) {
    return { pass: false, reason: "Bootloader family could not be determined." };
  }
  if (detectedBootloader !== request.target.bootloader) {
    return {
      pass: false,
      reason: `Bootloader family mismatch: expected ${request.target.bootloader}, found ${detectedBootloader}.`,
    };
  }
  return { pass: true };
}

export type FlashRun = {
  status: "success" | "failed" | "cancelled";
  log: string[];
};

/**
 * Flash preview. Records what the native adapter will do without executing
 * anything. The browser cannot see bootloader mode, so this never claims the
 * device-side policy passed; `qmkui-flash` checks that at flash time.
 */
export function dryRunFlash(request: FlashRequest): FlashRun {
  const log = [
    `preview: ${request.target.qmkKeyboard} (${request.target.firmwareSha256.slice(0, 12)}) for ${request.target.bootloader}`,
    "preview only: no command was executed; qmkui-flash checks the bootloader device.",
  ];
  return { status: "success", log };
}

export function flashTargetFromArtifact(artifact: BuildArtifact, bootloader: string): FlashTarget {
  return {
    projectDigest: artifact.projectDigest,
    firmwareSha256: artifact.firmwareSha256,
    qmkKeyboard: artifact.qmkKeyboard,
    bootloader,
  };
}