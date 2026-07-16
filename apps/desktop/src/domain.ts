import { parseAdvancedAssignment } from "./advancedAssignments";

export type Project = {
  schemaVersion: string;
  id: string;
  name: string;
  target: {
    keyboardId: string;
    qmkKeyboard: string;
    layoutId: string;
    qmkLayoutMacro: string;
    catalogVersion?: string;
  };
  layers: Layer[];
  build: {
    mode: "localCli" | "remoteApi";
    keymapName: string;
    outputPreference: "json" | "c" | "auto";
  };
  macros?: FeatureRecord[];
  combos?: FeatureRecord[];
  tapDances?: FeatureRecord[];
  encoders?: FeatureRecord[];
  lightingProfiles?: LightingProfile[];
};

export type FeatureRecord = {
  id: string;
  name?: string;
  exportMode?: "json" | "c" | "live";
  enabled?: boolean;
};

export type Layer = {
  id: string;
  index: number;
  name: string;
  enabled: boolean;
  assignments: Assignment[];
};

export type Assignment = {
  id: string;
  visualKeyId: string;
  kind: string;
  qmk: string;
  params?: Record<string, unknown>;
};

export type LightingProfile = {
  id: string;
  name: string;
  mode: "static" | "reactive" | "off";
  global?: Record<string, string | number | boolean>;
  perKey: Record<string, string>;
  conditions?: LightingCondition[];
};

export type LightingCondition = {
  id: string;
  visualKeyId: string;
  name: string;
  color: string;
  when?: string;
  layerIndex?: number;
  qmk?: string;
};

export type KeyboardDefinition = {
  id: string;
  displayName: string;
  qmkKeyboard: string;
  manufacturer?: string;
  aliases?: string[];
  usb?: { vid: string; pid: string };
  features?: FeatureCapabilities;
  source?: { kind: string; version?: string };
  layouts: Array<{
    id: string;
    qmkLayoutMacro: string;
    displayName: string;
    keys: Array<VisualKey>;
  }>;
};

export type FeatureCapabilities = {
  backlight?: FeatureState;
  rgblight?: FeatureState;
  ledMatrix?: FeatureState;
  rgbMatrix?: FeatureState;
  encoder?: FeatureState & { count?: number };
  via?: FeatureState;
  dynamicKeymap?: FeatureState & { layers?: number };
  rawHid?: FeatureState;
  macros?: FeatureState;
  combos?: FeatureState;
  tapDance?: FeatureState;
};

export type FeatureState = {
  support: "supported" | "unsupported" | "unknown" | "requiresBuild" | "requiresCustomC";
  reason?: string;
};

export type VisualKey = {
  id: string;
  label?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  matrix?: { row: number; col: number };
};

export type DoctorReport = {
  snapshot: {
    commands?: CommandStatus[];
    distroId?: string;
    packageManager?: string;
    qmkPackage?: {
      name: string;
      version?: string;
      installed: boolean;
    } | null;
    hardwareProbe: {
      status: "skipped" | "ready" | "blocked";
      reason: string;
      devices?: UsbDeviceSnapshot[];
      detectedKeyboards?: DetectedKeyboard[];
    };
  };
  findings: Array<{ code: string; severity: string; title: string; message: string }>;
};

export type CommandStatus = {
  name: string;
  path: string | null;
  requiredFor: "localBuild" | "flashing" | "catalogSync";
};

export type UsbDeviceSnapshot = {
  sysfsName: string;
  vid: string;
  pid: string;
  manufacturer?: string;
  product?: string;
};

export type DetectedKeyboard = {
  catalogKeyboardId: string;
  displayName: string;
  qmkKeyboard?: string;
  layoutId: string;
  matchKind: "usbVidPid" | "productText";
  confidence: number;
  device: UsbDeviceSnapshot;
  note?: string;
};

export type UiIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  path: string;
};

const supportedSchemaVersions = new Set(["0.1.0"]);
const maxQmkLayerIndex = 31;

