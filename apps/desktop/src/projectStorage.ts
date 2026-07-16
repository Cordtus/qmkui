import type { Project } from "./domain";

export type ProjectSummary = {
  id: string;
  name: string;
  keyboardId: string;
  qmkKeyboard: string;
  updatedAt: string;
};

export type ProjectStorage = {
  save(project: Project): void;
  load(projectId: string): Project | null;
  list(): ProjectSummary[];
  remove(projectId: string): boolean;
};

type StoredProject = {
  project: Project;
  updatedAt: string;
  sequence: number;
};

export function createMemoryProjectStorage(
  now: () => string = () => new Date().toISOString(),
): ProjectStorage {
  const projects = new Map<string, StoredProject>();
  let sequence = 0;

  return {
    save(project) {
      projects.set(project.id, {
        project: structuredClone(project),
        updatedAt: now(),
        sequence: sequence + 1,
      });
      sequence += 1;
    },
    load(projectId) {
      const stored = projects.get(projectId);
      return stored ? structuredClone(stored.project) : null;
    },
    list() {
      return [...projects.values()]
        .sort((left, right) => {
          const byDate = right.updatedAt.localeCompare(left.updatedAt);
          return byDate || right.sequence - left.sequence;
        })
        .map((stored) => ({
          id: stored.project.id,
          name: stored.project.name,
          keyboardId: stored.project.target.keyboardId,
          qmkKeyboard: stored.project.target.qmkKeyboard,
          updatedAt: stored.updatedAt,
        }));
    },
    remove(projectId) {
      return projects.delete(projectId);
    },
  };
}

export function importProjectJson(json: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error("Project JSON is invalid", { cause: error });
  }

  assertProjectPayload(parsed);
  return structuredClone(parsed);
}

function assertProjectPayload(value: unknown): asserts value is Project {
  if (!isRecord(value)) {
    throw new Error("Project JSON is not an object");
  }

  if (typeof value.schemaVersion !== "string") {
    throw new Error("Project JSON is missing schemaVersion");
  }
  if (typeof value.id !== "string") {
    throw new Error("Project JSON is missing id");
  }
  if (typeof value.name !== "string") {
    throw new Error("Project JSON is missing name");
  }
  if (value.target === undefined) {
    throw new Error("Project JSON is missing target");
  }
  if (!isProjectTarget(value.target)) {
    throw new Error("Project JSON has invalid target");
  }
  if (!Array.isArray(value.layers)) {
    throw new Error("Project JSON is missing layers");
  }
  const invalidLayerIndex = value.layers.findIndex((layer) => !isLayer(layer));
  if (invalidLayerIndex !== -1) {
    throw new Error(`Project JSON has invalid layers[${invalidLayerIndex}]`);
  }
  if (value.build === undefined) {
    throw new Error("Project JSON is missing build");
  }
  if (!isBuildSettings(value.build)) {
    throw new Error("Project JSON has invalid build");
  }

  assertOptionalFeatureRecords(value.macros, "macros");
  assertOptionalFeatureRecords(value.combos, "combos");
  assertOptionalFeatureRecords(value.tapDances, "tapDances");
  assertOptionalFeatureRecords(value.encoders, "encoders");

  if (
    value.lightingProfiles !== undefined &&
    (!Array.isArray(value.lightingProfiles) ||
      !value.lightingProfiles.every(isLightingProfile))
  ) {
    throw new Error("Project JSON has invalid lightingProfiles");
  }
}

function assertOptionalFeatureRecords(value: unknown, field: string): void {
  if (value !== undefined && (!Array.isArray(value) || !value.every(isFeatureRecord))) {
    throw new Error(`Project JSON has invalid ${field}`);
  }
}

function isProjectTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.keyboardId === "string" &&
    typeof value.qmkKeyboard === "string" &&
    typeof value.layoutId === "string" &&
    typeof value.qmkLayoutMacro === "string" &&
    isOptionalString(value.catalogVersion)
  );
}

function isBuildSettings(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.mode === "localCli" || value.mode === "remoteApi") &&
    typeof value.keymapName === "string" &&
    (value.outputPreference === "json" ||
      value.outputPreference === "c" ||
      value.outputPreference === "auto")
  );
}

function isLayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Number.isInteger(value.index) &&
    typeof value.name === "string" &&
    typeof value.enabled === "boolean" &&
    Array.isArray(value.assignments) &&
    value.assignments.every(isAssignment)
  );
}

function isAssignment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.visualKeyId === "string" &&
    typeof value.kind === "string" &&
    typeof value.qmk === "string" &&
    (value.params === undefined || isRecord(value.params))
  );
}

function isFeatureRecord(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isOptionalString(value.name) &&
    (value.exportMode === undefined ||
      value.exportMode === "json" ||
      value.exportMode === "c" ||
      value.exportMode === "live") &&
    (value.enabled === undefined || typeof value.enabled === "boolean")
  );
}

function isLightingProfile(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.mode === "static" || value.mode === "reactive" || value.mode === "off") &&
    (value.global === undefined ||
      (isRecord(value.global) &&
        Object.values(value.global).every(isLightingGlobalValue))) &&
    isStringRecord(value.perKey) &&
    (value.conditions === undefined ||
      (Array.isArray(value.conditions) && value.conditions.every(isLightingCondition)))
  );
}

function isLightingCondition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.visualKeyId === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    isOptionalString(value.when) &&
    (value.layerIndex === undefined || Number.isInteger(value.layerIndex)) &&
    isOptionalString(value.qmk)
  );
}

function isLightingGlobalValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
