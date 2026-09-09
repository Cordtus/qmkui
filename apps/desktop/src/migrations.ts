import type { Project } from "./domain";

export const SUPPORTED_PROJECT_SCHEMA_VERSION = "0.1.0";

export type ProjectMigration = {
  fromVersion: string;
  toVersion: string;
  migrate: (project: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * Registered in dependency order; a project is migrated stepwise until it
 * reaches the supported version. Empty today because the schema is still
 * `0.1.0`; migrations are added before any future schema change.
 */
const migrations: ProjectMigration[] = [];

/**
 * Brings a raw parsed project payload to the current supported schema. Throws
 * a descriptive error for non-object payloads, missing versions, or versions
 * with no migration path.
 */
export function migrateProject(
  payload: unknown,
  migrationList: ProjectMigration[] = migrations,
): Project {
  if (!isRecord(payload)) {
    throw new Error("Project JSON is not an object");
  }
  if (typeof payload.schemaVersion !== "string") {
    throw new Error("Project JSON is missing schemaVersion");
  }

  let current: Record<string, unknown> = payload;
  for (let guard = 0; guard < migrationList.length + 1; guard += 1) {
    const next = migrationList.find((migration) => migration.fromVersion === current.schemaVersion);
    if (!next) {
      break;
    }
    current = next.migrate(current);
  }

  if (current.schemaVersion !== SUPPORTED_PROJECT_SCHEMA_VERSION) {
    throw new Error(`Project schema version ${String(current.schemaVersion)} is not supported`);
  }
  return current as unknown as Project;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
