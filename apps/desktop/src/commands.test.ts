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
});

function assignCommand(keyId: string): Command {
  return { kind: "assign-keycode", layerIndex: 0, keyId, before: "KC_NO", after: "KC_A" };
}
