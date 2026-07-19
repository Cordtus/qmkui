import { describe, expect, it } from "vitest";
import {
  available,
  createHardwareSnapshot,
  unavailable,
  unverified,
  type HardwareSnapshotInput,
} from "./hardwareSnapshot";

const readAt = "2026-07-18T16:00:00.000Z";

function layer(id: string, qmk: string) {
  return {
    id,
    index: 0,
    name: "Base",
    enabled: true,
    assignments: [{ id: `${id}-a`, visualKeyId: "KeyA", kind: "keycode", qmk }],
  };
}

function lightingProfile(name: string) {
  return {
    id: name.toLowerCase(),
    name,
    mode: "static" as const,
    perKey: { KeyA: "#ff0000" },
  };
}

function readableInput(): HardwareSnapshotInput {
  return {
    hardware: {
      identity: available({
        modelId: "keychron/v5_max/ansi_encoder",
        displayName: "Keychron V5 Max ANSI Knob",
        firmwareVersion: "0.12.0",
      }),
      layout: available({
        keyboardId: "keychron/v5_max/ansi_encoder",
        rows: 6,
        columns: 17,
        keyMapping: { KeyA: { row: 2, column: 1 } },
      }),
      capabilities: available({ dynamicKeymap: { support: "supported", layers: 4 } }),
    },
    configuration: {
      keymapLayers: available([layer("live", "KC_A")]),
      lighting: available([lightingProfile("Live")]),
    },
    readAt,
  };
}

describe("hardware snapshot", () => {
  it("deep-freezes hardware facts and nested configuration values", () => {
    const snapshot = createHardwareSnapshot(readableInput());
    const keymapLayers = snapshot.configuration.keymapLayers;
    const layout = snapshot.hardware.layout;

    if (keymapLayers.state !== "available" || layout.state !== "available") {
      throw new Error("expected readable snapshot fields to be available");
    }

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(keymapLayers.value[0].assignments[0])).toBe(true);
    expect(() => {
      (keymapLayers.value[0].assignments[0] as { qmk: string }).qmk = "KC_B";
    }).toThrow(TypeError);
    expect(() => {
      (layout.value.keyMapping.KeyA as { row: number }).row = 5;
    }).toThrow(TypeError);
    expect(keymapLayers.value[0].assignments[0].qmk).toBe("KC_A");
    expect(layout.value.keyMapping.KeyA.row).toBe(2);
  });

  it("retains unavailable and unverified reasons for each unread field", () => {
    const snapshot = createHardwareSnapshot({
      hardware: {
        identity: unavailable("device did not identify itself"),
        layout: unverified("layout command has not been observed"),
        capabilities: unavailable("firmware does not expose capability metadata"),
      },
      configuration: {
        keymapLayers: unverified("keymap read is not validated for this protocol"),
        lighting: unavailable("lighting is disabled on this keyboard"),
      },
      readAt,
    });

    expect(snapshot.hardware.identity).toEqual({
      state: "unavailable",
      reason: "device did not identify itself",
    });
    expect(snapshot.hardware.layout).toEqual({
      state: "unverified",
      reason: "layout command has not been observed",
    });
    expect(snapshot.configuration.keymapLayers).toEqual({
      state: "unverified",
      reason: "keymap read is not validated for this protocol",
    });
    expect(snapshot.configuration.lighting).toEqual({
      state: "unavailable",
      reason: "lighting is disabled on this keyboard",
    });
  });

  it("keeps an available default baseline separate from the current device configuration", () => {
    const snapshot = createHardwareSnapshot({
      ...readableInput(),
      configuration: {
        keymapLayers: unverified("current keymap has not been read"),
        lighting: available([lightingProfile("Live")]),
      },
      defaultBaseline: available({
        source: "factory firmware 0.12.0",
        keymapLayers: [layer("factory", "KC_B")],
        lighting: [lightingProfile("Factory")],
      }),
    });

    expect(snapshot.configuration.keymapLayers).toEqual({
      state: "unverified",
      reason: "current keymap has not been read",
    });
    expect(snapshot.defaultBaseline?.state).toBe("available");
    if (snapshot.defaultBaseline?.state !== "available") {
      throw new Error("expected the default baseline to be available");
    }
    expect(snapshot.defaultBaseline.value.keymapLayers[0].assignments[0].qmk).toBe("KC_B");
    expect(snapshot.defaultBaseline.value.lighting[0].name).toBe("Factory");
  });

  it("creates a read-only copy without mutating the source read data", () => {
    const input = readableInput();
    const snapshot = createHardwareSnapshot(input);
    const snapshotLayout = snapshot.hardware.layout;

    if (input.hardware.layout.state !== "available") {
      throw new Error("expected source layout to be available");
    }
    if (snapshotLayout.state !== "available") {
      throw new Error("expected snapshot layout to be available");
    }
    input.hardware.layout.value.keyMapping.KeyA.row = 4;

    expect(Object.isFrozen(input)).toBe(false);
    expect(snapshotLayout.value.keyMapping.KeyA.row).toBe(2);
    expect(input.hardware.layout.value.keyMapping.KeyA.row).toBe(4);
  });

  it("rejects callable values nested in typed assignment parameters", () => {
    const input = readableInput();

    if (input.configuration.keymapLayers.state !== "available") {
      throw new Error("expected source keymap layers to be available");
    }
    input.configuration.keymapLayers.value[0].assignments[0].params = {
      formatter: () => "KC_A",
    };

    expect(() => createHardwareSnapshot(input)).toThrow("Hardware snapshots can only contain plain data.");
  });

  it("rejects symbol-keyed assignment parameters instead of dropping them", () => {
    const input = readableInput();
    const hiddenParameter = Symbol("hiddenParameter");

    if (input.configuration.keymapLayers.state !== "available") {
      throw new Error("expected source keymap layers to be available");
    }
    const params: Record<string, unknown> = {};
    Object.defineProperty(params, hiddenParameter, {
      enumerable: true,
      value: () => "KC_A",
    });
    input.configuration.keymapLayers.value[0].assignments[0].params = params;

    expect(() => createHardwareSnapshot(input)).toThrow("Hardware snapshots can only contain plain data.");
  });

  it("rejects enumerable accessors without invoking their getters", () => {
    const input = readableInput();
    let getterCalls = 0;

    if (input.configuration.keymapLayers.state !== "available") {
      throw new Error("expected source keymap layers to be available");
    }
    const params: Record<string, unknown> = {};
    Object.defineProperty(params, "derived", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "KC_A";
      },
    });
    input.configuration.keymapLayers.value[0].assignments[0].params = params;

    expect(() => createHardwareSnapshot(input)).toThrow("Hardware snapshots can only contain plain data.");
    expect(getterCalls).toBe(0);
  });
});