export function validateProject(project: Project, keyboard: KeyboardDefinition): UiIssue[] {
  const layout = keyboard.layouts.find((item) => item.id === project.target.layoutId);
  const issues: UiIssue[] = [];

  if (!project.schemaVersion.trim()) {
    issues.push({
      code: "project.schemaVersion.empty",
      severity: "error",
      title: "Schema version is missing",
      path: "schemaVersion",
    });
  } else if (!supportedSchemaVersions.has(project.schemaVersion)) {
    issues.push({
      code: "project.schemaVersion.unsupported",
      severity: "error",
      title: "Schema version is not supported",
      path: "schemaVersion",
    });
  }

  if (!project.target.qmkKeyboard.trim()) {
    issues.push({
      code: "target.qmkKeyboard.empty",
      severity: "error",
      title: "QMK keyboard target is missing",
      path: "target.qmkKeyboard",
    });
  }

  if (!project.target.keyboardId.trim()) {
    issues.push({
      code: "target.keyboardId.empty",
      severity: "error",
      title: "Keyboard id is missing",
      path: "target.keyboardId",
    });
  } else if (project.target.keyboardId !== keyboard.id) {
    issues.push({
      code: "target.keyboardId.mismatch",
      severity: "error",
      title: "Keyboard id does not match the selected keyboard",
      path: "target.keyboardId",
    });
  }

  if (project.target.qmkKeyboard && project.target.qmkKeyboard !== keyboard.qmkKeyboard) {
    issues.push({
      code: "target.qmkKeyboard.mismatch",
      severity: "error",
      title: "QMK keyboard target does not match the selected keyboard",
      path: "target.qmkKeyboard",
    });
  }

  if (!project.target.layoutId.trim()) {
    issues.push({
      code: "target.layoutId.empty",
      severity: "error",
      title: "Layout id is missing",
      path: "target.layoutId",
    });
  }

  if (!project.target.qmkLayoutMacro.trim()) {
    issues.push({
      code: "target.qmkLayoutMacro.empty",
      severity: "error",
      title: "QMK layout macro is missing",
      path: "target.qmkLayoutMacro",
    });
  }

  if (!project.build.keymapName.trim()) {
    issues.push({
      code: "build.keymapName.empty",
      severity: "error",
      title: "Keymap name is missing",
      path: "build.keymapName",
    });
  } else if (!isValidKeymapName(project.build.keymapName)) {
    issues.push({
      code: "build.keymapName.invalid",
      severity: "error",
      title: "Keymap name is not QMK-safe",
      path: "build.keymapName",
    });
  }

  if (!layout) {
    return [
      ...issues,
      {
        code: "layout.missing",
        severity: "error",
        title: "Selected layout is missing",
        path: "target.layoutId",
      },
    ];
  }

  if (project.target.qmkLayoutMacro !== layout.qmkLayoutMacro) {
    issues.push({
      code: "target.qmkLayoutMacro.mismatch",
      severity: "error",
      title: "QMK layout macro does not match the selected layout",
      path: "target.qmkLayoutMacro",
    });
  }

  const layerIndexes = new Set(
    project.layers
      .map((layer) => layer.index)
      .filter((index) => Number.isInteger(index) && index >= 0 && index <= maxQmkLayerIndex),
  );
  const expectedVisualKeys = new Set(layout.keys.map((key) => key.id));

  if (!layerIndexes.has(0)) {
    issues.push({
      code: "layer.base.missing",
      severity: "error",
      title: "Base layer is missing",
      path: "layers",
    });
  }

  const maxLayerIndex = Math.max(...layerIndexes);
  for (let expectedLayerIndex = 0; expectedLayerIndex <= maxLayerIndex; expectedLayerIndex += 1) {
    if (!layerIndexes.has(expectedLayerIndex)) {
      issues.push({
        code: "layer.index.sparse",
        severity: "error",
        title: "Layer indexes are not contiguous",
        path: "layers",
      });
    }
  }

  const seenLayerIndexes = new Set<number>();
  project.layers.forEach((layer, layerIndex) => {
    if (seenLayerIndexes.has(layer.index)) {
      issues.push({
        code: "layer.index.duplicate",
        severity: "error",
        title: "Layer index is duplicated",
        path: `layers[${layerIndex}].index`,
      });
    }
    seenLayerIndexes.add(layer.index);

    if (!Number.isInteger(layer.index) || layer.index < 0 || layer.index > maxQmkLayerIndex) {
      issues.push({
        code: "layer.index.range",
        severity: "error",
        title: "Layer index exceeds QMK limit",
        path: `layers[${layerIndex}].index`,
      });
    }

    if (layer.index === 0 && !layer.enabled) {
      issues.push({
        code: "layer.base.disabled",
        severity: "error",
        title: "Base layer is disabled",
        path: `layers[${layerIndex}].enabled`,
      });
    }

    if (layer.assignments.length !== layout.keys.length) {
      issues.push({
        code: "layer.assignmentCount.mismatch",
        severity: "error",
        title: "Layer assignment count does not match layout",
        path: `layers[${layerIndex}].assignments`,
      });
    }

    const seenVisualKeys = new Set<string>();
    layer.assignments.forEach((assignment, assignmentIndex) => {
      if (seenVisualKeys.has(assignment.visualKeyId)) {
        issues.push({
          code: "assignment.visualKey.duplicate",
          severity: "error",
          title: "Visual key is assigned twice in the same layer",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].visualKeyId`,
        });
      }
      seenVisualKeys.add(assignment.visualKeyId);

      if (!expectedVisualKeys.has(assignment.visualKeyId)) {
        issues.push({
          code: "assignment.visualKey.unknown",
          severity: "error",
          title: "Visual key is not in the selected layout",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].visualKeyId`,
        });
      }

      const layerReference = scanLayerReference(assignment.qmk);
      if (layerReference.malformed) {
        issues.push({
          code: "assignment.layerReference.malformed",
          severity: "error",
          title: "Layer keycode is malformed",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].qmk`,
        });
      }

      if (
        isTapHoldKeycode(assignment.qmk) &&
        !layerReference.malformed &&
        !parseAdvancedAssignment(assignment.qmk)
      ) {
        issues.push({
          code: "assignment.tapHold.unsupported",
          severity: "error",
          title: "Tap-hold keycode is unsupported",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].qmk`,
        });
      }

      if (layerReference.index !== undefined && !layerIndexes.has(layerReference.index)) {
        issues.push({
          code: "assignment.layerReference.missing",
          severity: "error",
          title: "Layer reference is invalid",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].qmk`,
        });
      }

      if (layerReference.index !== undefined && layerReference.index > maxQmkLayerIndex) {
        issues.push({
          code: "assignment.layerReference.range",
          severity: "error",
          title: "Layer reference exceeds QMK limit",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].qmk`,
        });
      }

      if (
        layerReference.index !== undefined &&
        (layerReference.wrapper === "LT" || layerReference.wrapper === "LM") &&
        layerReference.index > 15
      ) {
        issues.push({
          code: "assignment.layerReference.range",
          severity: "error",
          title: "Layer reference exceeds QMK limit",
          path: `layers[${layerIndex}].assignments[${assignmentIndex}].qmk`,
        });
      }
    });

    layout.keys.forEach((key) => {
      if (!seenVisualKeys.has(key.id)) {
        issues.push({
          code: "assignment.visualKey.missing",
          severity: "error",
          title: "Layout key has no assignment",
          path: `layers[${layerIndex}].assignments`,
        });
      }
    });
  });

  return issues;
}

