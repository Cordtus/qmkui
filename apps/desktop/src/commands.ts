import type { Layer, LightingProfile } from "./domain";

/**
 * Pure-data editor commands for undo/redo. Each command describes a mutation
 * with enough information to apply it forward or backward; the executor lives
 * in `appState.ts`.
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

export type LightingProfileState = {
  mode: LightingProfile["mode"];
  global: Record<string, string | number | boolean>;
};

export type SetLightingProfileCommand = {
  kind: "set-lighting-profile";
  /** Which field changed ("mode" or "global:<key>"); used to coalesce drags. */
  field: string;
  before: LightingProfileState;
  after: LightingProfileState;
};

export type LayersCommand = {
  kind: "layers";
  before: Layer[];
  after: Layer[];
};

export type Command =
  | AssignKeycodeCommand
  | SetLightingCommand
  | SetLightingProfileCommand
  | LayersCommand;

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
      // Coalesce consecutive edits to the same lighting control so a colour
      // drag or a brightness slider is one undo step, not dozens.
      const last = undoStack[undoStack.length - 1];
      if (
        last &&
        last.kind === "set-lighting" &&
        command.kind === "set-lighting" &&
        last.keyId === command.keyId
      ) {
        last.after = command.after;
      } else if (
        last &&
        last.kind === "set-lighting-profile" &&
        command.kind === "set-lighting-profile" &&
        last.field === command.field
      ) {
        last.after = command.after;
      } else {
        undoStack.push(command);
      }
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
