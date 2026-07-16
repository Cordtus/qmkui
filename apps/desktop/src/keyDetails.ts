import type { Assignment, Layer, LightingProfile, Project, VisualKey } from "./domain";
import { formatKeycap } from "./keycodes";

export type SelectedKeyContext = {
  key: VisualKey;
  selectedLayer: LayerSummary;
  selectedAssignment?: KeyLayerDetail;
  primaryAssignment?: KeyLayerDetail;
  layers: KeyLayerDetail[];
  lighting: KeyLightingDetail;
  shortcuts: KeyShortcut[];
  relations: KeyRelation[];
};

export type LayerSummary = {
  index: number;
  name: string;
};

export type KeyLayerDetail = {
  layer: LayerSummary;
  assignment?: Assignment;
  label: string;
  qmk: string;
  kind: string;
  isSelected: boolean;
  isPrimary: boolean;
  resolved?: ResolvedAssignment;
  targetLayer?: LayerTarget;
};

export type ResolvedAssignment = {
  layer: LayerSummary;
  qmk: string;
  label: string;
  kind: string;
};

export type LayerTarget = {
  index: number;
  name?: string;
  exists: boolean;
  action: string;
};

export type KeyLightingDetail = {
  profileName: string;
  mode: LightingProfile["mode"];
  color: string;
  hasPerKeyColor: boolean;
  conditions: Array<{
    id: string;
    name: string;
    color: string;
    when?: string;
    layerIndex?: number;
    qmk?: string;
  }>;
};

export type KeyShortcut = {
  id: string;
  layer: LayerSummary;
  visualKeyId: string;
  qmk: string;
  label: string;
  kind: "modified" | "modTap" | "layerTap";
};

export type KeyRelation = {
  id: string;
  label: string;
  value: string;
  qmk?: string;
  layer?: LayerSummary;
  kind: "layer" | "lighting" | "system" | "encoder" | "shortcut";
};

export function buildSelectedKeyContext(
  project: Project,
  layoutKeys: VisualKey[],
  selectedLayerIndex: number,
  selectedKeyId: string,
): SelectedKeyContext | null {
  const key = layoutKeys.find((item) => item.id === selectedKeyId) ?? layoutKeys[0];
  const profile = activeLightingProfile(project);
  const selectedLayer = project.layers.find((layer) => layer.index === selectedLayerIndex) ?? project.layers[0];

  if (!key || !selectedLayer) {
    return null;
  }

  const layers = [...project.layers]
    .sort((left, right) => left.index - right.index)
    .map((layer) => layerDetailForKey(project.layers, layer, key.id, selectedLayer.index));
  const selectedAssignment = layers.find((detail) => detail.layer.index === selectedLayer.index);
  const primaryAssignment = layers.find((detail) => detail.layer.index === 0) ?? layers[0];
  const selectedKeycodes = keycodesForKey(layers);
  const shortcuts = shortcutsForKey(project.layers, selectedKeycodes, key.id);
  const relations = relationsForKey(layers, shortcuts);

  return {
    key,
    selectedLayer: summarizeLayer(selectedLayer),
    selectedAssignment,
    primaryAssignment,
    layers,
    lighting: lightingForKey(profile, key.id),
    shortcuts,
    relations,
  };
}

function layerDetailForKey(
  layers: Layer[],
  layer: Layer,
  visualKeyId: string,
  selectedLayerIndex: number,
): KeyLayerDetail {
  const assignment = assignmentForKey(layer, visualKeyId);
  const qmk = assignment?.qmk ?? "KC_NO";
  const resolved = qmk === "KC_TRNS" ? resolveTransparent(layers, layer.index, visualKeyId) : undefined;

  return {
    layer: summarizeLayer(layer),
    assignment,
    label: resolved ? `Transparent -> ${resolved.label}` : formatKeycap(qmk),
    qmk,
    kind: assignment?.kind ?? "none",
    isSelected: layer.index === selectedLayerIndex,
    isPrimary: layer.index === 0,
    resolved,
    targetLayer: layerTargetForKeycode(layers, qmk),
  };
}

