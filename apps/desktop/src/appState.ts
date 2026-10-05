import catalog from "../../../fixtures/catalog/keyboards.json";
import project from "../../../fixtures/projects/example-60.json";
import { createBuildPlan } from "./buildPlan";
import { BuildArtifact, BuildRunner, BuildStep, projectDigest, runLocalBuild, unsupportedBrowserRunner } from "./buildService";
import { importConfiguratorKeymap } from "./configuratorImport";
import { FlashRun, PolicyVerdict, assessFlashRequest, dryRunFlash, flashTargetFromArtifact } from "./flashPlan";
import { createMacroRecord } from "./macros";
import { hexToHsv } from "./color";
import { illuminationBase } from "./illumination";
import { buildSupportBundle } from "./supportBundle";
import { viaDefinitionFor } from "./viaDefinition";
import {
  createCommandHistory,
  type Command,
  type CommandHistory,
  type LightingProfileState,
} from "./commands";
import { BrowserKeyboardNavigator, BrowserKeyboardSelection, BrowserKeyboardSession, chooseBrowserKeyboard, discoverAuthorizedBrowserKeyboard } from "./devices/browserKeyboardDiscovery";
import { buildViaModels } from "./devices/keychronModels";
import { chooseNativeKeyboard, discoverNativeKeyboard, enableNativeDeviceWrites, isNativeRuntime } from "./devices/nativeKeyboardDiscovery";
import { nativeBuildRunner, nativeFlashDryRun } from "./nativeServices";
import { GenericViaStandardState } from "./devices/genericViaReader";
import { KeychronV5MaxReadSnapshot } from "./devices/keychronV5MaxReader";
import { loadLocalDoctorReport } from "./doctorReport";
import { DoctorReport, KeyboardDefinition, LightingProfile, Project, UiIssue, exportQmkJson, jsonExportBlockers, validateProject } from "./domain";
import { HostKeyCapture, captureHostKey } from "./keyTester";
import { keycodeCategories, keycodeValue, kindForKeycode } from "./keycodes";
import { addTransparentLayer, deleteLayer, duplicateLayer, renameLayer } from "./layerActions";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import { createProjectFromKeyboard } from "./projectFactory";
import {
  ProjectStorage,
  defaultProjectStorage,
  importProjectJson,
} from "./projectStorage";
import { RecoveryBundle, SafetyAuditReceipt, importRecoveryBundleJson, importSafetyAuditReceiptJson, mergeSafetyLedgers, recoveryBundleMatchesKeyboard, safetyAuditMatchesCurrent } from "./safety";
import { SafetyLedgerStorage, createMemorySafetyLedgerStorage, createSafetyLedgerStorage } from "./safetyStorage";
import { mainShell } from "./views/shell";
export const fixtureKeyboard = catalog[0] as KeyboardDefinition;
export const fixtureProject = project as Project;
export const bundledKeyboards = [keychronV5MaxKeyboard, fixtureKeyboard];
/** Known VIA models derived from the bundled keyboards, for device identity. */
export const bundledViaModels = buildViaModels(bundledKeyboards);

export type AppView = "keymap" | "device" | "catalog" | "system";

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
  selectedLayerIndex: number;
  /** Last-clicked key; drives the inspector. */
  selectedKeyId: string;
  /** All keys the next lighting edit applies to (multi-select). */
  selectedKeyIds: string[];
  commandHistory: CommandHistory;
  keycodeCategoryId: string;
  keycodeSearch: string;
  catalogSearch: string;
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
  buildStep?: BuildStep;
  artifacts: BuildArtifact[];
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
    if (isNativeRuntime()) {
      return (await discoverNativeKeyboard()) ?? { state: "no-authorized-device" };
    }
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

function defaultBuildRunner(project: Project): BuildRunner {
  if (!isNativeRuntime()) {
    return unsupportedBrowserRunner();
  }
  let runner: BuildRunner | null = null;
  return async (command: string[]) => {
    runner ??= await nativeBuildRunner(project);
    return runner(command);
  };
}

