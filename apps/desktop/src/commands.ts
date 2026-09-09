import type { Layer } from "./domain";

/**
 * Pure-data editor commands for undo/redo. Each command describes a mutation
 * with enough information to apply it forward or backward; the executor lives
 * in `appState.ts`. Keeping the commands as data means a future Rust-mutation
 * backend only needs to implement the same command types.
 */

export type AssignKeycodeCommand = {
  kind: "assign-keycode";
  layerIndex: number;
  keyId: string;
  before: string;
  after: string;
};

export type SetLightingCommand = {
  kind: "set-lighting";
  keyId: string;
  before: string;
  after: string;
};

export type LayersCommand = {
  kind: "layers";
  before: Layer[];
  after: Layer[];
};

export type Command = AssignKeycodeCommand | SetLightingCommand | LayersCommand;

export type CommandHistory = {
  push(command: Command): void;
  undo(): Command | null;
  redo(): Command | null;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
};

export function createCommandHistory(): CommandHistory {
  const undoStack: Command[] = [];
  const redoStack: Command[] = [];

  return {
    push(command) {
      undoStack.push(command);
      redoStack.length = 0;
    },
    undo() {
      const command = undoStack.pop();
      if (command) {
        redoStack.push(command);
      }
      return command ?? null;
    },
    redo() {
      const command = redoStack.pop();
      if (command) {
        undoStack.push(command);
      }
      return command ?? null;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}