function assignmentForKey(layer: Layer, visualKeyId: string): Assignment | undefined {
  return layer.assignments.find((assignment) => assignment.visualKeyId === visualKeyId);
}

function resolveTransparent(
  layers: Layer[],
  fromLayerIndex: number,
  visualKeyId: string,
): ResolvedAssignment | undefined {
  const lowerLayers = [...layers]
    .filter((layer) => layer.index < fromLayerIndex)
    .sort((left, right) => right.index - left.index);

  for (const layer of lowerLayers) {
    const assignment = assignmentForKey(layer, visualKeyId);
    if (!assignment || assignment.qmk === "KC_TRNS") {
      continue;
    }
    return {
      layer: summarizeLayer(layer),
      qmk: assignment.qmk,
      label: formatKeycap(assignment.qmk),
      kind: assignment.kind,
    };
  }

  return undefined;
}

function keycodesForKey(layers: KeyLayerDetail[]): Set<string> {
  const keycodes = new Set<string>();
  layers.forEach((detail) => {
    if (detail.qmk !== "KC_TRNS" && detail.qmk !== "KC_NO") {
      keycodes.add(detail.qmk);
    }
    if (detail.resolved?.qmk) {
      keycodes.add(detail.resolved.qmk);
    }
  });
  return keycodes;
}

function shortcutsForKey(
  layers: Layer[],
  selectedKeycodes: Set<string>,
  selectedKeyId: string,
): KeyShortcut[] {
  return layers.flatMap((layer) =>
    layer.assignments.flatMap((assignment) => {
      const shortcut = shortcutForKeycode(assignment.qmk);
      if (!shortcut) {
        return [];
      }

      const involvesSelectedPhysicalKey = assignment.visualKeyId === selectedKeyId;
      const involvesSelectedKeycode = shortcut.innerQmk ? selectedKeycodes.has(shortcut.innerQmk) : false;
      if (!involvesSelectedPhysicalKey && !involvesSelectedKeycode) {
        return [];
      }

      return [
        {
          id: `${layer.index}:${assignment.visualKeyId}:${assignment.qmk}`,
          layer: summarizeLayer(layer),
          visualKeyId: assignment.visualKeyId,
          qmk: assignment.qmk,
          label: shortcut.label,
          kind: shortcut.kind,
        },
      ];
    }),
  );
}

function relationsForKey(layers: KeyLayerDetail[], shortcuts: KeyShortcut[]): KeyRelation[] {
  const relations: KeyRelation[] = [];

  layers.forEach((detail) => {
    if (!detail.assignment) {
      return;
    }
    if (detail.targetLayer) {
      relations.push({
        id: `layer:${detail.layer.index}:${detail.qmk}`,
        label: detail.targetLayer.action,
        value: detail.targetLayer.name ?? `Layer ${detail.targetLayer.index}`,
        qmk: detail.qmk,
        layer: detail.layer,
        kind: "layer",
      });
    }
    if (detail.kind === "lighting" || detail.qmk.startsWith("RGB_")) {
      relations.push({
        id: `lighting:${detail.layer.index}:${detail.qmk}`,
        label: "Lighting",
        value: formatKeycap(detail.qmk),
        qmk: detail.qmk,
        layer: detail.layer,
        kind: "lighting",
      });
    }
    if (detail.kind === "bootloader" || detail.qmk === "QK_BOOT") {
      relations.push({
        id: `system:${detail.layer.index}:${detail.qmk}`,
        label: "System",
        value: formatKeycap(detail.qmk),
        qmk: detail.qmk,
        layer: detail.layer,
        kind: "system",
      });
    }
    if (detail.kind === "encoder") {
      relations.push({
        id: `encoder:${detail.layer.index}:${detail.qmk}`,
        label: "Encoder",
        value: formatKeycap(detail.qmk),
        qmk: detail.qmk,
        layer: detail.layer,
        kind: "encoder",
      });
    }
  });

  shortcuts.forEach((shortcut) => {
    relations.push({
      id: `shortcut:${shortcut.id}`,
      label: "Shortcut",
      value: shortcut.label,
      qmk: shortcut.qmk,
      layer: shortcut.layer,
      kind: "shortcut",
    });
  });

  return uniqueRelations(relations);
}

