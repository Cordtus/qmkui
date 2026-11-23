import catalog from "../../../fixtures/catalog/keyboards.json";
import project from "../../../fixtures/projects/example-60.json";
import { createBuildPlan } from "./buildPlan";
import { BuildArtifact, BuildRunner, BuildStep, projectDigest, runLocalBuild, unsupportedBrowserRunner } from "./buildService";
import { importConfiguratorKeymap } from "./configuratorImport";
import { FlashRun, PolicyVerdict, dryRunFlash, flashTargetFromArtifact, previewFlashRequest } from "./flashPlan";
import { createMacroRecord } from "./macros";
import { hexToHsv } from "./color";
import { illuminationBase } from "./illumination";
import { buildSupportBundle, type SupportDevice } from "./supportBundle";
import { resolveRgbMatrixEffect, rgbMatrixEffectsFor, viaDefinitionFor } from "./viaDefinition";
import {
  createCommandHistory,
  type Command,
  type CommandHistory,
  type LightingProfileState,
} from "./commands";
import { BrowserKeyboardNavigator, BrowserKeyboardSelection, chooseBrowserKeyboard, discoverAuthorizedBrowserKeyboard } from "./devices/browserKeyboardDiscovery";
import { buildViaModels } from "./devices/keychronModels";
import { GenericViaStandardState } from "./devices/genericViaReader";
import { KeychronV5MaxReadSnapshot } from "./devices/keychronV5MaxReader";
import { loadLocalDoctorReport } from "./doctorReport";
import { DoctorReport, KeyboardDefinition, LightingProfile, LightingRule, LightingRuleTrigger, Project, UiIssue, exportQmkJson, jsonExportBlockers, validateProject } from "./domain";
import { HostKeyCapture, captureHostKey } from "./keyTester";
import { DEFAULT_BOARD_COLOR, activeLightingProfile, boardColor, lightingForKey } from "./keyDetails";
import { buildFirmwareBundle, firmwareBundleFileName } from "./firmwareBundle";
import { createZip } from "./zip";
import { keycodeCategories, keycodeValue, kindForKeycode } from "./keycodes";
import { addTransparentLayer, deleteLayer, duplicateLayer, renameLayer } from "./layerActions";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import { createProjectFromKeyboard } from "./projectFactory";
import {
  ProjectStorage,
  defaultProjectStorage,
  importProjectJson,
} from "./projectStorage";
import { RecoveryBundle, SafetyAssessment, SafetyAuditReceipt, createRecoveryBundle, createSafetyAssessment, createSafetyAuditReceipt, importRecoveryBundleJson, importSafetyAuditReceiptJson, mergeSafetyLedgers, recoveryBundleMatchesKeyboard, safetyAuditMatchesCurrent, serializeRecoveryBundle, serializeSafetyAuditReceipt } from "./safety";
import { SafetyLedgerStorage, createMemorySafetyLedgerStorage, createSafetyLedgerStorage } from "./safetyStorage";
import { mainShell } from "./views/shell";
export const fixtureKeyboard = catalog[0] as KeyboardDefinition;
export const fixtureProject = project as Project;
export const bundledKeyboards = [keychronV5MaxKeyboard, fixtureKeyboard];
/** Known VIA models derived from the bundled keyboards, for device identity. */
export const bundledViaModels = buildViaModels(bundledKeyboards);

export type AppView = "keymap" | "device" | "firmware";

export type AppOptions = {
  keyboard?: KeyboardDefinition;
  project?: Project;
  projectStorage?: ProjectStorage;
  safetyLedgerStorage?: SafetyLedgerStorage;
  downloadProjectJson?: (project: Project) => void;
  downloadQmkJson?: (output: unknown, project: Project) => void;
  discoverBrowserKeyboard?: () => Promise<BrowserKeyboardSelection>;
  chooseBrowserKeyboard?: () => Promise<BrowserKeyboardSelection>;
  qmkDetected?: boolean;
  doctorReportLoader?: () => Promise<DoctorReport | null>;
  buildRunner?: BuildRunner;
};

export type EditorState = {
  keyboard: KeyboardDefinition;
  project: Project;
  fallbackQmkDetected: boolean;
  qmkDetected: boolean;
  activeView: AppView;
  projectDetailsOpen: boolean;
  boardPickerOpen: boolean;
  commandPaletteOpen: boolean;
  selectedLayerIndex: number;
  /** Last-clicked key; drives the inspector. */
  selectedKeyId: string;
  /** All keys the next lighting edit applies to (multi-select). */
  selectedKeyIds: string[];
  /** Click-to-paint mode: a click applies the current colour to that key. */
  lightingPaint: boolean;
  boardLightingOpen: boolean;
  /** Which keymap rail tab is open. */
  keymapTab: "lighting" | "key" | "layer";
  commandHistory: CommandHistory;
  keycodeCategoryId: string;
  keycodeSearch: string;
  projectStorage: ProjectStorage;
  safetyLedgerStorage: SafetyLedgerStorage;
  downloadProjectJson: (project: Project) => void;
  downloadQmkJson: (output: unknown, project: Project) => void;
  discoverBrowserKeyboard: () => Promise<BrowserKeyboardSelection>;
  chooseBrowserKeyboard: () => Promise<BrowserKeyboardSelection>;
  deviceSelection: DeviceSelectionState;
  deviceSelectionEpoch: number;
  protocolVerification: ProtocolVerificationState;
  hardwareSnapshot?: KeychronV5MaxReadSnapshot | GenericViaStandardState;
  snapshotLayerIndex: number;
  snapshotSelectedKey: string;
  snapshotReadStatus: "idle" | "reading" | "failed";
  /** Result of the last lighting-only resync, shown next to the readout. */
  lightingStatus: string;
  deviceWriteEnabled: boolean;
  projectStatus: string;
  /** Write-gate/result message, surfaced next to the write controls. */
  deviceWriteStatus: string;
  projectJsonDraft: string;
  selectedSavedProjectId: string;
  testEvents: HostKeyCapture[];
  doctorReport?: DoctorReport;
  doctorStatus: "loading" | "ready" | "missing";
  buildRunner: BuildRunner;
  buildStatus: "idle" | "building" | "built" | "failed";
  buildRunnerAvailable: boolean;
  buildStep?: BuildStep;
  artifacts: BuildArtifact[];
  firmwareStep: "build" | "flash" | "verify";
  flashConfirmed: boolean;
  flashVerdict?: PolicyVerdict;
  flashRun?: FlashRun;
};

export type DeviceSelectionState =
  | BrowserKeyboardSelection
  | { state: "discovering" | "selecting" | "cancelled" | "discovery-failed" };

export type ProtocolVerificationState =
  | { state: "idle" }
  | { state: "verifying" }
  | { state: "verified"; version: number }
  | { state: "failed" };

function defaultDiscoverKeyboard(): () => Promise<BrowserKeyboardSelection> {
  return async () => {
    return discoverAuthorizedBrowserKeyboard(navigator as BrowserKeyboardNavigator, { models: bundledViaModels });
  };
}

/**
 * Where the app opens: the device surface, because QMKUI is device-first. With
 * no device attached that view is the "connect a keyboard" prompt.
 */
export function initialView(): AppView {
  return "device";
}

function defaultChooseKeyboard(): () => Promise<BrowserKeyboardSelection> {
  return async () => {
    return chooseBrowserKeyboard(navigator as BrowserKeyboardNavigator, { models: bundledViaModels });
  };
}

