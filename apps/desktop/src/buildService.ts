import { BuildPlan } from "./buildPlan";
import { Project } from "./domain";

export type BuildStep =
  | { status: "queued"; command: string }
  | { status: "running"; command: string }
  | { status: "succeeded"; command: string; output: string; durationMs: number }
  | { status: "failed"; command: string; output: string; durationMs: number };

/** Stable sha256 hex digest over the serialized project, mirroring the Rust
 * `qmkui-build::plan::project_digest` used to detect artifact staleness. Falls
 * back to a deterministic FNV-1a hex when the platform has no `crypto.subtle`
 * (e.g. some test/jsdom environments). */
export async function projectDigest(project: Project): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export type BuildArtifact = {
  id: string;
  projectDigest: string;
  firmwareSha256: string;
  qmkKeyboard: string;
  createdAt: string;
};

/**
 * Injectable command execution. The browser has no process access, so the
 * default runner reports an unsupported error; callers can inject a runner
 * backed by a native/CLI process.
 */
export type BuildRunner = (command: string[]) => Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}>;

export function unsupportedBrowserRunner(): BuildRunner {
  return async () => ({
    ok: false,
    stdout: "",
    stderr: "In-app builds are not available; run the `qmkui-build` CLI (or `qmk compile`) instead.",
    durationMs: 0,
  });
}

export async function runLocalBuild(
  plan: BuildPlan,
  runner: BuildRunner,
): Promise<BuildStep> {
  const command = plan.localCommand.join(" ");
  const started = Date.now();
  const result = await runner(plan.localCommand);
  const durationMs = Date.now() - started;
  if (result.ok) {
    return { status: "succeeded", command, output: result.stdout, durationMs };
  }
  const output = [result.stderr, result.stdout].filter(Boolean).join("\n");
  return { status: "failed", command, output, durationMs };
}