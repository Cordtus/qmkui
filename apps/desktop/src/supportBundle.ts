import packageJson from "../package.json";
import type { Project, DoctorReport, UiIssue } from "./domain";
import type { MacroRecord } from "./macros";

export type SupportDevice = {
  model?: string;
  firmware?: string;
  protocol?: string;
  lighting?: {
    brightness: number;
    effect: number;
    effectSpeed: number;
    hue: number;
    saturation: number;
  };
};

export type SupportBundleInput = {
  project: Project;
  doctor?: DoctorReport | null;
  includeSensitiveMacroText: boolean;
  device?: SupportDevice | null;
  validation?: UiIssue[];
  environment?: { webhid: boolean; mode: string };
};

export const APP_VERSION = packageJson.version;

const REDACTED = "[redacted]";
const LOCAL_PATH = /(?:\/home\/|\/Users\/|\/root\/|\/tmp\/|[A-Za-z]:\\Users\\)[^\s"'`]+/g;

/**
 * Builds a support bundle: app/environment, project identity (with the keymap
 * and lighting config), device facts, validation, doctor findings, and macros.
 * Macro action text is redacted by default; local filesystem paths are stripped
 * from doctor text.
 */
export function buildSupportBundle(input: SupportBundleInput): string {
  const macros = (input.project.macros ?? []).map((macro) => {
    const record = macro as MacroRecord;
    return {
      id: macro.id,
      name: macro.name ?? macro.id,
      exportMode: macro.exportMode ?? "json",
      actions: input.includeSensitiveMacroText ? record.actions ?? "" : REDACTED,
    };
  });
  const issues = input.validation ?? [];
  const profile = input.project.lightingProfiles?.[0];
  const bundle = {
    schemaVersion: "support-bundle-0.2.0",
    app: {
      version: APP_VERSION,
      mode: input.environment?.mode ?? "unknown",
      webhid: input.environment?.webhid ?? false,
    },
    project: {
      id: input.project.id,
      name: input.project.name,
      target: input.project.target,
      layers: input.project.layers.length,
      build: input.project.build,
    },
    keymap: {
      layout: input.project.target.layoutId,
      layers: [...input.project.layers]
        .sort((left, right) => left.index - right.index)
        .map((layer) => ({
          index: layer.index,
          name: layer.name,
          enabled: layer.enabled,
          assignments: layer.assignments.map((assignment) => ({
            visualKeyId: assignment.visualKeyId,
            qmk: assignment.qmk,
          })),
        })),
    },
    lighting: {
      profile: profile
        ? { name: profile.name, mode: profile.mode, global: profile.global ?? {} }
        : null,
      perKey: profile?.perKey ?? {},
      rules: input.project.lightingRules ?? [],
    },
    macros,
    device: input.device ?? null,
    validation: {
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      issues: issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        title: issue.title,
        path: issue.path,
      })),
    },
    doctor: input.doctor
      ? {
          distroId: input.doctor.snapshot.distroId ?? null,
          packageManager: input.doctor.snapshot.packageManager ?? null,
          hardwareProbe: {
            status: input.doctor.snapshot.hardwareProbe.status,
            reason: redactPaths(input.doctor.snapshot.hardwareProbe.reason),
            detectedKeyboards: (
              input.doctor.snapshot.hardwareProbe.detectedKeyboards ?? []
            ).map((keyboard) => `${keyboard.device.vid}:${keyboard.device.pid}`),
          },
          findings: input.doctor.findings.map((finding) => ({
            severity: finding.severity,
            title: redactPaths(finding.title),
            message: redactPaths(finding.message),
          })),
          commands: (input.doctor.snapshot.commands ?? []).map((command) => ({
            name: command.name,
            ready: Boolean(command.path),
            requiredFor: command.requiredFor,
          })),
        }
      : null,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(bundle, null, 2);
}

function redactPaths(value: string): string {
  return value.replace(LOCAL_PATH, "[path]");
}
