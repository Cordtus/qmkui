import type { Project, DoctorReport } from "./domain";
import type { MacroRecord } from "./macros";

export type SupportBundleInput = {
  project: Project;
  doctor?: DoctorReport | null;
  includeSensitiveMacroText: boolean;
};

const REDACTED = "[redacted]";

/**
 * Builds a support bundle: project identity, doctor context, and macro actions.
 * Macro action text is redacted by default so sensitive key sequences never
 * leave the machine unless the user opts in.
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
  const bundle = {
    schemaVersion: "support-bundle-0.1.0",
    project: {
      id: input.project.id,
      name: input.project.name,
      qmkKeyboard: input.project.target.qmkKeyboard,
      layout: input.project.target.layoutId,
      layers: input.project.layers.length,
      build: input.project.build,
    },
    macros,
    doctor: input.doctor
      ? { status: input.doctor.findings.length, findings: input.doctor.findings }
      : null,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(bundle, null, 2);
}