export function createApp(root: HTMLElement, options: AppOptions = {}): void {
  const keyboard = structuredClone(options.keyboard ?? keychronV5MaxKeyboard);
  const currentProject = structuredClone(options.project ?? keychronV5MaxProject);
  const projectStorage = options.projectStorage ?? defaultProjectStorage();
  const safetyLedgerStorage = options.safetyLedgerStorage ?? defaultSafetyLedgerStorage();
  const doctorReportLoader =
    options.doctorReportLoader ??
    (import.meta.env.DEV
      ? () => loadLocalDoctorReport(fetch, true)
      : async (): Promise<DoctorReport | null> => null);
  const layout = selectedLayout(keyboard, currentProject);
  const state: EditorState = {
    keyboard,
    project: currentProject,
    fallbackQmkDetected: options.qmkDetected ?? false,
    qmkDetected: options.qmkDetected ?? false,
    activeView: initialView(),
    projectDetailsOpen: false,
    boardPickerOpen: false,
    commandPaletteOpen: false,
    selectedLayerIndex: defaultSelectedLayerIndex(currentProject),
    selectedKeyId: layout.keys[0]?.id ?? "",
    selectedKeyIds: layout.keys[0] ? [layout.keys[0].id] : [],
    lightingPaint: false,
    boardLightingOpen: false,
    keymapTab: "lighting",
    commandHistory: createCommandHistory(),
    keycodeCategoryId: keycodeCategories[0]?.id ?? "basic",
    keycodeSearch: "",
    projectStorage,
    safetyLedgerStorage,
    downloadProjectJson: options.downloadProjectJson ?? downloadProjectJson,
    downloadQmkJson: options.downloadQmkJson ?? downloadQmkJson,
    discoverBrowserKeyboard: options.discoverBrowserKeyboard ?? defaultDiscoverKeyboard(),
    chooseBrowserKeyboard: options.chooseBrowserKeyboard ?? defaultChooseKeyboard(),
    deviceSelection: { state: "discovering" },
    deviceSelectionEpoch: 0,
    protocolVerification: { state: "idle" },
    snapshotLayerIndex: 0,
    snapshotSelectedKey: "0:0",
    snapshotReadStatus: "idle",
    lightingStatus: "",
    deviceWriteEnabled: false,
    projectStatus: "Project is not saved in this preview session.",
    deviceWriteStatus: "",
    projectJsonDraft: JSON.stringify(currentProject, null, 2),
    selectedSavedProjectId: projectStorage.list()[0]?.id ?? "",
    testEvents: [],
    doctorStatus: "loading",
    // No process access in the browser; in-app builds are unavailable. Builds
    // run through the QMK CLI (`qmk compile`) locally.
    buildRunner: options.buildRunner ?? unsupportedBrowserRunner(),
    buildRunnerAvailable: options.buildRunner !== undefined,
    buildStatus: "idle",
    artifacts: [],
    firmwareStep: "build",
    flashConfirmed: false,
  };

  let latestDoctorReportRequest = 0;
  const requestDoctorReport = () => {
    const requestId = ++latestDoctorReportRequest;
    const settle = (report: DoctorReport | null) => {
      if (requestId !== latestDoctorReportRequest) {
        return;
      }
      applyDoctorReport(state, report);
      actions.render();
    };

    state.doctorStatus = "loading";
    actions.render();
    try {
      doctorReportLoader().then(settle, () => settle(null));
    } catch {
      settle(null);
    }
  };

  const requestBrowserKeyboardDiscovery = () => {
    const selectionEpoch = ++state.deviceSelectionEpoch;
    state.deviceSelection = { state: "discovering" };
    state.protocolVerification = { state: "idle" };
    state.hardwareSnapshot = undefined;
    state.snapshotLayerIndex = 0;
    state.snapshotSelectedKey = "0:0";
    state.snapshotReadStatus = "idle";
    state.lightingStatus = "";
    actions.render();
    state.discoverBrowserKeyboard().then(
      (selection) => {
        if (state.deviceSelectionEpoch !== selectionEpoch) {
          return;
        }
        state.deviceSelection = selection;
        state.protocolVerification = { state: "idle" };
        actions.render();
        if (isProtocolVerifiableSelection(selection)) {
          readDeviceSnapshot(state, () => actions.render());
        }
      },
      () => {
        if (state.deviceSelectionEpoch !== selectionEpoch) {
          return;
        }
        state.deviceSelection = { state: "discovery-failed" };
        actions.render();
      },
    );
  };

  const actions = createActions(root, state, requestDoctorReport);
  root.addEventListener(
    "keydown",
    (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        actions.openCommandPalette();
      } else if (event.key === "Escape" && state.commandPaletteOpen) {
        event.preventDefault();
        event.stopPropagation();
        actions.closeCommandPalette();
      }
    },
    true,
  );
  requestDoctorReport();
  requestBrowserKeyboardDiscovery();
}

