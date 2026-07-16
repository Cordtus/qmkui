import type { Project, UiIssue } from "./domain";

export type GeneratedFeature = {
  kind: "macro" | "combo" | "tapDance" | "encoder" | "assignment";
  id: string;
  label: string;
  requiresGeneratedC: boolean;
};

export type BuildPlan = {
  keyboardTarget: string;
  keymapName: string;
  selectedMode: Project["build"]["mode"];
  output: "json" | "c";
  localCommand: string[];
  canExport: boolean;
  localReady: boolean;
  remoteReady: boolean;
  remoteAvailable: boolean;
  selectedReady: boolean;
  requiresGeneratedC: boolean;
  blockers: string[];
  features: GeneratedFeature[];
};

export function createBuildPlan(
  project: Project,
  issues: UiIssue[],
  qmkDetected: boolean,
): BuildPlan {
  const blockers = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);
  const features = generatedFeatures(project);
  const requiresGeneratedC =
    project.build.outputPreference === "c" ||
    features.some((feature) => feature.requiresGeneratedC);
  const output = requiresGeneratedC ? "c" : "json";
  const canExport = blockers.length === 0;
  const remoteAvailable = output === "json";

  if (project.build.mode === "localCli" && !qmkDetected) {
    blockers.push("command.qmk.missing");
  }
  if (project.build.mode === "remoteApi") {
    blockers.push(remoteAvailable ? "build.remote.unavailable" : "build.remote.generatedC");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const localReady = canExport && qmkDetected;
  const remoteReady = false;

  return {
    keyboardTarget: project.target.qmkKeyboard,
    keymapName: project.build.keymapName,
    selectedMode: project.build.mode,
    output,
    localCommand: [
      "qmk",
      "compile",
      "-kb",
      project.target.qmkKeyboard,
      "-km",
      project.build.keymapName,
    ],
    canExport,
    localReady,
    remoteReady,
    remoteAvailable,
    selectedReady:
      uniqueBlockers.length === 0 &&
      (project.build.mode === "localCli" ? localReady : remoteReady),
    requiresGeneratedC,
    blockers: uniqueBlockers,
    features,
  };
}

function generatedFeatures(project: Project): GeneratedFeature[] {
  return [
    ...featureRecords("macro", project.macros ?? []),
    ...featureRecords("combo", project.combos ?? []),
    ...featureRecords("tapDance", project.tapDances ?? []),
    ...featureRecords("encoder", project.encoders ?? []),
    ...assignmentFeatures(project),
  ];
}

function featureRecords(
  kind: GeneratedFeature["kind"],
  records: NonNullable<Project["macros"]>,
): GeneratedFeature[] {
  return records
    .filter((record) => record.enabled !== false)
    .map((record) => ({
      kind,
      id: record.id,
      label: record.name ?? record.id,
      requiresGeneratedC: record.exportMode !== "json",
    }));
}

function assignmentFeatures(project: Project): GeneratedFeature[] {
  return project.layers.flatMap((layer) =>
    layer.assignments.flatMap((assignment) => {
      if (!["comboRef", "tapDance", "encoderAction"].includes(assignment.kind)) {
        return [];
      }

      return [
        {
          kind: "assignment" as const,
          id: assignment.id,
          label: assignment.qmk,
          requiresGeneratedC: true,
        },
      ];
    }),
  );
}