function uniqueRelations(relations: KeyRelation[]): KeyRelation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const key = `${relation.kind}:${relation.layer?.index ?? ""}:${relation.qmk ?? ""}:${relation.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function lightingForKey(profile: LightingProfile, visualKeyId: string): KeyLightingDetail {
  const color = profile.perKey[visualKeyId] ?? "#5fb99a";
  return {
    profileName: profile.name,
    mode: profile.mode,
    color,
    hasPerKeyColor: Object.hasOwn(profile.perKey, visualKeyId),
    conditions:
      profile.conditions
        ?.filter((condition) => condition.visualKeyId === visualKeyId)
        .map((condition) => ({
          id: condition.id,
          name: condition.name,
          color: condition.color,
          when: condition.when,
          layerIndex: condition.layerIndex,
          qmk: condition.qmk,
        })) ?? [],
  };
}

function layerTargetForKeycode(layers: Layer[], qmk: string): LayerTarget | undefined {
  const match = /^(MO|TO|TG|DF|OSL|TT|LT|LM)\((\d+)/.exec(qmk);
  if (!match) {
    return undefined;
  }

  const action = layerActionLabels[match[1]] ?? "Layer";
  const index = Number(match[2]);
  const layer = layers.find((item) => item.index === index);
  return {
    index,
    name: layer?.name,
    exists: Boolean(layer),
    action,
  };
}

function shortcutForKeycode(
  qmk: string,
): { label: string; innerQmk?: string; kind: KeyShortcut["kind"] } | undefined {
  const modified = /^([LR]?(?:CTL|ALT|SFT|GUI)|[CASG])\((.+)\)$/.exec(qmk);
  if (modified) {
    const modifier = modifierLabel(modified[1]);
    const innerQmk = modified[2].trim();
    return {
      label: `${modifier}+${formatKeycap(innerQmk)}`,
      innerQmk,
      kind: "modified",
    };
  }

  const modTap = /^MT\((MOD_[A-Z|_]+),\s*(.+)\)$/.exec(qmk);
  if (modTap) {
    const modifier = modMaskLabel(modTap[1]);
    const innerQmk = modTap[2].trim();
    return {
      label: `${modifier} / ${formatKeycap(innerQmk)}`,
      innerQmk,
      kind: "modTap",
    };
  }

  const layerTap = /^LT\((\d+),\s*(.+)\)$/.exec(qmk);
  if (layerTap) {
    const innerQmk = layerTap[2].trim();
    return {
      label: `Layer ${layerTap[1]} / ${formatKeycap(innerQmk)}`,
      innerQmk,
      kind: "layerTap",
    };
  }

  return undefined;
}

function modMaskLabel(mask: string): string {
  return mask
    .replace(/^MOD_/, "")
    .split("|")
    .map((part) => modifierLabel(part))
    .join("+");
}

function modifierLabel(modifier: string): string {
  const normalized = modifier.replace(/^MOD_/, "").replace(/^[LR]/, "");
  return modifierLabels[normalized] ?? normalized;
}

function activeLightingProfile(project: Project): LightingProfile {
  return (
    project.lightingProfiles?.[0] ?? {
      id: "profile_default",
      name: "Default",
      mode: "static",
      perKey: {},
    }
  );
}

function summarizeLayer(layer: Layer): LayerSummary {
  return {
    index: layer.index,
    name: layer.name,
  };
}

const layerActionLabels: Record<string, string> = {
  DF: "Default layer",
  LM: "Layer mod",
  LT: "Layer tap",
  MO: "Momentary layer",
  OSL: "One-shot layer",
  TG: "Toggle layer",
  TO: "Switch layer",
  TT: "Tap-toggle layer",
};

const modifierLabels: Record<string, string> = {
  A: "Alt",
  ALT: "Alt",
  C: "Ctrl",
  CTL: "Ctrl",
  G: "Win",
  GUI: "Win",
  S: "Shift",
  SFT: "Shift",
};