export function createActions(
  root: HTMLElement,
  state: EditorState,
  requestDoctorReport: () => void,
) {
  /**
   * Resync the board's global RGB-matrix state without re-reading the keymap.
   * VIA exposes no per-LED colour read, so this is the whole readable
   * backlight state; the key map re-derives each key's colour from it.
   * Skipped until a snapshot exists and while a full read is in flight.
   */
  const readLightingNow = () => {
    if (!isBrowserReadSelection(state.deviceSelection)) {
      return;
    }
    if (!isKeychronV5MaxSnapshot(state.hardwareSnapshot)) {
      return;
    }
    if (state.snapshotReadStatus === "reading") {
      return;
    }
    const session = browserReadSession(state.deviceSelection);
    if (!("readLighting" in session) || !session.readLighting) {
      return;
    }
    const readLighting = session.readLighting;
    const selectionEpoch = state.deviceSelectionEpoch;
    state.lightingStatus = "Reading lighting…";
    actions.render();
    readLighting().then(
      (lighting) => {
        if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
          return;
        }
        if (!isKeychronV5MaxSnapshot(state.hardwareSnapshot)) {
          state.lightingStatus = "";
          actions.render();
          return;
        }
        if (lighting.state !== "available") {
          state.lightingStatus = lighting.reason ?? "Lighting read failed.";
          actions.render();
          return;
        }
        state.hardwareSnapshot = {
          ...state.hardwareSnapshot,
          lighting,
          readAt: new Date().toISOString(),
        };
        state.lightingStatus = "Lighting resynced from board.";
        actions.render();
      },
      () => {
        if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
          return;
        }
        state.lightingStatus = "Lighting read failed.";
        actions.render();
      },
    );
  };

  const closeOverlays = () => {
    state.commandPaletteOpen = false;
    state.boardPickerOpen = false;
    state.projectDetailsOpen = false;
  };

  const actions = {
    openCommandPalette: () => {
      closeOverlays();
      state.commandPaletteOpen = true;
      actions.render();
    },
    closeCommandPalette: () => {
      state.commandPaletteOpen = false;
      actions.render();
      queueMicrotask(() => focusControl(root, '[data-focus-id="command-palette-trigger"]'));
    },
    openBoardPicker: () => {
      closeOverlays();
      state.boardPickerOpen = true;
      actions.render();
    },
    closeBoardPicker: () => {
      state.boardPickerOpen = false;
      actions.render();
      queueMicrotask(() => focusControl(root, '[data-focus-id="board-picker-trigger"]'));
    },
    openProjectDetails: () => {
      closeOverlays();
      state.projectDetailsOpen = true;
      actions.render();
    },
    closeProjectDetails: () => {
      state.projectDetailsOpen = false;
      actions.render();
      queueMicrotask(() => focusControl(root, '[data-focus-id="project-details-trigger"]'));
    },
    render: () => {
      const focusedInput = captureFocusedInput(root);
      const workspaceScroll = captureWorkspaceScroll(root);
      const layout = selectedLayout(state.keyboard, state.project);
      const issues = validateProject(state.project, state.keyboard);
      const qmkJson = safeExportQmkJson(state.project, state.keyboard, issues);

      root.replaceChildren(
        mainShell(state, layout, issues, qmkJson, {
          selectLayer: (nextLayerIndex) => {
            state.selectedLayerIndex = nextLayerIndex;
            actions.render();
          },
          selectKeymapTab: (tab) => {
            state.keymapTab = tab;
            actions.render();
          },
          selectFirmwareStep: (step) => {
            state.firmwareStep = step;
            actions.render();
          },
          selectView: (view) => {
            state.activeView = view;
            actions.render();
            // The key map mirrors live board lighting, so resync on entry.
            if (view === "keymap") {
              readLightingNow();
            }
          },
          openCommandPalette: actions.openCommandPalette,
          closeCommandPalette: actions.closeCommandPalette,
          openBoardPicker: actions.openBoardPicker,
          closeBoardPicker: actions.closeBoardPicker,
          openProjectDetails: actions.openProjectDetails,
          closeProjectDetails: actions.closeProjectDetails,
          selectKey: (keyId, additive = false) => {
            state.selectedKeyId = keyId;
            if (additive) {
              const next = new Set(state.selectedKeyIds);
              if (next.has(keyId)) {
                next.delete(keyId);
              } else {
                next.add(keyId);
              }
              // Keep at least one key selected so lighting edits always have a target.
              state.selectedKeyIds = next.size > 0 ? [...next] : [keyId];
            } else {
              state.selectedKeyIds = [keyId];
            }
            actions.render();
          },
          selectAllKeys: () => {
            const layout = selectedLayout(state.keyboard, state.project);
            state.selectedKeyIds = layout.keys.map((key) => key.id);
            state.selectedKeyId = state.selectedKeyIds[0] ?? state.selectedKeyId;
            actions.render();
          },
          updateSelectedKeycode: (qmk) => {
            const layerIndex = state.selectedLayerIndex;
            const keyId = state.selectedKeyId;
            const before = assignmentQmk(state.project, layerIndex, keyId);
            updateAssignment(state, qmk);
            state.commandHistory.push({
              kind: "assign-keycode",
              layerIndex,
              keyId,
              before,
              after: qmk || "KC_NO",
            });
            actions.render();
          },
          updateSelectedLighting: (color) => {
            const keyIds = state.selectedKeyIds.length ? state.selectedKeyIds : [state.selectedKeyId];
            const profile = activeLightingProfile(state.project);
            const before = keyIds.map((keyId) => profile.perKey[keyId] ?? "");
            keyIds.forEach((keyId) => setLightingColor(state.project, keyId, color));
            state.commandHistory.push({ kind: "set-lighting", keyIds, before, after: color });
            actions.render();
          },
          setBoardLightingOpen: (open) => {
            // Native <details> already reflects the change; re-rendering here
            // would destroy the focused summary. The next render uses the
            // stored state.
            state.boardLightingOpen = open;
          },
          toggleLightingPaint: () => {
            state.lightingPaint = !state.lightingPaint;
            actions.render();
          },
          paintKey: (keyId) => {
            const brush = lightingForKey(
              activeLightingProfile(state.project),
              state.selectedKeyId,
              illuminationBase(state.hardwareSnapshot),
            ).color;
            if (!brush) {
              state.selectedKeyId = keyId;
              state.selectedKeyIds = [keyId];
              actions.render();
              return;
            }
            const profile = activeLightingProfile(state.project);
            const before = [profile.perKey[keyId] ?? ""];
            setLightingColor(state.project, keyId, brush);
            state.selectedKeyId = keyId;
            state.selectedKeyIds = [keyId];
            state.commandHistory.push({ kind: "set-lighting", keyIds: [keyId], before, after: brush });
            actions.render();
          },
          clearSelectedLighting: () => {
            const keyIds = state.selectedKeyIds.length ? state.selectedKeyIds : [state.selectedKeyId];
            const profile = activeLightingProfile(state.project);
            const before = keyIds.map((keyId) => profile.perKey[keyId] ?? "");
            if (before.every((color) => !color)) {
              return;
            }
            keyIds.forEach((keyId) => {
              delete profile.perKey[keyId];
            });
            state.commandHistory.push({ kind: "set-lighting", keyIds, before, after: "" });
            actions.render();
          },
          addLightingRule: (trigger) => {
            const layout = selectedLayout(state.keyboard, state.project);
            const target = layout.keys.find((key) => key.id === state.selectedKeyId);
            if (!target?.matrix) {
              state.projectStatus = "This key has no LED position; pick another key.";
              actions.render();
              return;
            }
            if (trigger.kind === "held") {
              const source = layout.keys.find((key) => key.id === trigger.keyId);
              if (!source?.matrix) {
                state.projectStatus = "The held key has no matrix position; pick another key.";
                actions.render();
                return;
              }
            }
            const profile = activeLightingProfile(state.project);
            const color =
              lightingForKey(
                profile,
                state.selectedKeyId,
                illuminationBase(state.hardwareSnapshot),
              ).color || DEFAULT_BOARD_COLOR;
            const rule: LightingRule = {
              id: `rule_${crypto.randomUUID()}`,
              targetKeyId: state.selectedKeyId,
              color,
              trigger,
            };
            const before = structuredClone(state.project.lightingRules ?? []);
            state.project.lightingRules = [...before, rule];
            state.commandHistory.push({
              kind: "lighting-rules",
              before,
              after: structuredClone(state.project.lightingRules),
            });
            actions.render();
          },
          removeLightingRule: (ruleId) => {
            const before = structuredClone(state.project.lightingRules ?? []);
            const after = before.filter((rule) => rule.id !== ruleId);
            if (after.length === before.length) {
              return;
            }
            state.project.lightingRules = after;
            state.commandHistory.push({
              kind: "lighting-rules",
              before,
              after: structuredClone(after),
            });
            actions.render();
          },
          downloadFirmwareBundle: () => {
            const issues = validateProject(state.project, state.keyboard);
            if (issues.some((issue) => issue.severity === "error")) {
              state.projectStatus = "Fix keymap and lighting rule errors before exporting firmware.";
              actions.render();
              return;
            }
            const files = buildFirmwareBundle(
              state.project,
              state.keyboard,
              activeLightingProfile(state.project),
            );
            if (!files) {
              state.projectStatus = "The project layout does not match the selected keyboard.";
              actions.render();
              return;
            }
            downloadBytes(
              createZip(files),
              firmwareBundleFileName(state.project),
              "application/zip",
            );
            state.projectStatus =
              "Firmware bundle downloaded: copy it into your QMK checkout, then compile and flash.";
            actions.render();
          },
          undo: () => {
            const command = state.commandHistory.undo();
            if (command) {
              applyCommand(state, command, "backward");
              actions.render();
            }
          },
          redo: () => {
            const command = state.commandHistory.redo();
            if (command) {
              applyCommand(state, command, "forward");
              actions.render();
            }
          },
          captureHostKey: (input) => {
            const capture = captureHostKey(state.project, state.selectedLayerIndex, input);
            state.testEvents = [capture, ...state.testEvents].slice(0, 12);
            state.selectedKeyId = capture.matchedKeyIds[0] ?? state.selectedKeyId;
            state.selectedKeyIds = [state.selectedKeyId];
            actions.render();
          },
          downloadQmkJson: () => {
            const issues = validateProject(state.project, state.keyboard);
            if (issues.some((issue) => issue.severity === "error")) {
              return;
            }
            const blockers = jsonExportBlockers(state.project);
            if (blockers.length > 0) {
              state.projectStatus = blockers.join(" ");
              actions.render();
              return;
            }
            state.downloadQmkJson(
              safeExportQmkJson(state.project, state.keyboard, issues),
              state.project,
            );
          },
          downloadViaDefinition: (qmkKeyboard) => {
            const entry = viaDefinitionFor(qmkKeyboard);
            if (!entry) {
              state.projectStatus = `No bundled VIA definition for ${qmkKeyboard}.`;
              actions.render();
              return;
            }
            downloadJson(
              JSON.stringify(entry.definition, null, 2),
              `via-${slugify(entry.definition.name)}.json`,
            );
            state.projectStatus = `VIA definition exported for ${qmkKeyboard}; sideload it in VIA's Design tab.`;
            actions.render();
          },
          chooseBrowserKeyboard: () => {
            const selectionEpoch = ++state.deviceSelectionEpoch;
            state.deviceSelection = { state: "selecting" };
            state.protocolVerification = { state: "idle" };
            state.hardwareSnapshot = undefined;
            state.snapshotLayerIndex = 0;
            state.snapshotReadStatus = "idle";
            state.lightingStatus = "";
            actions.render();
            state.chooseBrowserKeyboard().then(
              (selection) => {
                if (state.deviceSelectionEpoch !== selectionEpoch) {
                  return;
                }
                state.deviceSelection = selection;
                state.protocolVerification = { state: "idle" };
                state.hardwareSnapshot = undefined;
                state.snapshotLayerIndex = 0;
                state.snapshotSelectedKey = "0:0";
                state.snapshotReadStatus = "idle";
                state.lightingStatus = "";
                actions.render();
                if (isProtocolVerifiableSelection(selection)) {
                  readDeviceSnapshot(state, () => actions.render());
                }
              },
              () => {
                if (state.deviceSelectionEpoch !== selectionEpoch) {
                  return;
                }
                state.deviceSelection = { state: "cancelled" };
                actions.render();
              },
            );
          },
          verifyKeychronV5MaxProtocol: () => {
            if (!isBrowserReadSelection(state.deviceSelection)) {
              return;
            }
            const selectionEpoch = state.deviceSelectionEpoch;
            const session = browserReadSession(state.deviceSelection);
            state.protocolVerification = { state: "verifying" };
            actions.render();
            session.verifyProtocolVersion().then(
              ({ version }: { version: number }) => {
                if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
                  return;
                }
                state.protocolVerification = { state: "verified", version };
                actions.render();
              },
              () => {
                if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
                  return;
                }
                state.protocolVerification = { state: "failed" };
                actions.render();
              },
            );
          },
          readDevice: () => {
            readDeviceSnapshot(state, () => actions.render());
          },
          refreshLighting: readLightingNow,
          selectKeycodeCategory: (categoryId) => {
            state.keycodeCategoryId = categoryId;
            state.keycodeSearch = "";
            actions.render();
          },
          selectSnapshotLayer: (layerIndex) => {
            if (
              !isKeychronV5MaxSnapshot(state.hardwareSnapshot) ||
              state.hardwareSnapshot.keymap.state !== "available" ||
              !state.hardwareSnapshot.keymap.value.keycodes[layerIndex]
            ) {
              return;
            }
            state.snapshotLayerIndex = layerIndex;
            actions.render();
          },
          selectSnapshotKey: (matrixKey) => {
            state.snapshotSelectedKey = matrixKey;
            actions.render();
          },
          enableDeviceWrites: (confirmed) => {
            if (!confirmed) {
              noteWriteStatus(state, "Confirm the checkbox, then enable device writes.");
              actions.render();
              return;
            }
            state.deviceWriteEnabled = true;
            noteWriteStatus(state, "Device writes enabled; use caution.");
            actions.render();
          },
          writeSnapshotKeycode: (keycode, confirmed) => {
            if (!confirmed || !state.deviceWriteEnabled) {
              noteWriteStatus(state, "Confirm the write and enable device writes first.");
              actions.render();
              return;
            }
            if (!Number.isInteger(keycode) || keycode < 0 || keycode > 0xffff) {
              noteWriteStatus(state, "Enter a hex keycode between 0000 and FFFF.");
              actions.render();
              return;
            }
            if (!isKeychronV5MaxSnapshot(state.hardwareSnapshot)) {
              noteWriteStatus(state, "No device keymap snapshot to write to.");
              actions.render();
              return;
            }
            const session = currentWriteSession(state);
            if (!session) {
              noteWriteStatus(state, writeRefusalReason(state));
              actions.render();
              return;
            }
            const [rowText, colText] = state.snapshotSelectedKey.split(":");
            const row = Number(rowText);
            const col = Number(colText);
            if (!Number.isInteger(row) || !Number.isInteger(col)) {
              noteWriteStatus(state, "Select a key on the device keymap first.");
              actions.render();
              return;
            }
            session
              .writeKeycode(state.snapshotLayerIndex, row, col, keycode)
              .then(() => {
                noteWriteStatus(
                  state,
                  `Wrote keycode 0x${keycode.toString(16).padStart(4, "0")} to layer ${state.snapshotLayerIndex} position ${row}:${col}.`,
                );
                actions.render();
              })
              .catch(() => {
                noteWriteStatus(state, "Device write failed.");
                actions.render();
              });
          },
          writeLightingToDevice: (confirmed) => {
            if (!confirmed || !state.deviceWriteEnabled) {
              noteWriteStatus(state, "Confirm the lighting write and enable device writes first.");
              actions.render();
              return;
            }
            const session = currentWriteSession(state);
            if (!session) {
              noteWriteStatus(state, writeRefusalReason(state));
              actions.render();
              return;
            }
            if (!session.writeRgbMatrix) {
              noteWriteStatus(state, "This device does not expose a lighting write.");
              actions.render();
              return;
            }
            const profile = activeLightingProfile(state.project);
            const base = illuminationBase(state.hardwareSnapshot);
            // Board lighting is its own colour. A per-key override must never
            // become the board's global colour just because that key is selected.
            const color = boardColor(profile, base) || DEFAULT_BOARD_COLOR;
            let hueByte: number;
            let satByte: number;
            if (typeof profile.global?.color === "string") {
              const { h, s } = hexToHsv(color);
              hueByte = Math.round((h / 360) * 255);
              satByte = Math.round(s * 255);
            } else if (base?.hue !== undefined && base.saturation !== undefined) {
              // Use the device's exact channels so an untouched write is a no-op.
              hueByte = base.hue;
              satByte = base.saturation;
            } else {
              const { h, s } = hexToHsv(color);
              hueByte = Math.round((h / 360) * 255);
              satByte = Math.round(s * 255);
            }
            // Default each field to the board's current value when the profile
            // has not set it, so a write does not silently change effect/speed.
            const effect = resolveRgbMatrixEffect(
              profile.global?.effect ?? base?.effect,
              rgbMatrixEffectsFor(state.keyboard.qmkKeyboard),
            );
            const payload = {
              brightness: clampByte(profile.global?.brightness ?? base?.brightness ?? 180),
              effectSpeed: clampByte(profile.global?.speed ?? base?.effectSpeed ?? 128),
              hue: clampByte(hueByte),
              saturation: clampByte(satByte),
              ...(effect === undefined ? {} : { effect }),
            };
            session
              .writeRgbMatrix(payload)
              .then(() => {
                noteWriteStatus(state, "Wrote RGB-matrix lighting to the device.");
                actions.render();
              })
              .catch(() => {
                noteWriteStatus(state, "Lighting write failed.");
                actions.render();
              });
          },
          saveLightingToDevice: (confirmed) => {
            if (!confirmed || !state.deviceWriteEnabled) {
              noteWriteStatus(state, "Confirm the lighting save and enable device writes first.");
              actions.render();
              return;
            }
            const session = currentWriteSession(state);
            if (!session) {
              noteWriteStatus(state, writeRefusalReason(state));
              actions.render();
              return;
            }
            if (!session.saveLighting) {
              noteWriteStatus(state, "This device does not expose a lighting save.");
              actions.render();
              return;
            }
            session
              .saveLighting()
              .then(() => {
                noteWriteStatus(state, "RGB-matrix lighting saved to device EEPROM.");
                actions.render();
              })
              .catch(() => {
                noteWriteStatus(state, "Lighting save failed.");
                actions.render();
              });
          },
          writeKeymapToDevice: (confirmed) => {
            if (!confirmed || !state.deviceWriteEnabled) {
              noteWriteStatus(state, "Confirm the keymap write and enable device writes first.");
              actions.render();
              return;
            }
            const session = currentWriteSession(state);
            if (!session) {
              noteWriteStatus(state, writeRefusalReason(state));
              actions.render();
              return;
            }
            const writes = projectKeymapWrites(state);
            if (writes.entries.length === 0) {
              noteWriteStatus(state, "No writable keycodes in the project keymap.");
              actions.render();
              return;
            }
            let index = 0;
            const runNext = (): Promise<void> => {
              if (index >= writes.entries.length) {
                return Promise.resolve();
              }
              const entry = writes.entries[index]!;
              index += 1;
              return session.writeKeycode(entry.layer, entry.row, entry.col, entry.keycode).then(runNext);
            };
            runNext()
              .then(() => {
                const skipped = writes.skipped.length;
                noteWriteStatus(
                  state,
                  `Wrote ${writes.entries.length} keycodes to the device` +
                    (skipped > 0 ? `; ${skipped} unmappable keycodes were skipped.` : "."),
                );
                actions.render();
              })
              .catch(() => {
                noteWriteStatus(state, `Keymap write failed at entry ${index} of ${writes.entries.length}.`);
                actions.render();
              });
          },
          updateKeycodeSearch: (query) => {
            state.keycodeSearch = query;
            actions.render();
          },
          selectKeyboardFromCatalog: (keyboardId) => {
            const keyboard = bundledKeyboards.find((item) => item.id === keyboardId);
            if (!keyboard) {
              return;
            }
            state.keyboard = structuredClone(keyboard);
            state.project =
              keyboard.id === keychronV5MaxKeyboard.id
                ? structuredClone(keychronV5MaxProject)
                : createProjectFromKeyboard(state.keyboard);
            state.selectedLayerIndex = defaultSelectedLayerIndex(state.project);
            state.selectedKeyId = selectedLayout(state.keyboard, state.project).keys[0]?.id ?? "";
            state.selectedKeyIds = state.selectedKeyId ? [state.selectedKeyId] : [];
            state.commandHistory.clear();
            resetProjectSession(state);
            state.projectJsonDraft = JSON.stringify(state.project, null, 2);
            state.projectStatus = `Created ${state.project.name} from catalog.`;
            state.boardPickerOpen = false;
            state.commandPaletteOpen = false;
            state.activeView = "keymap";
            actions.render();
            queueMicrotask(() => focusControl(root, '[data-focus-id="board-picker-trigger"]'));
          },
          saveProject: () => {
            state.projectStorage.save(state.project);
            state.selectedSavedProjectId = state.project.id;
            state.projectStatus = `Saved ${state.project.name}`;
            state.projectJsonDraft = JSON.stringify(state.project, null, 2);
            actions.render();
          },
          renameSavedProject: (name) => {
            const savedProject = state.projectStorage.load(state.selectedSavedProjectId);
            const nextName = name.trim();
            if (!savedProject || !nextName) {
              state.projectStatus = "Choose a saved project and enter a name.";
              actions.render();
              return;
            }
            savedProject.name = nextName;
            state.projectStorage.save(savedProject);
            if (savedProject.id === state.project.id) {
              state.project.name = nextName;
              state.projectJsonDraft = JSON.stringify(state.project, null, 2);
            }
            state.projectStatus = `Renamed saved project to ${nextName}.`;
            actions.render();
          },
          duplicateSavedProject: () => {
            const savedProject = state.projectStorage.load(state.selectedSavedProjectId);
            if (!savedProject) {
              state.projectStatus = "Choose a saved project to duplicate.";
              actions.render();
              return;
            }
            const copy = {
              ...savedProject,
              id: `${savedProject.id}_copy_${crypto.randomUUID()}`,
              name: `${savedProject.name} copy`,
            };
            state.projectStorage.save(copy);
            state.selectedSavedProjectId = copy.id;
            state.projectStatus = `Duplicated ${savedProject.name}.`;
            actions.render();
          },
          deleteSavedProject: () => {
            const deletedProject = state.projectStorage.load(state.selectedSavedProjectId);
            if (!deletedProject || !state.projectStorage.remove(deletedProject.id)) {
              state.projectStatus = "Choose a saved project to delete.";
              actions.render();
              return;
            }
            state.selectedSavedProjectId = state.projectStorage.list()[0]?.id ?? "";
            state.projectStatus = `Deleted saved project ${deletedProject.name}.`;
            actions.render();
          },
          downloadProjectJson: () => {
            state.downloadProjectJson(structuredClone(state.project));
            state.projectStatus = `Project export started for ${state.project.name}.`;
            actions.render();
          },
          downloadRecoveryBundle: () => {
            const assessment = safetyAssessment(state);
            if (assessment.state === "blocked" || assessment.state === "declined") {
              state.projectStatus = assessment.reason;
              actions.render();
              return;
            }
            try {
              const occurredAt = new Date().toISOString();
              if (assessment.state === "backupRequired") {
                state.safetyLedgerStorage.append(
                  "backupConfirmed",
                  state.project,
                  state.keyboard,
                  occurredAt,
                );
              }
              const bundle = createRecoveryBundle({
                project: state.project,
                keyboard: state.keyboard,
                ledger: state.safetyLedgerStorage.load(),
                createdAt: occurredAt,
              });
              downloadText(
                serializeRecoveryBundle(bundle),
                `qmkui-recovery-${slugify(state.project.name)}.json`,
                "application/json",
              );
              state.projectStatus =
                assessment.state === "backupRequired"
                  ? "Recovery bundle downloaded; backup recorded for this project and device."
                  : "Recovery bundle downloaded again.";
            } catch {
              state.projectStatus = "Recovery bundle could not be downloaded; private storage is unavailable.";
            }
            actions.render();
          },
          declineRecovery: () => {
            const assessment = safetyAssessment(state);
            if (assessment.state === "blocked" || assessment.state === "backupRecorded" || assessment.state === "declined") {
              state.projectStatus = assessment.reason;
              actions.render();
              return;
            }
            try {
              state.safetyLedgerStorage.append(
                "backupDeclined",
                state.project,
                state.keyboard,
                new Date().toISOString(),
              );
              state.projectStatus = "Recovery bundle declined for this project and device state.";
            } catch {
              state.projectStatus = "Could not record the decline; private storage is unavailable.";
            }
            actions.render();
          },
          downloadSafetyAudit: () => {
            const assessment = safetyAssessment(state);
            const event = [...state.safetyLedgerStorage.load().events]
              .reverse()
              .find(
                (candidate) =>
                  candidate.projectRevision === assessment.projectRevision &&
                  candidate.deviceRevision === assessment.deviceRevision,
              );
            if (!event) {
              state.projectStatus = "No safety event matches this project and device.";
              actions.render();
              return;
            }
            const receipt = createSafetyAuditReceipt({
              project: state.project,
              keyboard: state.keyboard,
              event,
            });
            downloadText(
              serializeSafetyAuditReceipt(receipt),
              `qmkui-safety-audit-${slugify(state.project.name)}.json`,
              "application/json",
            );
            state.projectStatus = "Safety audit receipt downloaded.";
            actions.render();
          },
          downloadSupportBundle: () => {
            const snapshot = state.hardwareSnapshot;
            const device: SupportDevice | null = isKeychronV5MaxSnapshot(snapshot)
              ? {
                  model:
                    snapshot.identity.state === "available"
                      ? snapshot.identity.value.model
                      : undefined,
                  firmware:
                    snapshot.identity.state === "available"
                      ? snapshot.identity.value.firmwareVersion
                      : undefined,
                  protocol:
                    snapshot.identity.state === "available"
                      ? snapshot.identity.value.protocolVersion
                          .map((part) => `0x${part.toString(16).padStart(2, "0")}`)
                          .join(" ")
                      : undefined,
                  lighting:
                    snapshot.lighting.state === "available"
                      ? { ...snapshot.lighting.value }
                      : undefined,
                }
              : snapshot
                ? genericSupportDevice(snapshot)
                : null;
            const contents = buildSupportBundle({
              project: state.project,
              doctor: state.doctorReport,
              // Support bundles get shared; macro sequences are redacted.
              includeSensitiveMacroText: false,
              device,
              validation: validateProject(state.project, state.keyboard),
              environment: {
                webhid: typeof navigator !== "undefined" && "hid" in navigator,
                mode: import.meta.env.MODE,
              },
            });
            downloadJson(contents, "qmkui-support-bundle.json");
            state.projectStatus = "Support bundle downloaded.";
            actions.render();
          },
          runLocalBuild: () => {
            const plan = createBuildPlan(state.project, validateProject(state.project, state.keyboard), state.qmkDetected);
            state.buildStatus = "building";
            actions.render();
            runLocalBuild(plan, state.buildRunner).then(
              (step) => {
                state.buildStep = step;
                state.buildStatus = step.status === "succeeded" ? "built" : "failed";
                actions.render();
                if (step.status === "succeeded") {
                  projectDigest(state.project).then((digest) => {
                    state.artifacts = [
                      ...state.artifacts,
                      {
                        id: `artifact-${digest.slice(0, 12)}`,
                        projectDigest: digest,
                        firmwareSha256: digest,
                        qmkKeyboard: plan.keyboardTarget,
                        createdAt: new Date().toISOString(),
                      },
                    ];
                    actions.render();
                  });
                }
              },
              () => {
                state.buildStep = { status: "failed", command: plan.localCommand.join(" "), output: "Build runner crashed.", durationMs: 0 };
                state.buildStatus = "failed";
                actions.render();
              },
            );
          },
          setFlashConfirmed: (confirmed) => {
            state.flashConfirmed = confirmed;
            actions.render();
          },
          runFlashDryRun: () => {
            // Mirrors views/panels.detectedKeyboard; the state layer must not
            // import the view layer, so the accessor is duplicated here.
            const bootloader = state.keyboard.bootloader ?? null;
            const usb = state.keyboard.usb;
            const latest = state.artifacts.at(-1);
            if (!latest) {
              state.flashVerdict = { pass: false, reason: "No build artifact is available to flash." };
              state.flashRun = undefined;
              actions.render();
              return;
            }
            if (!bootloader) {
              state.flashVerdict = { pass: false, reason: "Bootloader family is unknown for this keyboard." };
              state.flashRun = undefined;
              actions.render();
              return;
            }
            if (!usb) {
              state.flashVerdict = { pass: false, reason: "This keyboard declares no USB identity." };
              state.flashRun = undefined;
              actions.render();
              return;
            }
            // Preview only: a browser cannot observe bootloader mode. The
            // native qmkui-flash CLI detects the bootloader identity for real,
            // so never label the declared family as detected here.
            const request = {
              target: flashTargetFromArtifact(latest, bootloader),
              expectedDevice: { vendorId: usb.vid, productId: usb.pid },
              operatorConfirmed: state.flashConfirmed,
            };
            projectDigest(state.project).then((digest) => {
              state.flashVerdict = previewFlashRequest(request, digest);
              state.flashRun = state.flashVerdict.pass ? dryRunFlash(request) : undefined;
              actions.render();
            });
          },
          selectSavedProject: (projectId) => {
            state.selectedSavedProjectId = projectId;
            actions.render();
          },
          openSavedProject: () => {
            const savedProject = state.projectStorage.load(state.selectedSavedProjectId);
            if (!savedProject) {
              state.projectStatus = "Select a saved project to open.";
              actions.render();
              return;
            }
            const keyboard = keyboardForProject(savedProject);
            if (!keyboard) {
              state.projectStatus = `Saved project target ${savedProject.target.qmkKeyboard} is not bundled.`;
              actions.render();
              return;
            }
            openProject(state, savedProject, keyboard, `Opened ${savedProject.name}.`);
            actions.render();
          },
          updateProjectJsonDraft: (json) => {
            // The textarea already owns the draft; re-rendering on each
            // keystroke would rebuild the drawer and move focus.
            state.projectJsonDraft = json;
          },
          importProjectDraft: () => {
            try {
              const imported = projectFromDraft(state.projectJsonDraft, (qmkKeyboard) =>
                bundledKeyboards.find((keyboard) => keyboard.qmkKeyboard === qmkKeyboard),
              );
              if (imported.safetyAudit) {
                if (state.safetyLedgerStorage.availability() !== "available") {
                  state.projectStatus = "Safety audit could not be restored because the private safety ledger is unavailable.";
                } else if (!safetyAuditMatchesCurrent(imported.safetyAudit, state.project, state.keyboard)) {
                  state.projectStatus = "Safety audit does not match the current project and catalog definition; it was not restored.";
                } else {
                  state.safetyLedgerStorage.save(
                    mergeSafetyLedgers(state.safetyLedgerStorage.load(), {
                      version: 1,
                      events: [imported.safetyAudit.event],
                    }),
                  );
                  state.projectStatus =
                    imported.safetyAudit.event.kind === "backupConfirmed"
                      ? "Restored the saved backup-confirmation audit for the current project and device state."
                      : "Restored the saved backup-decline audit for the current project and device state.";
                }
                actions.render();
                return;
              }
              const importedProject = imported.project;
              if (!importedProject) {
                throw new Error("Imported content does not contain a project");
              }
              const keyboard = keyboardForProject(importedProject);
              if (!keyboard) {
                state.projectStatus = `Imported project target ${importedProject.target.qmkKeyboard} is not bundled.`;
                actions.render();
                return;
              }
              let status = `Imported ${importedProject.name}.`;
              if (imported.recoveryBundle) {
                if (!recoveryBundleMatchesKeyboard(imported.recoveryBundle, keyboard)) {
                  status = `Restored ${importedProject.name}; bundled catalog facts changed, so verification must be repeated.`;
                } else if (state.safetyLedgerStorage.availability() !== "available") {
                  status = `Restored ${importedProject.name}; private safety history could not be restored.`;
                } else {
                  state.safetyLedgerStorage.save(
                    mergeSafetyLedgers(
                      state.safetyLedgerStorage.load(),
                      imported.recoveryBundle.ledger,
                    ),
                  );
                  status = `Restored ${importedProject.name} with matching local safety history.`;
                }
              }
              openProject(state, importedProject, keyboard, status);
            } catch (error) {
              state.projectStatus = `Import failed: ${error instanceof Error ? error.message : "Unknown error"}.`;
            }
            actions.render();
          },
          updateSelectedLayerName: (name) => {
            const before = structuredClone(state.project.layers);
            renameLayer(state.project, state.selectedLayerIndex, name);
            state.commandHistory.push({ kind: "layers", before, after: structuredClone(state.project.layers) });
            actions.render();
          },
          updateLightingMode: (mode) => {
            const before = lightingProfileState(state.project);
            activeLightingProfile(state.project).mode = mode;
            state.commandHistory.push({
              kind: "set-lighting-profile",
              field: "mode",
              before,
              after: lightingProfileState(state.project),
            });
            actions.render();
          },
          updateLightingGlobal: (key, value) => {
            const before = lightingProfileState(state.project);
            updateLightingGlobal(state.project, key, value);
            state.commandHistory.push({
              kind: "set-lighting-profile",
              field: `global:${key}`,
              before,
              after: lightingProfileState(state.project),
            });
            actions.render();
          },
          addLayer: () => {
            const before = structuredClone(state.project.layers);
            const layer = addTransparentLayer(state.project, layout.keys);
            if (layer) {
              state.selectedLayerIndex = layer.index;
            }
            state.commandHistory.push({ kind: "layers", before, after: structuredClone(state.project.layers) });
            actions.render();
          },
          duplicateSelectedLayer: () => {
            const before = structuredClone(state.project.layers);
            const layer = duplicateLayer(state.project, state.selectedLayerIndex, layout.keys);
            if (layer) {
              state.selectedLayerIndex = layer.index;
            }
            state.commandHistory.push({ kind: "layers", before, after: structuredClone(state.project.layers) });
            actions.render();
          },
          deleteSelectedLayer: () => {
            const before = structuredClone(state.project.layers);
            const result = deleteLayer(state.project, state.selectedLayerIndex);
            if (result.deleted) {
              state.selectedLayerIndex = state.project.layers.at(-1)?.index ?? 0;
            }
            state.commandHistory.push({ kind: "layers", before, after: structuredClone(state.project.layers) });
            actions.render();
          },
          reloadProbe: () => {
            requestDoctorReport();
          },
          addMacro: (name, macroActions) => {
            const record = createMacroRecord(name, macroActions);
            state.project.macros = [...(state.project.macros ?? []), record];
            actions.render();
          },
          removeMacro: (macroId) => {
            state.project.macros = (state.project.macros ?? []).filter(
              (macro) => macro.id !== macroId,
            );
            actions.render();
          },
        }),
      );
      restoreWorkspaceScroll(root, workspaceScroll);
      restoreFocusedInput(root, focusedInput);
    },
  };

  return actions;
}

