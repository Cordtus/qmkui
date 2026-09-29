import { describe, expect, it } from "vitest";
import { createCommandHistory, type Command } from "./commands";

describe("command history", () => {
  it("pushes commands onto the undo stack and pops them in reverse order", () => {
    const history = createCommandHistory();
    history.push(assignCommand("A"));
    history.push(assignCommand("B"));

    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toMatchObject({ keyId: "B" });
    expect(history.undo()).toMatchObject({ keyId: "A" });
    expect(history.canUndo()).toBe(false);
    expect(history.undo()).toBeNull();
  });

  it("moves undone commands onto the redo stack", () => {
    const history = createCommandHistory();
    history.push(assignCommand("A"));

    expect(history.undo()).toMatchObject({ keyId: "A" });
    expect(history.canRedo()).toBe(true);
    expect(history.redo()).toMatchObject({ keyId: "A" });
    expect(history.canRedo()).toBe(false);
    expect(history.redo()).toBeNull();
  });

  it("clears the redo stack when a new command is pushed", () => {
    const history = createCommandHistory();
    history.push(assignCommand("A"));
    history.undo();
    expect(history.canRedo()).toBe(true);

    history.push(assignCommand("B"));
    expect(history.canRedo()).toBe(false);
  });

  it("clears both stacks", () => {
    const history = createCommandHistory();
    history.push(assignCommand("A"));
    history.push(assignCommand("B"));
    history.clear();

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it("coalesces consecutive edits to the same lighting control", () => {
    const history = createCommandHistory();
    const profile = (mode: "static" | "reactive" | "off"): Command => ({
      kind: "set-lighting-profile",
      field: "mode",
      before: { mode: "static", global: {} },
      after: { mode, global: {} },
    });
    history.push(profile("reactive"));
    history.push(profile("off"));

    // One undo steps all the way back to the starting mode.
    expect(history.undo()).toMatchObject({ after: { mode: "off" }, before: { mode: "static" } });
    expect(history.canUndo()).toBe(false);
  });

  it("coalesces a colour drag into one set-lighting step", () => {
    const history = createCommandHistory();
    const color = (after: string): Command => ({
      kind: "set-lighting",
      keyId: "v5_000",
      before: "#000000",
      after,
    });
    history.push(color("#111111"));
    history.push(color("#222222"));

    expect(history.undo()).toMatchObject({ keyId: "v5_000", after: "#222222" });
    expect(history.canUndo()).toBe(false);
  });
});

function assignCommand(keyId: string): Command {
  return { kind: "assign-keycode", layerIndex: 0, keyId, before: "KC_NO", after: "KC_A" };
}
