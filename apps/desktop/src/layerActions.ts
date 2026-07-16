import type { Layer, Project, VisualKey } from "./domain";
import { scanLayerReference } from "./domain";
import { kindForKeycode } from "./keycodes";

export const MAX_QMK_LAYER_INDEX = 31;

export type LayerReference = {
  sourceLayerIndex: number;
  sourceLayerName: string;
  assignmentId: string;
  visualKeyId: string;
  qmk: string;
  targetLayerIndex: number;
};

export type DeleteLayerResult =
  | { deleted: true; removedLayer: Layer }
  | {
      deleted: false;
      reason: "base" | "referenced" | "notHighest" | "missing";
      references: LayerReference[];
    };

export function scanLayerReferences(
  project: Project,
  targetLayerIndex: number,
): LayerReference[] {
  return project.layers.flatMap((layer) =>
    layer.assignments.flatMap((assignment) => {
      const reference = scanLayerReference(assignment.qmk);
      if (reference.index !== targetLayerIndex) {
        return [];
      }

      return [
        {
          sourceLayerIndex: layer.index,
          sourceLayerName: layer.name,
          assignmentId: assignment.id,
          visualKeyId: assignment.visualKeyId,
          qmk: assignment.qmk,
          targetLayerIndex,
        },
      ];
    }),
  );
}

export function addTransparentLayer(project: Project, keys: VisualKey[]): Layer | null {
  const nextIndex = nextLayerIndex(project);
  if (nextIndex > MAX_QMK_LAYER_INDEX) {
    return null;
  }
  const layer = transparentLayer(nextIndex, keys);
  project.layers.push(layer);
  sortLayers(project);
  return layer;
}

export function duplicateLayer(
  project: Project,
  sourceLayerIndex: number,
  keys: VisualKey[],
): Layer | null {
  const sourceLayer = project.layers.find((layer) => layer.index === sourceLayerIndex);
  if (!sourceLayer) {
    return null;
  }

  const nextIndex = nextLayerIndex(project);
  if (nextIndex > MAX_QMK_LAYER_INDEX) {
    return null;
  }
  const layer: Layer = {
    id: `layer_${nextIndex}`,
    index: nextIndex,
    name: `${sourceLayer.name} Copy`,
    enabled: sourceLayer.enabled,
    assignments: keys.map((key, keyIndex) => {
      const sourceAssignment = sourceLayer.assignments.find(
        (assignment) => assignment.visualKeyId === key.id,
      );
      const qmk = sourceAssignment?.qmk ?? "KC_TRNS";
      return {
        id: `layer_${nextIndex}_${keyIndex}`,
        visualKeyId: key.id,
        kind: sourceAssignment?.kind ?? kindForKeycode(qmk),
        qmk,
      };
    }),
  };

  project.layers.push(layer);
  sortLayers(project);
  return layer;
}

export function renameLayer(project: Project, layerIndex: number, name: string): boolean {
  const layer = project.layers.find((item) => item.index === layerIndex);
  const nextName = name.trim();
  if (!layer || !nextName) {
    return false;
  }

  layer.name = nextName;
  return true;
}

export function deleteLayer(project: Project, layerIndex: number): DeleteLayerResult {
  const layer = project.layers.find((item) => item.index === layerIndex);
  if (!layer) {
    return { deleted: false, reason: "missing", references: [] };
  }

  const references = scanLayerReferences(project, layerIndex);
  if (layerIndex === 0) {
    return { deleted: false, reason: "base", references };
  }
  if (references.length > 0) {
    return { deleted: false, reason: "referenced", references };
  }
  if (layerIndex !== maxLayerIndex(project)) {
    return { deleted: false, reason: "notHighest", references };
  }

  project.layers = project.layers.filter((item) => item.index !== layerIndex);
  return { deleted: true, removedLayer: layer };
}

export function canDeleteLayer(project: Project, layerIndex: number): DeleteLayerResult {
  const layer = project.layers.find((item) => item.index === layerIndex);
  if (!layer) {
    return { deleted: false, reason: "missing", references: [] };
  }

  const references = scanLayerReferences(project, layerIndex);
  if (layerIndex === 0) {
    return { deleted: false, reason: "base", references };
  }
  if (references.length > 0) {
    return { deleted: false, reason: "referenced", references };
  }
  if (layerIndex !== maxLayerIndex(project)) {
    return { deleted: false, reason: "notHighest", references };
  }

  return { deleted: true, removedLayer: layer };
}

function transparentLayer(index: number, keys: VisualKey[]): Layer {
  return {
    id: `layer_${index}`,
    index,
    name: `Layer ${index}`,
    enabled: true,
    assignments: keys.map((key, keyIndex) => ({
      id: `layer_${index}_${keyIndex}`,
      visualKeyId: key.id,
      kind: "transparent",
      qmk: "KC_TRNS",
    })),
  };
}

function nextLayerIndex(project: Project): number {
  return maxLayerIndex(project) + 1;
}

function maxLayerIndex(project: Project): number {
  return project.layers.reduce((max, layer) => Math.max(max, layer.index), -1);
}

function sortLayers(project: Project): void {
  project.layers.sort((left, right) => left.index - right.index);
}