export type RenderActions = {
  selectLayer: (layerIndex: number) => void;
  selectView: (view: AppView) => void;
  selectFirmwareStep: (step: EditorState["firmwareStep"]) => void;
  selectKeymapTab: (tab: EditorState["keymapTab"]) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openBoardPicker: () => void;
  closeBoardPicker: () => void;
  openProjectDetails: () => void;
  closeProjectDetails: () => void;
  selectKey: (keyId: string, additive?: boolean) => void;
  selectAllKeys: () => void;
  updateSelectedKeycode: (qmk: string) => void;
  updateSelectedLighting: (color: string) => void;
  setBoardLightingOpen: (open: boolean) => void;
  toggleLightingPaint: () => void;
  paintKey: (keyId: string) => void;
  clearSelectedLighting: () => void;
  addLightingRule: (trigger: LightingRuleTrigger) => void;
  removeLightingRule: (ruleId: string) => void;
  downloadFirmwareBundle: () => void;
  captureHostKey: (input: { code: string; key: string }) => void;
  downloadQmkJson: () => void;
  downloadViaDefinition: (qmkKeyboard: string) => void;
  chooseBrowserKeyboard: () => void;
  verifyKeychronV5MaxProtocol: () => void;
  readDevice: () => void;
  refreshLighting: () => void;
  selectSnapshotLayer: (layerIndex: number) => void;
  selectSnapshotKey: (matrixKey: string) => void;
  enableDeviceWrites: (confirmed: boolean) => void;
  writeSnapshotKeycode: (keycode: number, confirmed: boolean) => void;
  saveLightingToDevice: (confirmed: boolean) => void;
  writeKeymapToDevice: (confirmed: boolean) => void;
  writeLightingToDevice: (confirmed: boolean) => void;
  selectKeycodeCategory: (categoryId: string) => void;
  updateKeycodeSearch: (query: string) => void;
  selectKeyboardFromCatalog: (keyboardId: string) => void;
  saveProject: () => void;
  renameSavedProject: (name: string) => void;
  duplicateSavedProject: () => void;
  deleteSavedProject: () => void;
  downloadProjectJson: () => void;
  downloadRecoveryBundle: () => void;
  declineRecovery: () => void;
  downloadSafetyAudit: () => void;
  downloadSupportBundle: () => void;
  selectSavedProject: (projectId: string) => void;
  openSavedProject: () => void;
  updateProjectJsonDraft: (json: string) => void;
  importProjectDraft: () => void;
  updateSelectedLayerName: (name: string) => void;
  updateLightingMode: (mode: LightingProfile["mode"]) => void;
  updateLightingGlobal: (key: string, value: string | number | boolean) => void;
  addLayer: () => void;
  duplicateSelectedLayer: () => void;
  deleteSelectedLayer: () => void;
  undo: () => void;
  redo: () => void;
  addMacro: (name: string, actions: string) => void;
  removeMacro: (macroId: string) => void;
  reloadProbe: () => void;
  runLocalBuild: () => void;
  setFlashConfirmed: (confirmed: boolean) => void;
  runFlashDryRun: () => void;
};

