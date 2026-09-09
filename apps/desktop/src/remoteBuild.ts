import { jsonExportBlockers, Project, UiIssue } from "./domain";

export type RemoteBuildStatus = "idle" | "queued" | "running" | "finished" | "failed";

export type RemoteBuildJob = {
  id: string;
  status: RemoteBuildStatus;
  keymapName: string;
  error?: string;
};

export class RemoteBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteBuildError";
  }
}

/**
 * A project is remote-build eligible only when it is JSON-exportable (no
 * generated-C features) and has no validation errors. Consent is always
 * required before any payload leaves the machine.
 */
export function remoteBuildEligibility(
  project: Project,
  issues: UiIssue[],
): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (issues.some((issue) => issue.severity === "error")) {
    blockers.push("Resolve keymap validation errors before remote build.");
  }
  blockers.push(...jsonExportBlockers(project));
  return { eligible: blockers.length === 0, blockers };
}

export type RemoteSubmit = (payload: { keymapJson: unknown; keymapName: string }) => Promise<{
  id: string;
}>;

/**
 * Submits a remote build. Refuses to run without explicit consent and refuses
 * anything that is not JSON-exportable. The transport is injectable so tests
 * never touch the network.
 */
export async function submitRemoteBuild(
  input: {
    keymapJson: unknown;
    keymapName: string;
    consentGranted: boolean;
    blockers: string[];
  },
  submit: RemoteSubmit,
): Promise<RemoteBuildJob> {
  if (!input.consentGranted) {
    throw new RemoteBuildError("Consent is required before uploading project data.");
  }
  if (input.blockers.length > 0) {
    throw new RemoteBuildError(input.blockers.join(" "));
  }
  const { id } = await submit({
    keymapJson: input.keymapJson,
    keymapName: input.keymapName,
  });
  return { id, status: "queued", keymapName: input.keymapName };
}
