import { describe, expect, it } from "vitest";
import { buildSelectedKeyContext } from "./keyDetails";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";

const layout = keychronV5MaxKeyboard.layouts[0];

describe("selected key context", () => {
  it("resolves transparent keys through lower layers", () => {
    const context = buildSelectedKeyContext(keychronV5MaxProject, layout.keys, 3, "v5_000");

    expect(context?.selectedAssignment?.qmk).toBe("KC_TRNS");
    expect(context?.selectedAssignment?.resolved?.layer.index).toBe(2);
    expect(context?.selectedAssignment?.resolved?.qmk).toBe("KC_ESC");
  });

  it("collects layer targets and lighting conditions for a selected key", () => {
    const context = buildSelectedKeyContext(keychronV5MaxProject, layout.keys, 2, "v5_091");

    expect(context?.selectedAssignment?.targetLayer).toMatchObject({
      index: 3,
      exists: true,
    });
    expect(context?.lighting.conditions.map((condition) => condition.id)).toContain("fn_layer_glow");
    expect(context?.relations.some((relation) => relation.kind === "layer" && relation.qmk === "MO(3)")).toBe(
      true,
    );
  });
});
