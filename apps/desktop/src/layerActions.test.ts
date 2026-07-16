import { describe, expect, it } from "vitest";
import { exportQmkJson, validateProject } from "./domain";
import {
  addTransparentLayer,
  deleteLayer,
  duplicateLayer,
  MAX_QMK_LAYER_INDEX,
  renameLayer,
  scanLayerReferences,
} from "./layerActions";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";

const layout = keychronV5MaxKeyboard.layouts[0];

describe("layer actions", () => {
  it("detects assignments that reference a target layer", () => {
    const project = structuredClone(keychronV5MaxProject);

    const references = scanLayerReferences(project, 3);

    expect(references).toContainEqual(
      expect.objectContaining({
        sourceLayerIndex: 2,
        targetLayerIndex: 3,
        visualKeyId: "v5_091",
        qmk: "MO(3)",
      }),
    );
  });

  it("adds an exportable transparent layer", () => {
    const project = structuredClone(keychronV5MaxProject);

    const layer = addTransparentLayer(project, layout.keys);
    expect(layer).not.toBeNull();
    const exported = exportQmkJson(project, keychronV5MaxKeyboard);

    expect(layer!.index).toBe(4);
    expect(validateProject(project, keychronV5MaxKeyboard)).toEqual([]);
    expect(exported.layers[4]).toHaveLength(layout.keys.length);
    expect(new Set(exported.layers[4])).toEqual(new Set(["KC_TRNS"]));
  });

  it("duplicates a layer in layout order", () => {
    const project = structuredClone(keychronV5MaxProject);

    const layer = duplicateLayer(project, 2, layout.keys);
    const exported = exportQmkJson(project, keychronV5MaxKeyboard);

    expect(layer?.index).toBe(4);
    expect(validateProject(project, keychronV5MaxKeyboard)).toEqual([]);
    expect(exported.layers[4]).toEqual(exported.layers[2]);
  });

  it("renames layers without accepting empty names", () => {
    const project = structuredClone(keychronV5MaxProject);

    expect(renameLayer(project, 2, "Gaming")).toBe(true);
    expect(renameLayer(project, 2, "   ")).toBe(false);

    expect(project.layers.find((layer) => layer.index === 2)?.name).toBe("Gaming");
  });

  it("blocks referenced layers and deletes the highest unreferenced layer", () => {
    const project = structuredClone(keychronV5MaxProject);

    const blocked = deleteLayer(project, 3);
    const added = addTransparentLayer(project, layout.keys);
    expect(added).not.toBeNull();
    const deleted = deleteLayer(project, added!.index);

    expect(blocked).toMatchObject({ deleted: false, reason: "referenced" });
    expect(deleted).toMatchObject({ deleted: true });
    expect(project.layers.map((layer) => layer.index)).toEqual([0, 1, 2, 3]);
    expect(validateProject(project, keychronV5MaxKeyboard)).toEqual([]);
  });

  it("does not create layers above QMK's supported layer index", () => {
    const project = structuredClone(keychronV5MaxProject);

    while (project.layers.at(-1)?.index !== MAX_QMK_LAYER_INDEX) {
      expect(addTransparentLayer(project, layout.keys)).not.toBeNull();
    }

    expect(addTransparentLayer(project, layout.keys)).toBeNull();
    expect(duplicateLayer(project, 2, layout.keys)).toBeNull();
    expect(project.layers.at(-1)?.index).toBe(MAX_QMK_LAYER_INDEX);
  });
});
