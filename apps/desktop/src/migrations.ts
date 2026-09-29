import type { Project } from "./domain";

export const SUPPORTED_PROJECT_SCHEMA_VERSION = "0.1.0";

/**
 * Brings a raw parsed project payload to the current supported schema. Throws
 * a descriptive error for non-object payloads, missing versions, or versions
 * that are not supported.
 */
export function migrateProject(payload: unknown): Project {
  if (!isRecord(payload)) {
    throw new Error("Project JSON is not an object");
  }
  if (typeof payload.schemaVersion !== "string") {
    throw new Error("Project JSON is missing schemaVersion");
  }
  if (payload.schemaVersion !== SUPPORTED_PROJECT_SCHEMA_VERSION) {
    throw new Error(`Project schema version ${String(payload.schemaVersion)} is not supported`);
  }
  return payload as unknown as Project;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
