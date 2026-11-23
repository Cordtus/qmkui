import { BuildArtifact } from "./buildService";

export type FlashTarget = {
  projectDigest: string;
  qmkKeyboard: string;
  bootloader: string;
};

export type FlashRequest = {
  target: FlashTarget;
  operatorConfirmed: boolean;
};

export type PolicyVerdict = { pass: boolean; reason: string };

/**
 * Browser preview policy: the browser can verify operator confirmation and
 * artifact freshness, but cannot see bootloader mode. It never claims the
 * device-side policy passed.
 */
export function previewFlashRequest(
  request: FlashRequest,
  currentProjectDigest: string,
): PolicyVerdict {
  if (!request.operatorConfirmed) {
    return { pass: false, reason: "Operator has not confirmed the flash target." };
  }
  if (request.target.projectDigest !== currentProjectDigest) {
    return { pass: false, reason: "Artifact is stale relative to the current project." };
  }
  return {
    pass: true,
    reason: "Confirmation and artifact match; qmkui-flash checks the bootloader at flash time.",
  };
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
    `preview: ${request.target.qmkKeyboard} for ${request.target.bootloader}`,
    "preview only: no command was executed; qmkui-flash checks the bootloader device.",
  ];
  return { status: "success", log };
}

export function flashTargetFromArtifact(artifact: BuildArtifact, bootloader: string): FlashTarget {
  return {
    projectDigest: artifact.projectDigest,
    qmkKeyboard: artifact.qmkKeyboard,
    bootloader,
  };
}