/** Current recovery state for this exact project, keyboard, and private ledger. */
export function safetyAssessment(state: EditorState): SafetyAssessment {
  return createSafetyAssessment(
    state.project,
    state.keyboard,
    validateProject(state.project, state.keyboard),
    state.safetyLedgerStorage.load(),
    state.safetyLedgerStorage.availability(),
  );
}

export function isProtocolVerifiableSelection(
  selection: DeviceSelectionState,
): selection is Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "via" } }> {
  return selection.state === "selected" && selection.contract.state === "via";
}

export function isGenericViaCandidateSelection(
  selection: DeviceSelectionState,
): selection is Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "unverified-via" } }> {
  return selection.state === "selected" && selection.contract.state === "unverified-via";
}

export function isBrowserReadSelection(
  selection: DeviceSelectionState,
): selection is Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "via" | "unverified-via" } }> {
  return isProtocolVerifiableSelection(selection) || isGenericViaCandidateSelection(selection);
}

export function browserReadSession(selection: Extract<BrowserKeyboardSelection, { state: "selected"; contract: { state: "via" | "unverified-via" } }>) {
  return isProtocolVerifiableSelection(selection) ? selection.session : selection.viaSession;
}

type WriteCapableSession = {
  writeKeycode: (layer: number, row: number, col: number, keycode: number) => Promise<void>;
  writeRgbMatrix?: (state: {
    brightness: number;
    effectSpeed: number;
    hue: number;
    saturation: number;
    effect?: number;
  }) => Promise<void>;
  saveLighting?: () => Promise<void>;
};