export function exportQmkJson(project: Project, keyboard: KeyboardDefinition) {
  const layout = keyboard.layouts.find((item) => item.id === project.target.layoutId);
  if (!layout) {
    throw new Error("Selected layout is missing");
  }

  return {
    keyboard: project.target.qmkKeyboard,
    keymap: project.build.keymapName,
    layout: project.target.qmkLayoutMacro,
    layers: [...project.layers]
      .sort((left, right) => left.index - right.index)
      .map((layer) =>
        layout.keys.map((key) => {
          const assignment = layer.assignments.find((item) => item.visualKeyId === key.id);
          if (!assignment) {
            throw new Error(`Missing assignment for ${key.id}`);
          }
          return assignment.qmk;
        }),
      ),
  };
}

export function buildReadinessLabel(issues: UiIssue[], qmkDetected: boolean): string {
  if (issues.some((issue) => issue.severity === "error")) {
    return "Fix keymap issues";
  }

  if (!qmkDetected) {
    return "Build tools missing";
  }

  return "Ready";
}

type LayerReferenceScan = {
  index?: number;
  malformed: boolean;
  wrapper?: string;
};

export function scanLayerReference(qmk: string): LayerReferenceScan {
  const trimmed = qmk.trim();
  const match = /^([A-Z_]+)\((.*)\)$/.exec(trimmed);
  if (!match) {
    return isLayerWrapperPrefix(trimmed) ? { malformed: true } : { malformed: false };
  }

  const [, wrapper, inner] = match;
  const singleArgWrappers = new Set(["MO", "TO", "TG", "DF", "OSL", "TT"]);
  const multiArgWrappers = new Set(["LT", "LM"]);

  if (!singleArgWrappers.has(wrapper) && !multiArgWrappers.has(wrapper)) {
    return { malformed: false };
  }

  const args = splitTopLevelArgs(inner);
  if (singleArgWrappers.has(wrapper) && args.length !== 1) {
    return { malformed: true };
  }
  if (multiArgWrappers.has(wrapper) && args.length !== 2) {
    return { malformed: true };
  }
  if (args.slice(1).some((arg) => arg.length === 0)) {
    return { malformed: true };
  }

  const firstArg = args[0] ?? "";
  if (!/^\d+$/.test(firstArg)) {
    return { malformed: true };
  }

  return { index: Number(firstArg), malformed: false, wrapper };
}

function isLayerWrapperPrefix(value: string): boolean {
  return /^(MO|TO|TG|DF|OSL|TT|LT|LM)\(/.test(value);
}

function splitTopLevelArgs(value: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  args.push(current.trim());
  return args;
}

function isTapHoldKeycode(value: string): boolean {
  return /^(LT|MT|LCTL_T|LSFT_T|LALT_T|LGUI_T|RCTL_T|RSFT_T|RALT_T|RGUI_T)\(/.test(
    value.trim(),
  );
}

function isValidKeymapName(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}