function defaultChooseKeyboard(): () => Promise<BrowserKeyboardSelection> {
  return async () => {
    if (isNativeRuntime()) {
      return (await chooseNativeKeyboard()) ?? { state: "no-selection" };
    }
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
    selectedLayerIndex: defaultSelectedLayerIndex(currentProject),
    selectedKeyId: layout.keys[0]?.id ?? "",
    selectedKeyIds: layout.keys[0] ? [layout.keys[0].id] : [],
    commandHistory: createCommandHistory(),
    keycodeCategoryId: keycodeCategories[0]?.id ?? "basic",
    keycodeSearch: "",
    catalogSearch: "",
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
    deviceWriteEnabled: false,
    projectStatus: "Project is not saved in this preview session.",
    deviceWriteStatus: "",
    projectJsonDraft: JSON.stringify(currentProject, null, 2),
    selectedSavedProjectId: projectStorage.list()[0]?.id ?? "",
    testEvents: [],
    doctorStatus: "loading",
    buildRunner: options.buildRunner ?? defaultBuildRunner(currentProject),
    buildStatus: "idle",
    artifacts: [],
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
  requestDoctorReport();
  requestBrowserKeyboardDiscovery();
}

export function createActions(
  root: HTMLElement,
  state: EditorState,
  requestDoctorReport: () => void,
) {
  const actions = {
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
          selectView: (view) => {
            state.activeView = view;
            actions.render();
          },
          openProjectDetails: () => {
            state.projectDetailsOpen = true;
            actions.render();
          },
          closeProjectDetails: () => {
            state.projectDetailsOpen = false;
            actions.render();
          },
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
            if (isNativeRuntime()) {
              void enableNativeDeviceWrites().catch(() => {
                state.deviceWriteEnabled = false;
              });
            }
            noteWriteStatus(state, "Device writes enabled; use caution.");
            actions.render();
          },
          writeSnapshotKeycode: (keycode, confirmed) => {
            if (!confirmed || !state.deviceWriteEnabled) {
              noteWriteStatus(state, "Confirm the write and enable device writes first.");
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
            const color = profile.perKey[state.selectedKeyId] ?? base?.color ?? "#5fb99a";
            const { h, s } = hexToHsv(color);
            // The UI effect names map to the board's VIA mode ids (from its
            // VIA definition). Unmapped names leave the device's current effect
            // untouched rather than risk turning the lighting off.
            const effect =
              RGB_MATRIX_EFFECT_IDS[String(profile.global?.effect ?? "solid")] ??
              rgbMatrixEffectId(state.hardwareSnapshot);
            const payload = {
              brightness: clampByte(profile.global?.brightness ?? base?.brightness ?? 180),
              effectSpeed: clampByte(profile.global?.speed ?? 128),
              hue: Math.round((h / 360) * 255),
              saturation: Math.round(s * 255),
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
          updateCatalogSearch: (query) => {
            state.catalogSearch = query;
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
            state.catalogSearch = "";
            state.projectJsonDraft = JSON.stringify(state.project, null, 2);
            state.projectStatus = `Created ${state.project.name} from catalog.`;
            state.activeView = "keymap";
            actions.render();
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
          downloadSupportBundle: () => {
            const contents = buildSupportBundle({
              project: state.project,
              doctor: state.doctorReport,
              includeSensitiveMacroText: true,
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
                        firmwareSha256: `sha256-${digest.slice(0, 24)}`,
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
            const detected = state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
            const device = detected ? { vendorId: detected.device.vid, productId: detected.device.pid } : null;
            const bootloader = state.keyboard.bootloader ?? null;
            const latest = state.artifacts.at(-1);
            if (!latest) {
              state.flashVerdict = { pass: false, reason: "No build artifact is available to flash." };
              state.flashRun = undefined;
              actions.render();
              return;
            }
            const request = {
              target: flashTargetFromArtifact(latest, bootloader ?? "atmel-dfu"),
              expectedDevice: { vendorId: "3434", productId: "0950" },
              operatorConfirmed: state.flashConfirmed,
            };
            if (isNativeRuntime()) {
              nativeFlashDryRun({
                project: state.project,
                artifactId: latest.id,
                expectedVendor: "3434",
                expectedProduct: "0950",
                detectedVendor: device?.vendorId,
                detectedProduct: device?.productId,
                bootloader: bootloader ?? "atmel-dfu",
                operatorConfirmed: state.flashConfirmed,
              }).then(({ verdict, run }) => {
                state.flashVerdict = verdict;
                state.flashRun = run;
                actions.render();
              });
              return;
            }
            projectDigest(state.project).then((digest) => {
              state.flashVerdict = assessFlashRequest(request, digest, device, bootloader);
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
            state.projectJsonDraft = json;
            actions.render();
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
                  state.projectStatus = "Restored the saved backup-decline audit for the current project and device state.";
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
  openProjectDetails: () => void;
  closeProjectDetails: () => void;
  selectKey: (keyId: string, additive?: boolean) => void;
  selectAllKeys: () => void;
  updateSelectedKeycode: (qmk: string) => void;
  updateSelectedLighting: (color: string) => void;
  captureHostKey: (input: { code: string; key: string }) => void;
  downloadQmkJson: () => void;
  downloadViaDefinition: (qmkKeyboard: string) => void;
  chooseBrowserKeyboard: () => void;
  verifyKeychronV5MaxProtocol: () => void;
  readDevice: () => void;
  selectSnapshotLayer: (layerIndex: number) => void;
  selectSnapshotKey: (matrixKey: string) => void;
  enableDeviceWrites: (confirmed: boolean) => void;
  writeSnapshotKeycode: (keycode: number, confirmed: boolean) => void;
  saveLightingToDevice: (confirmed: boolean) => void;
  writeKeymapToDevice: (confirmed: boolean) => void;
  writeLightingToDevice: (confirmed: boolean) => void;
  selectKeycodeCategory: (categoryId: string) => void;
  updateKeycodeSearch: (query: string) => void;
  updateCatalogSearch: (query: string) => void;
  selectKeyboardFromCatalog: (keyboardId: string) => void;
  saveProject: () => void;
  renameSavedProject: (name: string) => void;
  duplicateSavedProject: () => void;
  deleteSavedProject: () => void;
  downloadProjectJson: () => void;
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
 * the keyboard the write is authored for. If the keyboard declares no USB id
 * (a generic VIA board) there is nothing to compare against, so the write is
 * permitted — the device was explicitly chosen by the operator.
 */
function selectionMatchesTarget(state: EditorState): boolean {
  const identity = state.deviceSelection.state === "selected" ? state.deviceSelection.identity : undefined;
  const usb = state.keyboard.usb;
  if (!identity || !usb?.vid || !usb?.pid) {
    return true;
  }
  return hexId(identity.vendorId) === normalizeUsbId(usb.vid)
    && hexId(identity.productId) === normalizeUsbId(usb.pid);
}

/** Why a write was refused, distinguishing no-capability from wrong-target. */
function writeRefusalReason(state: EditorState): string {
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
  if (!isBrowserReadSelection(state.deviceSelection)) {
    return;
  }
  const selectionEpoch = state.deviceSelectionEpoch;
  const session = browserReadSession(state.deviceSelection);
  state.snapshotReadStatus = "reading";
  render();
  ("readSnapshot" in session ? session.readSnapshot() : session.readStandardState()).then(
    (snapshot) => {
      if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
        return;
      }
      state.hardwareSnapshot = snapshot;
      state.snapshotLayerIndex = 0;
      state.snapshotSelectedKey = "0:0";
      state.snapshotReadStatus = "idle";
      render();
    },
    () => {
      if (!isCurrentProtocolSession(state, selectionEpoch, session)) {
        return;
      }
      state.hardwareSnapshot = undefined;
      state.snapshotReadStatus = "failed";
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

  nextElement.focus({ preventScroll: true });
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

export function downloadJson(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "application/json" });
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
  state.selectedKeyId = selectedLayout(state.keyboard, state.project).keys[0]?.id ?? "";
  state.selectedKeyIds = state.selectedKeyId ? [state.selectedKeyId] : [];
  state.projectJsonDraft = JSON.stringify(state.project, null, 2);
  state.projectStatus = status;
  state.activeView = "keymap";
  state.projectDetailsOpen = false;
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

export function activeLightingProfile(currentProject: Project): LightingProfile {
  if (!currentProject.lightingProfiles?.length) {
    currentProject.lightingProfiles = [
      {
        id: "profile_default",
        name: "Default",
        mode: "static",
        perKey: {},
      },
    ];
  }

  return currentProject.lightingProfiles[0];
}

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

/**
 * UI effect names to the V5 Max's VIA RGB-matrix mode ids (from the board's
 * `via_json/v5_ansi_encoder.json`). Only the four names the UI exposes are
 * mapped; anything else leaves the device's current effect untouched.
 */
const RGB_MATRIX_EFFECT_IDS: Record<string, number> = {
  solid: 1,
  breathing: 2,
  cycle: 4,
  reactive: 18,
};

/** The device's current RGB-matrix effect id, or undefined if unavailable. */
function rgbMatrixEffectId(snapshot: EditorState["hardwareSnapshot"]): number | undefined {
  if (!isKeychronV5MaxSnapshot(snapshot) || snapshot.lighting.state !== "available") {
    return undefined;
  }
  return snapshot.lighting.value.effect;
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