function currentWriteSession(state: EditorState): WriteCapableSession | null {
  if (!isBrowserReadSelection(state.deviceSelection)) {
    return null;
  }
  if (!selectionMatchesTarget(state)) {
    return null;
  }
  const session = browserReadSession(state.deviceSelection);
  if ("writeKeycode" in session && session.writeKeycode) {
    return session as WriteCapableSession;
  }
  return null;
}

/**
 * A live write is only allowed when the connected device's USB identity matches
 * the keyboard the write is authored for. A keyboard that declares no USB id
 * cannot be verified, so writes are refused rather than trusting whichever
 * board happens to be connected.
 */
export function selectionMatchesTarget(
  state: Pick<EditorState, "deviceSelection" | "keyboard">,
): boolean {
  const identity = state.deviceSelection.state === "selected" ? state.deviceSelection.identity : undefined;
  const usb = state.keyboard.usb;
  if (!identity || !usb?.vid || !usb?.pid) {
    return false;
  }
  return hexId(identity.vendorId) === normalizeUsbId(usb.vid)
    && hexId(identity.productId) === normalizeUsbId(usb.pid);
}

/** Why a write was refused, distinguishing no-capability from wrong-target. */
export function writeRefusalReason(
  state: Pick<EditorState, "deviceSelection" | "keyboard">,
): string {
  if (!state.keyboard.usb?.vid || !state.keyboard.usb?.pid) {
    return "The keyboard definition has no USB id; the write target cannot be verified.";
  }
  if (isBrowserReadSelection(state.deviceSelection) && !selectionMatchesTarget(state)) {
    return "Connected device does not match the project's target; refusing to write.";
  }
  return "The connected device does not support writes.";
}

