import type { Project, UiIssue } from "./domain";

export type BuildPlan = {
  keyboardTarget: string;
  keymapName: string;
  output: "json" | "c";
  localCommand: string[];
  canExport: boolean;
  localReady: boolean;
  selectedReady: boolean;
  requiresGeneratedC: boolean;
  blockers: string[];
};

export function createBuildPlan(
  project: Project,
  issues: UiIssue[],
  qmkDetected: boolean,
): BuildPlan {
  const blockers = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.code);
  const requiresC = requiresGeneratedC(project);
  const output = requiresC ? "c" : "json";
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

  return {
    keyboardTarget: project.target.qmkKeyboard,
    keymapName: project.build.keymapName,
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
    selectedReady:
      uniqueBlockers.length === 0 &&
      (project.build.mode === "localCli" ? localReady : false),
    requiresGeneratedC: requiresC,
    blockers: uniqueBlockers,
  };
}

function requiresGeneratedC(project: Project): boolean {
  if (project.build.outputPreference === "c") {
    return true;
  }
  const records = [
    ...(project.macros ?? []),
    ...(project.combos ?? []),
    ...(project.tapDances ?? []),
    ...(project.encoders ?? []),
  ];
  if (records.some((record) => record.enabled !== false && record.exportMode !== "json")) {
    return true;
  }
  return project.layers.some((layer) =>
    layer.assignments.some((assignment) =>
      ["comboRef", "tapDance", "encoderAction"].includes(assignment.kind),
    ),
  );
}
