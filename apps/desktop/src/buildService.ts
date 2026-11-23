import { BuildPlan } from "./buildPlan";
import { Project } from "./domain";

export type BuildStep =
  | { status: "queued"; command: string }
  | { status: "running"; command: string }
  | { status: "succeeded"; command: string; output: string; durationMs: number }
  | { status: "failed"; command: string; output: string; durationMs: number };

/** Session-local digest over the serialized project, used only for artifact
 * staleness in this tab. It is not byte-compatible with Rust
 * `qmkui-build::plan::project_digest` (different serialization), and the
 * FNV-1a fallback used by jsdom is not cryptographic. */
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
 * default runner reports an unsupported error; tests (and a future non-browser
 * host) can inject their own runner.
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
    stderr: "In-app builds are not available in the browser; run the generated `qmk compile` command locally (QMK CLI).",
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