function normalizeUsbId(value: string): string {
  const parsed = Number.parseInt(value.replace(/^0x/i, ""), 16);
  return Number.isNaN(parsed) ? value.toLowerCase() : hexId(parsed);
}

function hexId(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

function projectKeymapWrites(state: EditorState): {
  entries: Array<{ layer: number; row: number; col: number; keycode: number }>;
  skipped: string[];
} {
  const layout = state.keyboard.layouts.find(
    (item) => item.id === state.project.target.layoutId,
  );
  const entries: Array<{ layer: number; row: number; col: number; keycode: number }> = [];
  const skipped: string[] = [];
  const layers = [...state.project.layers].sort((a, b) => a.index - b.index);
  for (const layer of layers) {
    for (const assignment of layer.assignments) {
      const key = layout?.keys.find((candidate) => candidate.id === assignment.visualKeyId);
      if (!key?.matrix) {
        continue;
      }
      const value = keycodeValue(assignment.qmk);
      if (value === undefined) {
        skipped.push(`L${layer.index} ${key.id} (${assignment.qmk})`);
        continue;
      }
      entries.push({
        layer: layer.index,
        row: key.matrix.row,
        col: key.matrix.col,
        keycode: value,
      });
    }
  }
  return { entries, skipped };
}

export function isCurrentProtocolSession(
  state: EditorState,
  selectionEpoch: number,
  session: ReturnType<typeof browserReadSession>,
): boolean {
  return (
    state.deviceSelectionEpoch === selectionEpoch &&
    isBrowserReadSelection(state.deviceSelection) &&
    browserReadSession(state.deviceSelection) === session
  );
}

export function readDeviceSnapshot(state: EditorState, render: () => void): void {
  if (!isBrowserReadSelection(state.deviceSelection) || state.snapshotReadStatus === "reading") {
    return;
  }
  const selectionEpoch = state.deviceSelectionEpoch;
  const session = browserReadSession(state.deviceSelection);
  state.snapshotReadStatus = "reading";
  state.lightingStatus = "";
  render();
  ("readSnapshot" in session ? session.readSnapshot() : session.readStandardState()).then(
    (snapshot) => {
      if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
        return;
      }
      state.hardwareSnapshot = snapshot;
      state.snapshotLayerIndex = 0;
      const keyboard = keyboardForSelection(state.deviceSelection) ?? state.keyboard;
      const firstMatrixKey = keyboard.layouts[0]?.keys.find((key) => key.matrix)?.matrix;
      state.snapshotSelectedKey = firstMatrixKey
        ? `${firstMatrixKey.row}:${firstMatrixKey.col}`
        : "0:0";
      state.snapshotReadStatus = "idle";
      render();
    },
    () => {
      if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
        return;
      }
      state.hardwareSnapshot = undefined;
      state.snapshotReadStatus = "failed";
      state.lightingStatus = "";
      render();
    },
  );
}

export function isKeychronV5MaxSnapshot(
  snapshot: EditorState["hardwareSnapshot"],
): snapshot is KeychronV5MaxReadSnapshot {
  return Boolean(snapshot && "capabilities" in snapshot);
}

export type FocusedElement = {
  focusId: string;
  selectionEnd: number | null;
  selectionStart: number | null;
} | null;

export type WorkspaceScroll = {
  left: number;
  top: number;
} | null;

export function captureWorkspaceScroll(root: HTMLElement): WorkspaceScroll {
  const workspace = root.querySelector<HTMLElement>(".workspace");
  if (!workspace) {
    return null;
  }

  return { left: workspace.scrollLeft, top: workspace.scrollTop };
}

export function restoreWorkspaceScroll(root: HTMLElement, scroll: WorkspaceScroll): void {
  if (!scroll) {
    return;
  }

  const workspace = root.querySelector<HTMLElement>(".workspace");
  if (!workspace) {
    return;
  }

  workspace.scrollLeft = scroll.left;
  workspace.scrollTop = scroll.top;
}

function focusElement(element: HTMLElement): void {
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
  }
  element.focus({ preventScroll: true });
}

function focusControl(root: HTMLElement, selector: string): void {
  const host = root.querySelector<HTMLElement>(selector);
  if (host) {
    focusElement(host);
  }
}

export function captureFocusedInput(root: HTMLElement): FocusedElement {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) {
    return null;
  }

  const focusId = active.dataset.focusId;
  if (!focusId) {
    return null;
  }

  return {
    focusId,
    selectionEnd: active instanceof HTMLInputElement ? active.selectionEnd : null,
    selectionStart: active instanceof HTMLInputElement ? active.selectionStart : null,
  };
}

export function restoreFocusedInput(root: HTMLElement, focusedInput: FocusedElement): void {
  if (!focusedInput) {
    return;
  }

  const nextElement = root.querySelector<HTMLElement>(
    `[data-focus-id="${focusedInput.focusId}"]`,
  );
  if (!nextElement) {
    return;
  }

  if (
    nextElement instanceof HTMLInputElement ||
    nextElement instanceof HTMLTextAreaElement ||
    nextElement instanceof HTMLSelectElement
  ) {
    nextElement.focus({ preventScroll: true });
  } else {
    focusElement(nextElement);
  }
  if (
    !(nextElement instanceof HTMLInputElement) ||
    focusedInput.selectionStart === null ||
    focusedInput.selectionEnd === null
  ) {
    return;
  }

  try {
    nextElement.setSelectionRange(focusedInput.selectionStart, focusedInput.selectionEnd);
  } catch {
    // Color inputs do not support text selections in all DOM implementations.
  }
}

export function applyDoctorReport(state: EditorState, report: DoctorReport | null): void {
  state.doctorReport = report ?? undefined;
  state.doctorStatus = report ? "ready" : "missing";
  state.qmkDetected = report ? qmkDetectedFromReport(report) : state.fallbackQmkDetected;
}

export function keyboardForProject(project: Project): KeyboardDefinition | undefined {
  return bundledKeyboards.find(
    (keyboard) =>
      keyboard.id === project.target.keyboardId &&
      keyboard.qmkKeyboard === project.target.qmkKeyboard,
  );
}

/**
 * The bundled keyboard definition for a connected device, matched through the
 * VIA model registry. Undefined for an unrecognized VIA board (standard-state
 * only) or a board with no bundled definition.
 */
