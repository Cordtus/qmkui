import { BuildRunner } from "./buildService";
import { FlashRun, PolicyVerdict } from "./flashPlan";
import { RemoteSubmit } from "./remoteBuild";
import { isNativeRuntime } from "./devices/nativeKeyboardDiscovery";
import { Project } from "./domain";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

async function nativeInvoke(): Promise<Invoke | null> {
  if (!isNativeRuntime()) {
    return null;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke as Invoke;
}

/**
 * Runs the local `qmk compile` through the Tauri shell's native runner. Falls
 * back to a clear error in the browser where no process access exists.
 */
export async function nativeBuildRunner(project: Project): Promise<BuildRunner> {
  const invoke = await nativeInvoke();
  if (!invoke) {
    return async () => ({
      ok: false,
      stdout: "",
      stderr: "Local builds are only available in the QMKUI desktop app.",
      durationMs: 0,
    });
  }
  const projectJson = JSON.stringify(project);
  return async (command: string[]) => {
    const result = (await invoke("run_local_build", {
      projectJson,
    })) as {
      ok: boolean;
      stdout: string;
      stderr: string;
      durationMs: number;
      artifactId?: string;
      projectDigest: string;
    };
    return {
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    };
  };
}

/**
 * Submits a remote build through the Tauri shell. Returns a clear error until a
 * remote endpoint is configured; the injectable browser transport reports the
 * same.
 */
export async function nativeRemoteSubmit(): Promise<RemoteSubmit> {
  const invoke = await nativeInvoke();
  return async (payload) => {
    if (!invoke) {
      throw new Error("Remote build is not configured in the browser app.");
    }
    const id = (await invoke("submit_remote_build", {
      keymapJson: payload.keymapJson,
      keymapName: payload.keymapName,
    })) as string;
    return { id };
  };
}

/**
 * Runs a policy-checked flash dry run through the Tauri shell's native
 * command. Returns the verdict and would-be command log.
 */
export async function nativeFlashDryRun(input: {
  project: Project;
  artifactId: string;
  expectedVendor: string;
  expectedProduct: string;
  detectedVendor?: string;
  detectedProduct?: string;
  bootloader?: string;
  operatorConfirmed: boolean;
}): Promise<{ verdict: PolicyVerdict; run: FlashRun | undefined }> {
  const invoke = await nativeInvoke();
  if (!invoke) {
    return { verdict: { pass: false, reason: "Flash dry run is only available in the QMKUI desktop app." }, run: undefined };
  }
  const result = (await invoke("flash_dry_run", {
    projectJson: JSON.stringify(input.project),
    artifactId: input.artifactId,
    expectedVendor: input.expectedVendor,
    expectedProduct: input.expectedProduct,
    detectedVendor: input.detectedVendor,
    detectedProduct: input.detectedProduct,
    bootloader: input.bootloader,
    operatorConfirmed: input.operatorConfirmed,
  })) as { verdict: { pass: boolean; reason?: string }; log: string[] };
  return {
    verdict: result.verdict.pass ? { pass: true } : { pass: false, reason: result.verdict.reason ?? "Flash blocked." },
    run: result.log.length > 0 ? { status: "succeeded", log: result.log } : undefined,
  };
}