export function keyboardForSelection(
  selection: DeviceSelectionState,
): KeyboardDefinition | undefined {
  if (selection.state !== "selected" || selection.contract.state !== "via") {
    return undefined;
  }
  const model = selection.contract.model;
  return model
    ? bundledKeyboards.find((keyboard) => keyboard.qmkKeyboard === model.qmkKeyboard)
    : undefined;
}

export function projectFromDraft(
  json: string,
  resolveKeyboard?: (qmkKeyboard: string) => KeyboardDefinition | undefined,
): {
  project?: Project;
  recoveryBundle?: RecoveryBundle;
  safetyAudit?: SafetyAuditReceipt;
} {
  try {
    const recoveryBundle = importRecoveryBundleJson(json);
    return { project: recoveryBundle.project, recoveryBundle };
  } catch {
    try {
      return { safetyAudit: importSafetyAuditReceiptJson(json) };
    } catch {
      try {
        return { project: importProjectJson(json) };
      } catch (projectError) {
        if (!resolveKeyboard || isAppNativeProjectPayload(json)) {
          throw projectError;
        }
        return { project: importConfiguratorKeymap(json, resolveKeyboard) };
      }
    }
  }
}

function isAppNativeProjectPayload(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { schemaVersion?: unknown };
    return typeof parsed.schemaVersion === "string";
  } catch {
    return false;
  }
}

export function defaultSafetyLedgerStorage(): SafetyLedgerStorage {
  try {
    const storage = window.localStorage;
    return storage ? createSafetyLedgerStorage(storage) : createMemorySafetyLedgerStorage();
  } catch {
    return createMemorySafetyLedgerStorage();
  }
}

export function downloadQmkJson(output: unknown, currentProject: Project): void {
  const contents = JSON.stringify(output, null, 2);
  const filename = currentProject.build.keymapName
    .replace(/[^a-z0-9_-]+/gi, "-")
    .toLowerCase();
  downloadJson(`${contents}\n`, `${filename}-qmk.json`);
}

export function downloadProjectJson(project: Project): void {
  const contents = JSON.stringify(project, null, 2);
  const filename = project.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  downloadJson(`${contents}\n`, `${filename}-project.json`);
}

function genericSupportDevice(
  snapshot: NonNullable<EditorState["hardwareSnapshot"]>,
): SupportDevice {
  const lighting = illuminationBase(snapshot);
  return {
    model: "Generic VIA",
    ...(lighting?.hue !== undefined && lighting.saturation !== undefined
      ? {
          lighting: {
            brightness: lighting.brightness,
            effect: lighting.effect ?? 0,
            effectSpeed: lighting.effectSpeed ?? 0,
            hue: lighting.hue,
            saturation: lighting.saturation,
          },
        }
      : {}),
  };
}

export function downloadJson(contents: string, filename: string): void {
  downloadText(contents, filename, "application/json");
}

export function downloadText(contents: string, filename: string, type: string): void {
  const blob = new Blob([contents], { type });
  downloadBlob(blob, filename);
}

export function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  downloadBlob(new Blob([buffer], { type }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function slugify(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function resetProjectSession(state: EditorState): void {
  state.lightingPaint = false;
  state.boardLightingOpen = false;
  state.lightingStatus = "";
  state.keymapTab = "lighting";
  state.deviceWriteEnabled = false;
  state.deviceWriteStatus = "";
  state.flashConfirmed = false;
  state.flashVerdict = undefined;
  state.flashRun = undefined;
  state.buildStatus = "idle";
  state.buildStep = undefined;
  state.artifacts = [];
  state.firmwareStep = "build";
}

export function openProject(
  state: EditorState,
  project: Project,
  keyboard: KeyboardDefinition,
  status: string,
): void {
  state.keyboard = structuredClone(keyboard);
  state.project = structuredClone(project);
  state.selectedLayerIndex = defaultSelectedLayerIndex(state.project);
  state.commandHistory.clear();
  resetProjectSession(state);
  state.selectedKeyId = selectedLayout(state.keyboard, state.project).keys[0]?.id ?? "";
  state.selectedKeyIds = state.selectedKeyId ? [state.selectedKeyId] : [];
  state.projectJsonDraft = JSON.stringify(state.project, null, 2);
  state.projectStatus = status;
  state.activeView = "keymap";
  state.projectDetailsOpen = false;
  state.boardPickerOpen = false;
  state.commandPaletteOpen = false;
}

export function qmkDetectedFromReport(report: DoctorReport): boolean {
  return (
    report.snapshot.commands?.some(
      (command) =>
        command.name === "qmk" && command.requiredFor === "localBuild" && Boolean(command.path),
    ) ?? false
  );
}

export function currentLayer(state: EditorState) {
  return (
    state.project.layers.find((layer) => layer.index === state.selectedLayerIndex) ??
    state.project.layers[0]
  );
}

export function defaultSelectedLayerIndex(currentProject: Project): number {
  return (
    currentProject.layers.find((layer) => /^win base$/i.test(layer.name))?.index ??
    currentProject.layers[0]?.index ??
    0
  );
}

export function selectedLayout(keyboard: KeyboardDefinition, currentProject: Project) {
  return (
    keyboard.layouts.find((layout) => layout.id === currentProject.target.layoutId) ??
    keyboard.layouts[0]
  );
}

export { activeLightingProfile };

/**
 * Record a write-gate or write-result message. It goes to the shared project
 * status (Project details drawer) and to `deviceWriteStatus`, which renders
 * next to the write controls so a refused write is not silently invisible.
 */
function noteWriteStatus(state: EditorState, message: string): void {
  state.projectStatus = message;
  state.deviceWriteStatus = message;
}

function clampByte(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(number))) : 0;
}

export function lightingProfileState(currentProject: Project): LightingProfileState {
  const profile = activeLightingProfile(currentProject);
  return { mode: profile.mode, global: structuredClone(profile.global ?? {}) };
}

export function updateAssignment(state: EditorState, qmk: string): void {
  setAssignmentQmk(state.project, state.selectedLayerIndex, state.selectedKeyId, qmk);
}

function setAssignmentQmk(project: Project, layerIndex: number, keyId: string, qmk: string): void {
  const layer = project.layers.find((item) => item.index === layerIndex);
  const assignment = layer?.assignments.find((item) => item.visualKeyId === keyId);
  if (!layer || !assignment) {
    return;
  }
  assignment.qmk = qmk || "KC_NO";
  assignment.kind = kindForKeycode(assignment.qmk);
}

function assignmentQmk(project: Project, layerIndex: number, keyId: string): string {
  const layer = project.layers.find((item) => item.index === layerIndex);
  return layer?.assignments.find((item) => item.visualKeyId === keyId)?.qmk ?? "KC_NO";
}

function setLightingColor(project: Project, keyId: string, color: string): void {
  activeLightingProfile(project).perKey[keyId] = color;
}

function applyCommand(state: EditorState, command: Command, direction: "forward" | "backward"): void {
  switch (command.kind) {
    case "assign-keycode":
      setAssignmentQmk(
        state.project,
        command.layerIndex,
        command.keyId,
        direction === "forward" ? command.after : command.before,
      );
      break;
    case "set-lighting":
      command.keyIds.forEach((keyId, index) => {
        const color = direction === "forward" ? command.after : command.before[index] ?? "";
        if (color) {
          setLightingColor(state.project, keyId, color);
        } else {
          delete activeLightingProfile(state.project).perKey[keyId];
        }
      });
      break;
    case "set-lighting-profile": {
      const profile = activeLightingProfile(state.project);
      const snapshot = direction === "forward" ? command.after : command.before;
      profile.mode = snapshot.mode;
      profile.global = structuredClone(snapshot.global);
      break;
    }
    case "layers":
      state.project.layers = structuredClone(
        direction === "forward" ? command.after : command.before,
      );
      break;
    case "lighting-rules":
      state.project.lightingRules = structuredClone(
        direction === "forward" ? command.after : command.before,
      );
      break;
  }
}

export function updateLightingGlobal(
  currentProject: Project,
  key: string,
  value: string | number | boolean,
): void {
  const profile = activeLightingProfile(currentProject);
  profile.global = {
    ...(profile.global ?? {}),
    [key]: value,
  };
}

export function safeExportQmkJson(
  currentProject: Project,
  keyboard: KeyboardDefinition,
  issues: UiIssue[],
): unknown {
  if (issues.some((issue) => issue.severity === "error")) {
    return { blocked: "Project cannot export until validation errors are fixed." };
  }
  const cBlockers = jsonExportBlockers(currentProject);
  if (cBlockers.length > 0) {
    return { blocked: cBlockers.join(" ") };
  }
  return exportQmkJson(currentProject, keyboard);
}
