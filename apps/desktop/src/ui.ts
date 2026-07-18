/// <reference types="vite/client" />

import catalog from "../../../fixtures/catalog/keyboards.json";
import project from "../../../fixtures/projects/example-60.json";
import {
  layerAssignmentActions,
  layerKeycode,
  layerTapKeycode,
  modTapKeycode,
  modTapModifiers,
  parseAdvancedAssignment,
  suggestedLayerTarget,
  type AdvancedAssignment,
  type LayerAssignmentAction,
} from "./advancedAssignments";
import { createBuildPlan, type BuildPlan } from "./buildPlan";
import { loadLocalDoctorReport } from "./doctorReport";
import {
  buildReadinessLabel,
  exportQmkJson,
  type Assignment,
  type CommandStatus,
  type DetectedKeyboard,
  type DoctorReport,
  type KeyboardDefinition,
  type LightingProfile,
  type Project,
  type UiIssue,
  type VisualKey,
  validateProject,
} from "./domain";
import {
  buildSelectedKeyContext,
  type KeyLayerDetail,
  type KeyRelation,
  type KeyShortcut,
  type SelectedKeyContext,
} from "./keyDetails";
import { captureHostKey, type HostKeyCapture } from "./keyTester";
import { formatKeycap, keycodeCategories, kindForKeycode, type KeycodeEntry } from "./keycodes";
import {
  addTransparentLayer,
  canDeleteLayer,
  deleteLayer,
  duplicateLayer,
  renameLayer,
  scanLayerReferences,
} from "./layerActions";
import { lightingSystemsForKeyboard, supportedLightingSystems } from "./lightingCapabilities";
import { keychronV5MaxKeyboard, keychronV5MaxProject } from "./presets";
import { createProjectFromKeyboard } from "./projectFactory";
import {
  createMemoryProjectStorage,
  importProjectJson,
  type ProjectStorage,
  type ProjectSummary,
} from "./projectStorage";
import {
  appendSafetyEvent,
  createRecoveryBundle,
  createSafetyAssessment,
  createSafetyAuditReceipt,
  importSafetyAuditReceiptJson,
  importRecoveryBundleJson,
  mergeSafetyLedgers,
  recoveryBundleMatchesKeyboard,
  safetyAuditMatchesCurrent,
  serializeRecoveryBundle,
  serializeSafetyAuditReceipt,
  type SafetyAuditReceipt,
  type RecoveryBundle,
} from "./safety";
import {
  createMemorySafetyLedgerStorage,
  createSafetyLedgerStorage,
  type SafetyLedgerStorage,
} from "./safetyStorage";
import {
  selectKeychronV5MaxBrowserDevice,
  type KeychronV5MaxBrowserSelection,
} from "./devices/keychronV5MaxBrowser";

const fixtureKeyboard = catalog[0] as KeyboardDefinition;
const fixtureProject = project as Project;
const bundledKeyboards = [keychronV5MaxKeyboard, fixtureKeyboard];
const KEY_UNIT = 51;
const KEY_INSET = 6;

type AppView = "workspace" | "catalog" | "system";
type ContextPanel = "assignment" | "lighting" | "test";

type AppOptions = {
  keyboard?: KeyboardDefinition;
  project?: Project;
  projectStorage?: ProjectStorage;
  safetyLedgerStorage?: SafetyLedgerStorage;
  downloadRecoveryBundle?: (bundle: RecoveryBundle) => void;
  downloadSafetyAudit?: (receipt: SafetyAuditReceipt) => void;
  downloadQmkJson?: (output: unknown, project: Project) => void;
  selectKeychronV5MaxDevice?: () => Promise<KeychronV5MaxBrowserSelection>;
  now?: () => string;
  qmkDetected?: boolean;
  doctorReportLoader?: () => Promise<DoctorReport | null>;
};

type EditorState = {
  keyboard: KeyboardDefinition;
  project: Project;
  fallbackQmkDetected: boolean;
  qmkDetected: boolean;
  activeView: AppView;
  activeContextPanel: ContextPanel;
  diagnosticsOpen: boolean;
  selectedLayerIndex: number;
  selectedKeyId: string;
  keycodeCategoryId: string;
  keycodeSearch: string;
  catalogSearch: string;
  projectStorage: ProjectStorage;
  safetyLedgerStorage: SafetyLedgerStorage;
  downloadRecoveryBundle: (bundle: RecoveryBundle) => void;
  downloadSafetyAudit: (receipt: SafetyAuditReceipt) => void;
  downloadQmkJson: (output: unknown, project: Project) => void;
  selectKeychronV5MaxDevice: () => Promise<KeychronV5MaxBrowserSelection>;
  deviceSelection: DeviceSelectionState;
  now: () => string;
  pendingRecoveryBundle?: {
    bundle: RecoveryBundle;
    ledger: import("./safety").SafetyLedger;
    stage: "initial" | "final";
    projectRevision: string;
    deviceRevision: string;
  };
  pendingDecline?: {
    ledger: import("./safety").SafetyLedger;
    receipt: SafetyAuditReceipt;
    projectRevision: string;
    deviceRevision: string;
  };
  declineNoBackupConfirmed: boolean;
  declineResponsibilityConfirmed: boolean;
  projectStatus: string;
  projectJsonDraft: string;
  selectedSavedProjectId: string;
  testEvents: HostKeyCapture[];
  doctorReport?: DoctorReport;
  doctorStatus: "loading" | "ready" | "missing";
};

type DeviceSelectionState =
  | KeychronV5MaxBrowserSelection
  | { state: "idle" | "selecting" | "cancelled" };

export function createApp(root: HTMLElement, options: AppOptions = {}): void {
  const keyboard = structuredClone(options.keyboard ?? keychronV5MaxKeyboard ?? fixtureKeyboard);
  const currentProject = structuredClone(options.project ?? keychronV5MaxProject ?? fixtureProject);
  const projectStorage = options.projectStorage ?? createMemoryProjectStorage();
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
    activeView: "workspace",
    activeContextPanel: "assignment",
    diagnosticsOpen: false,
    selectedLayerIndex: defaultSelectedLayerIndex(currentProject),
    selectedKeyId: layout.keys[0]?.id ?? "",
    keycodeCategoryId: keycodeCategories[0]?.id ?? "basic",
    keycodeSearch: "",
    catalogSearch: "",
    projectStorage,
    safetyLedgerStorage,
    downloadRecoveryBundle: options.downloadRecoveryBundle ?? downloadRecoveryBundle,
    downloadSafetyAudit: options.downloadSafetyAudit ?? downloadSafetyAudit,
    downloadQmkJson: options.downloadQmkJson ?? downloadQmkJson,
    selectKeychronV5MaxDevice: options.selectKeychronV5MaxDevice ?? selectKeychronV5MaxBrowserDevice,
    deviceSelection: { state: "idle" },
    now: options.now ?? (() => new Date().toISOString()),
    declineNoBackupConfirmed: false,
    declineResponsibilityConfirmed: false,
    projectStatus: "Project is not saved in this preview session.",
    projectJsonDraft: JSON.stringify(currentProject, null, 2),
    selectedSavedProjectId: projectStorage.list()[0]?.id ?? "",
    testEvents: [],
    doctorStatus: "loading",
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

  const actions = createActions(root, state, requestDoctorReport);
  requestDoctorReport();
}

function createActions(
  root: HTMLElement,
  state: EditorState,
  requestDoctorReport: () => void,
) {
  const actions = {
    render: () => {
      const focusedInput = captureFocusedInput(root);
      const layout = selectedLayout(state.keyboard, state.project);
      const issues = validateProject(state.project, state.keyboard);
      const qmkJson = safeExportQmkJson(state.project, state.keyboard, issues);
      const buildPlan = createBuildPlan(state.project, issues, state.qmkDetected);

      root.replaceChildren(
        mainShell(state, layout, issues, qmkJson, buildPlan, {
          selectLayer: (nextLayerIndex) => {
            state.selectedLayerIndex = nextLayerIndex;
            actions.render();
          },
          selectView: (view) => {
            state.activeView = view;
            actions.render();
          },
          selectContextPanel: (panel) => {
            state.activeContextPanel = panel;
            actions.render();
          },
          openDiagnostics: () => {
            state.diagnosticsOpen = true;
            actions.render();
          },
          closeDiagnostics: () => {
            state.diagnosticsOpen = false;
            actions.render();
          },
          selectKey: (keyId) => {
            state.selectedKeyId = keyId;
            actions.render();
          },
          updateSelectedKeycode: (qmk) => {
            updateAssignment(state, qmk);
            actions.render();
          },
          updateSelectedLighting: (color) => {
            updateLighting(state, color);
            actions.render();
          },
          captureHostKey: (input) => {
            const capture = captureHostKey(state.project, state.selectedLayerIndex, input);
            state.testEvents = [capture, ...state.testEvents].slice(0, 12);
            state.selectedKeyId = capture.matchedKeyIds[0] ?? state.selectedKeyId;
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
          selectKeychronV5MaxDevice: () => {
            state.deviceSelection = { state: "selecting" };
            actions.render();
            state.selectKeychronV5MaxDevice().then(
              (selection) => {
                state.deviceSelection = selection;
                actions.render();
              },
              () => {
                state.deviceSelection = { state: "cancelled" };
                actions.render();
              },
            );
          },
          selectKeycodeCategory: (categoryId) => {
            state.keycodeCategoryId = categoryId;
            state.keycodeSearch = "";
            actions.render();
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
            state.catalogSearch = "";
            state.projectJsonDraft = JSON.stringify(state.project, null, 2);
            state.projectStatus = `Created ${state.project.name} from catalog.`;
            state.activeView = "workspace";
            state.activeContextPanel = "assignment";
            actions.render();
          },
          saveProject: () => {
            state.projectStorage.save(state.project);
            state.selectedSavedProjectId = state.project.id;
            state.projectStatus = `Saved ${state.project.name}`;
            state.projectJsonDraft = JSON.stringify(state.project, null, 2);
            actions.render();
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
              const imported = projectFromDraft(state.projectJsonDraft);
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
          createRecoveryBundle: () => {
            const createdAt = state.now();
            const bundle = createRecoveryBundle({
              project: state.project,
              keyboard: state.keyboard,
              ledger: state.safetyLedgerStorage.load(),
              createdAt,
            });
            try {
              state.downloadRecoveryBundle(bundle);
              const assessment = createSafetyAssessment(
                state.project,
                state.keyboard,
                validateProject(state.project, state.keyboard),
                state.safetyLedgerStorage.load(),
                state.safetyLedgerStorage.availability(),
              );
              state.pendingRecoveryBundle = {
                bundle,
                ledger: state.safetyLedgerStorage.load(),
                stage: "initial",
                projectRevision: assessment.projectRevision,
                deviceRevision: assessment.deviceRevision,
              };
              state.declineNoBackupConfirmed = false;
              state.declineResponsibilityConfirmed = false;
              state.projectStatus = `Recovery export started for ${state.project.name}. Confirm that you saved the file.`;
            } catch (error) {
              state.projectStatus = `Recovery export failed: ${error instanceof Error ? error.message : "Unknown error"}.`;
            }
            actions.render();
          },
          confirmRecoveryBundle: () => {
            const issues = validateProject(state.project, state.keyboard);
            const assessment = createSafetyAssessment(
              state.project,
              state.keyboard,
              issues,
              state.safetyLedgerStorage.load(),
              state.safetyLedgerStorage.availability(),
            );
            const pending = state.pendingRecoveryBundle;
            if (
              !pending ||
              pending.projectRevision !== assessment.projectRevision ||
              pending.deviceRevision !== assessment.deviceRevision
            ) {
              state.projectStatus = "Export a recovery bundle for the current project and device state first.";
              actions.render();
              return;
            }
            try {
              if (pending.stage === "initial") {
                const ledger = appendSafetyEvent(
                  state.safetyLedgerStorage.load(),
                  "backupConfirmed",
                  state.project,
                  state.keyboard,
                  state.now(),
                );
                const bundle = createRecoveryBundle({
                  project: state.project,
                  keyboard: state.keyboard,
                  ledger,
                  createdAt: state.now(),
                });
                state.downloadRecoveryBundle(bundle);
                state.pendingRecoveryBundle = { ...pending, bundle, ledger, stage: "final" };
                state.projectStatus = "Final recovery record export started. Confirm that you saved this updated file.";
              } else {
                state.safetyLedgerStorage.save(pending.ledger);
                state.pendingRecoveryBundle = undefined;
                state.projectStatus = `Recorded saved recovery bundle for ${state.project.name}.`;
              }
            } catch (error) {
              state.projectStatus = `Recovery confirmation failed: ${error instanceof Error ? error.message : "Unknown error"}.`;
            }
            actions.render();
          },
          updateBackupDeclineConfirmation: (field, checked) => {
            if (field === "noBackup") {
              state.declineNoBackupConfirmed = checked;
            } else {
              state.declineResponsibilityConfirmed = checked;
            }
          },
          declineRecoveryBundle: () => {
            if (!state.declineNoBackupConfirmed || !state.declineResponsibilityConfirmed) {
              state.projectStatus = "Both decline confirmations are required.";
              actions.render();
              return;
            }
            const assessment = createSafetyAssessment(
              state.project,
              state.keyboard,
              validateProject(state.project, state.keyboard),
              state.safetyLedgerStorage.load(),
              state.safetyLedgerStorage.availability(),
            );
            if (assessment.state !== "backupRequired") {
              state.projectStatus = "Re-check the current project and device state before recording a backup decline.";
              actions.render();
              return;
            }
            const ledger = appendSafetyEvent(
              state.safetyLedgerStorage.load(),
              "backupDeclined",
              state.project,
              state.keyboard,
              state.now(),
            );
            const event = ledger.events.at(-1);
            if (!event) {
              state.projectStatus = "Backup decline could not be recorded.";
              actions.render();
              return;
            }
            try {
              const receipt = createSafetyAuditReceipt({
                project: state.project,
                keyboard: state.keyboard,
                event,
              });
              state.downloadSafetyAudit(receipt);
              state.pendingDecline = {
                ledger,
                receipt,
                projectRevision: assessment.projectRevision,
                deviceRevision: assessment.deviceRevision,
              };
              state.projectStatus = "Safety audit export started. Confirm that you saved the audit receipt.";
            } catch (error) {
              state.projectStatus = `Backup decline could not be recorded: ${error instanceof Error ? error.message : "Unknown error"}.`;
            }
            actions.render();
          },
          confirmDeclineAudit: () => {
            try {
              const pending = state.pendingDecline;
              if (!pending) {
                throw new Error("No safety audit export is awaiting confirmation");
              }
              const assessment = createSafetyAssessment(
                state.project,
                state.keyboard,
                validateProject(state.project, state.keyboard),
                state.safetyLedgerStorage.load(),
                state.safetyLedgerStorage.availability(),
              );
              if (
                pending.projectRevision !== assessment.projectRevision ||
                pending.deviceRevision !== assessment.deviceRevision
              ) {
                throw new Error("The project or catalog definition changed after the audit export");
              }
              state.safetyLedgerStorage.save(pending.ledger);
              state.pendingDecline = undefined;
              state.projectStatus = "Recovery data declined for the current project and device state.";
            } catch (error) {
              state.projectStatus = `Backup decline could not be recorded: ${error instanceof Error ? error.message : "Unknown error"}.`;
            }
            actions.render();
          },
          updateSelectedLayerName: (name) => {
            renameLayer(state.project, state.selectedLayerIndex, name);
            actions.render();
          },
          updateLightingMode: (mode) => {
            activeLightingProfile(state.project).mode = mode;
            actions.render();
          },
          updateLightingGlobal: (key, value) => {
            updateLightingGlobal(state.project, key, value);
            actions.render();
          },
          addLayer: () => {
            const layer = addTransparentLayer(state.project, layout.keys);
            if (layer) {
              state.selectedLayerIndex = layer.index;
            }
            actions.render();
          },
          duplicateSelectedLayer: () => {
            const layer = duplicateLayer(state.project, state.selectedLayerIndex, layout.keys);
            if (layer) {
              state.selectedLayerIndex = layer.index;
            }
            actions.render();
          },
          deleteSelectedLayer: () => {
            const result = deleteLayer(state.project, state.selectedLayerIndex);
            if (result.deleted) {
              state.selectedLayerIndex = state.project.layers.at(-1)?.index ?? 0;
            }
            actions.render();
          },
          reloadProbe: () => {
            requestDoctorReport();
          },
        }),
      );
      restoreFocusedInput(root, focusedInput);
    },
  };

  return actions;
}

type RenderActions = {
  selectLayer: (layerIndex: number) => void;
  selectView: (view: AppView) => void;
  selectContextPanel: (panel: ContextPanel) => void;
  openDiagnostics: () => void;
  closeDiagnostics: () => void;
  selectKey: (keyId: string) => void;
  updateSelectedKeycode: (qmk: string) => void;
  updateSelectedLighting: (color: string) => void;
  captureHostKey: (input: { code: string; key: string }) => void;
  downloadQmkJson: () => void;
  selectKeychronV5MaxDevice: () => void;
  selectKeycodeCategory: (categoryId: string) => void;
  updateKeycodeSearch: (query: string) => void;
  updateCatalogSearch: (query: string) => void;
  selectKeyboardFromCatalog: (keyboardId: string) => void;
  saveProject: () => void;
  selectSavedProject: (projectId: string) => void;
  openSavedProject: () => void;
  updateProjectJsonDraft: (json: string) => void;
  importProjectDraft: () => void;
  createRecoveryBundle: () => void;
  confirmRecoveryBundle: () => void;
  updateBackupDeclineConfirmation: (field: "noBackup" | "responsibility", checked: boolean) => void;
  declineRecoveryBundle: () => void;
  confirmDeclineAudit: () => void;
  updateSelectedLayerName: (name: string) => void;
  updateLightingMode: (mode: LightingProfile["mode"]) => void;
  updateLightingGlobal: (key: string, value: string | number | boolean) => void;
  addLayer: () => void;
  duplicateSelectedLayer: () => void;
  deleteSelectedLayer: () => void;
  reloadProbe: () => void;
};

function mainShell(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  qmkJson: unknown,
  buildPlan: BuildPlan,
  actions: RenderActions,
): HTMLElement {
  return element("main", { className: "shell" }, [
    rail(state.activeView, actions.selectView),
    element("section", { className: "workspace" }, [
      topbar(state, issues, buildPlan, actions),
      detectionStrip(state, actions.reloadProbe),
      activePanel(state, layout, issues, qmkJson, actions),
      diagnosticsDrawer(state, layout, issues, qmkJson, buildPlan, actions),
    ]),
  ]);
}

function rail(activeView: AppView, selectView: (view: AppView) => void): HTMLElement {
  const views: Array<{ id: AppView; label: string }> = [
    { id: "workspace", label: "Workspace" },
    { id: "catalog", label: "Catalog" },
    { id: "system", label: "System" },
  ];
  const nav = element("nav");
  views.forEach((view) => {
    const selected = view.id === activeView;
    const button = uiButton({
      className: `nav-item ${selected ? "active" : ""}`,
      text: view.label,
      type: "button",
      attrs: {
        "aria-current": selected ? "page" : "false",
        "data-view": view.id,
      },
    });
    button.addEventListener("click", () => selectView(view.id));
    nav.append(button);
  });

  return element("aside", { className: "rail" }, [
    element("div", { className: "brand" }, [
      element("span", { className: "mark", text: "Q" }),
      element("div", {}, [
        element("strong", { text: "QMKUI" }),
        element("small", { text: "Preview" }),
      ]),
    ]),
    nav,
  ]);
}

function topbar(
  state: EditorState,
  issues: UiIssue[],
  buildPlan: BuildPlan,
  actions: RenderActions,
): HTMLElement {
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const statusClass = hasErrors ? "blocked" : "ready";
  const save = uiButton({
    className: "secondary-action",
    text: "Save project",
    attrs: { "data-project-action": "save" },
  });
  save.addEventListener("click", actions.saveProject);

  const diagnostics = uiButton({
    className: "secondary-action",
    text: "Project details",
    attrs: { "data-diagnostics-action": "open" },
  });
  diagnostics.addEventListener("click", actions.openDiagnostics);

  return element("header", { className: "topbar" }, [
    element("div", {}, [
      element("p", { className: "eyebrow", text: state.keyboard.displayName }),
      element("h1", { text: state.project.name }),
    ]),
    element("div", { className: "topbar-actions" }, [
      save,
      diagnostics,
      element("div", {
        className: `status ${statusClass}`,
        text: topbarStatusLabel(issues, buildPlan),
      }),
    ]),
  ]);
}

function topbarStatusLabel(issues: UiIssue[], buildPlan: BuildPlan): string {
  if (issues.some((issue) => issue.severity === "error")) {
    return "Fix keymap issues";
  }
  return "Keymap valid";
}

function activePanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  qmkJson: unknown,
  actions: RenderActions,
): HTMLElement {
  if (state.activeView === "catalog") {
    return catalogPanel(state, actions);
  }
  if (state.activeView === "system") {
    return systemPanel(state, actions.reloadProbe);
  }

  return element("div", {
    className: "view-stack",
    attrs: {
      "data-panel": "workspace",
    },
  }, [
    editor(state, layout, issues, actions),
  ]);
}

function detectionStrip(state: EditorState, reloadProbe: () => void): HTMLElement {
  const detected = state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
  const keyboardName = detected?.displayName ?? state.keyboard.displayName;
  const deviceId = detected ? `${detected.device.vid}:${detected.device.pid}` : "Preset";
  const statusText =
    state.doctorStatus === "loading"
      ? "Checking"
      : state.doctorStatus === "missing"
        ? "Unavailable"
        : deviceId;

  const refresh = uiButton({ className: "secondary-action", text: "Refresh", type: "button" });
  refresh.addEventListener("click", reloadProbe);

  return element("section", { className: "probe-strip" }, [
    element("div", {}, [
      element("h2", { text: "Keyboard" }),
      element("p", {
        text: keyboardName,
      }),
    ]),
    element("div", { className: "probe-meta" }, [
      element("strong", { text: statusText }),
      refresh,
    ]),
  ]);
}

function editor(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  actions: RenderActions,
): HTMLElement {
  return element("section", {
    className: "editor workbench-editor",
    attrs: { "data-workbench-surface": "true" },
  }, [
    editorWorkflow(state, issues, actions),
    keyboardWorkspace(state, layout, actions),
  ]);
}

function editorWorkflow(
  state: EditorState,
  issues: UiIssue[],
  actions: RenderActions,
): HTMLElement {
  const invalid = issues.some((issue) => issue.severity === "error");
  const download = uiButton({
    className: "secondary-action",
    text: "Download QMK JSON",
    type: "button",
    attrs: {
      "data-qmk-action": "download",
      ...(invalid ? { disabled: "", title: "Resolve keymap validation errors first" } : {}),
    },
  });
  download.addEventListener("click", actions.downloadQmkJson);
  const connect = uiButton({
    className: "secondary-action",
    text:
      state.deviceSelection.state === "selecting"
        ? "Identifying Keychron V5 Max..."
        : "Identify Keychron V5 Max",
    type: "button",
    attrs: {
      "data-device-action": "connect",
      ...(state.deviceSelection.state === "selecting" ? { disabled: "" } : {}),
    },
  });
  connect.addEventListener("click", actions.selectKeychronV5MaxDevice);
  return element("section", {
    className: "editor-workflow",
    attrs: { "data-editor-workflow": "true" },
  }, [
    element("p", { text: "Edit the keymap, validate it, then download QMK JSON for your local build workflow." }),
    download,
    connect,
    ...(invalid
      ? [element("small", { text: "Resolve keymap validation errors before downloading QMK JSON." })]
      : []),
    element("small", {
      attrs: { "data-device-state": "true" },
      text: deviceSelectionLabel(state.deviceSelection),
    }),
  ]);
}

function deviceSelectionLabel(selection: DeviceSelectionState): string {
  if (selection.state === "idle") {
    return "Select the wired Keychron V5 Max ANSI Knob to identify it. The app does not open it or grant configuration access.";
  }
  if (selection.state === "selecting") {
    return "Choose the exact Keychron V5 Max ANSI Knob in the browser prompt.";
  }
  if (selection.state === "cancelled") {
    return "Keychron chooser was cancelled or did not complete. Try again when you are ready.";
  }
  if (selection.state === "unavailable") {
    return "This browser cannot show the Keychron chooser. Use Chrome, Edge, or Opera.";
  }
  if (selection.state === "no-selection") {
    return "No device selected.";
  }
  if ("contract" in selection) {
    if (selection.contract.state === "unsupported") {
      return "Selected device does not match the Keychron V5 Max ANSI Knob.";
    }
    return "Keychron V5 Max ANSI Knob recognized. The app does not open it or grant configuration access.";
  }
  return "No device selected.";
}

function keyboardWorkspace(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const bounds = layoutBounds(layout.keys);
  const boardWidth = bounds.width * KEY_UNIT;
  const boardHeight = bounds.height * KEY_UNIT;
  const boardPixelWidth = `${boardWidth}px`;
  const boardPixelHeight = `${boardHeight}px`;
  const canvas = element("div", {
    className: "keyboard-scroll",
    attrs: { "data-keyboard-canvas": "true" },
  }, [
    board(state, layout, actions.selectKey),
  ]);
  canvas.style.width = boardPixelWidth;
  canvas.style.height = boardPixelHeight;
  const stage = element("section", {
    className: "keyboard-stage",
    attrs: { "data-keyboard-stage": "true" },
  }, [
    canvas,
    selectedKeyInfoPanel(state, layout),
  ]);
  stage.style.setProperty("--keyboard-board-width", boardPixelWidth);
  stage.style.setProperty("--keyboard-board-height", boardPixelHeight);
  stage.style.width = "100%";
  stage.style.maxHeight = `calc(${boardPixelHeight} + var(--keyboard-canvas-pad-y))`;

  return element("section", {
    className: "keyboard-workspace",
    attrs: { "data-keyboard-workspace": "true" },
  }, [
    stage,
    workspaceControls(state, layout, actions),
  ]);
}

function selectedKeyInfoPanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
): HTMLElement {
  const context = buildSelectedKeyContext(
    state.project,
    layout.keys,
    state.selectedLayerIndex,
    state.selectedKeyId,
  );
  const fallbackKey = layout.keys[0];

  return element("aside", {
    className: "key-info-panel",
    attrs: {
      "aria-label": "Selected key information",
      "data-key-info-panel": "true",
    },
  }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Selected key" }),
      element("small", { text: context?.selectedAssignment?.label ?? fallbackKey.label ?? fallbackKey.id }),
    ]),
    context
      ? selectedKeySummary(context)
      : element("dl", {}, selectedKeyRows(fallbackKey, currentLayer(state))),
    context ? selectedKeyDetails(context) : element("div"),
  ]);
}

function workspaceControls(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  return element("section", {
    className: "workspace-controls",
    attrs: { "data-workspace-controls": "true" },
  }, [
    settingsGroup("layers", "Layers", [
      layerStrip(state, actions),
    ]),
    settingsGroup("selection", "Selection", [
      combinedWorkspacePanel(state, layout, actions),
    ]),
  ]);
}

function settingsGroup(id: string, label: string, children: Array<Node | string>): HTMLElement {
  return element("section", {
    className: "settings-group",
    attrs: { "data-settings-group": id },
  }, [
    element("h3", { className: "settings-group-title", text: label }),
    ...children,
  ]);
}

function combinedWorkspacePanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const activeSection = contextPanelSection(state.activeContextPanel, state, layout, actions);
  activeSection.setAttribute("id", `context-panel-${state.activeContextPanel}`);
  activeSection.setAttribute("role", "tabpanel");
  activeSection.setAttribute("aria-labelledby", `context-tab-${state.activeContextPanel}`);

  return element("section", {
    className: "context-dock",
    attrs: { "data-context-slot": "true", "data-context-dock": "true" },
  }, [
    contextTabs(state.activeContextPanel, actions),
    activeSection,
  ]);
}

function contextTabs(activePanel: ContextPanel, actions: RenderActions): HTMLElement {
  const tabs = element("div", {
    className: "context-tabs",
    attrs: { "aria-label": "Workspace tools", role: "tablist" },
  });
  const panels: Array<{ id: ContextPanel; label: string }> = [
    { id: "assignment", label: "Assignment" },
    { id: "lighting", label: "Lighting" },
    { id: "test", label: "Host key test" },
  ];

  panels.forEach((panel, position) => {
    const selected = panel.id === activePanel;
    const tab = uiButton({
      className: `context-tab ${selected ? "active" : ""}`,
      text: panel.label,
      type: "button",
      attrs: {
        "aria-controls": `context-panel-${panel.id}`,
        "aria-selected": String(selected),
        "data-context-tab": panel.id,
        id: `context-tab-${panel.id}`,
        role: "tab",
        tabindex: selected ? "0" : "-1",
      },
    });
    tab.addEventListener("click", () => actions.selectContextPanel(panel.id));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const nextPanel = nextContextPanel(panels.map((item) => item.id), position, event.key);
      actions.selectContextPanel(nextPanel);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`#context-tab-${nextPanel}`)?.focus();
      });
    });
    tabs.append(tab);
  });

  return tabs;
}

function contextPanelSection(
  panel: ContextPanel,
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  if (panel === "lighting") {
    return lightingPanel(state, layout, actions);
  }
  if (panel === "test") {
    return testPanel(state, layout, actions);
  }
  return inspector(state, layout, actions);
}

function projectPanel(
  state: EditorState,
  actions: RenderActions,
  issues: UiIssue[],
): HTMLElement {
  const savedProjects = state.projectStorage.list();
  if (!state.selectedSavedProjectId && savedProjects[0]) {
    state.selectedSavedProjectId = savedProjects[0].id;
  }

  const savedSelect = element("select", {
    attrs: {
      "aria-label": "Saved projects",
      "data-focus-id": "saved-project-select",
    },
  });
  if (savedProjects.length === 0) {
    savedSelect.append(element("option", { text: "No saved projects", attrs: { value: "" } }));
  } else {
    savedProjects.forEach((project) => {
      savedSelect.append(
        element("option", {
          text: `${project.name} - ${project.qmkKeyboard}`,
          attrs: { value: project.id },
        }),
      );
    });
  }
  savedSelect.value = state.selectedSavedProjectId;
  savedSelect.addEventListener("change", () => {
    actions.selectSavedProject(savedSelect.value);
  });

  const projectDraft = element("textarea", {
    attrs: {
      "aria-label": "Project JSON draft",
      "data-focus-id": "project-json-draft",
      spellcheck: "false",
    },
    text: state.projectJsonDraft,
  });
  projectDraft.addEventListener("input", () => {
    actions.updateProjectJsonDraft(projectDraft.value);
  });

  const save = uiButton({
    className: "secondary-action",
    text: "Save current",
    type: "button",
    attrs: { "data-project-action": "save" },
  });
  save.addEventListener("click", actions.saveProject);

  const open = uiButton({
    className: "secondary-action",
    text: "Open selected",
    type: "button",
    attrs: { "data-project-action": "open" },
  });
  open.addEventListener("click", actions.openSavedProject);

  const refreshDraft = uiButton({
    className: "secondary-action",
    text: "Refresh draft",
    type: "button",
    attrs: { "data-project-action": "refresh-draft" },
  });
  refreshDraft.addEventListener("click", () => {
    actions.updateProjectJsonDraft(JSON.stringify(state.project, null, 2));
  });

  const importDraft = uiButton({
    className: "secondary-action",
    text: "Import draft",
    type: "button",
    attrs: { "data-project-action": "import" },
  });
  importDraft.addEventListener("click", actions.importProjectDraft);

  return element("section", { className: "drawer-section project-panel", attrs: { "data-drawer-section": "project" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Project" }),
      element("small", { text: `${savedProjects.length} saved in preview session` }),
    ]),
    element("div", { className: "project-layout" }, [
      element("section", { className: "project-card" }, [
        element("h3", { text: "Current project" }),
        definitionList([
          ["Name", state.project.name],
          ["Keyboard", state.project.target.qmkKeyboard],
          ["Layout", state.project.target.qmkLayoutMacro],
          ["Layers", String(state.project.layers.length)],
        ]),
        element("p", {
          className: "project-status muted",
          text: state.projectStatus,
          attrs: { "data-project-status": "true" },
        }),
        element("div", { className: "project-actions" }, [save, refreshDraft]),
      ]),
      element("section", { className: "project-card" }, [
        element("h3", { text: "Saved projects" }),
        savedSelect,
        savedProjectList(savedProjects),
        element("div", { className: "project-actions" }, [open]),
      ]),
      element("section", { className: "project-card project-json" }, [
        element("h3", { text: "Project JSON" }),
        projectDraft,
        element("div", { className: "project-actions" }, [importDraft]),
      ]),
      safetyRecoveryPanel(state, issues, actions),
    ]),
  ]);
}

function safetyRecoveryPanel(
  state: EditorState,
  issues: UiIssue[],
  actions: RenderActions,
): HTMLElement {
  const assessment = createSafetyAssessment(
    state.project,
    state.keyboard,
    issues,
    state.safetyLedgerStorage.load(),
    state.safetyLedgerStorage.availability(),
  );
  const status = safetyStatusLabel(assessment.state);
  const pendingRecoveryMatchesCurrent =
    state.pendingRecoveryBundle?.projectRevision === assessment.projectRevision &&
    state.pendingRecoveryBundle.deviceRevision === assessment.deviceRevision;
  const pendingDeclineMatchesCurrent =
    state.pendingDecline?.projectRevision === assessment.projectRevision &&
    state.pendingDecline.deviceRevision === assessment.deviceRevision;
  const card = element("section", {
    className: "project-card safety-recovery",
    attrs: { "data-safety-panel": "true" },
  }, [
    element("h3", { text: "Safety & recovery" }),
    element("p", {
      className: "project-status muted",
      text: status,
      attrs: { "data-safety-status": "true" },
    }),
    element("p", { className: "muted", text: assessment.reason }),
  ]);

  if (
    assessment.state === "backupRequired" &&
    !pendingRecoveryMatchesCurrent &&
    !pendingDeclineMatchesCurrent
  ) {
    const backup = uiButton({
      className: "secondary-action",
      text: "Download recovery bundle",
      type: "button",
      attrs: { "data-safety-action": "backup" },
    });
    backup.addEventListener("click", actions.createRecoveryBundle);
    card.append(
      element("p", {
        className: "muted",
        text: "This local JSON file restores the project without a connected keyboard. Keep it with any official recovery firmware for this exact device.",
        attrs: { "data-safety-recovery-guidance": "true" },
      }),
      element("div", { className: "project-actions" }, [backup]),
    );
  }

  if (pendingRecoveryMatchesCurrent && assessment.state === "backupRequired") {
    const confirm = uiButton({
      className: "secondary-action",
      text:
        state.pendingRecoveryBundle?.stage === "initial"
          ? "Confirm saved recovery bundle"
          : "Confirm saved final recovery record",
      type: "button",
      attrs: { "data-safety-action": "confirm-backup" },
    });
    confirm.addEventListener("click", actions.confirmRecoveryBundle);
    card.append(
      element("p", {
        className: "muted",
        text: "Confirm only after the downloaded file is present in a location you control.",
        attrs: { "data-safety-recovery-guidance": "true" },
      }),
      element("div", { className: "project-actions" }, [confirm]),
    );
  }

  if (assessment.state === "backupRequired" && pendingDeclineMatchesCurrent) {
    const confirm = uiButton({
      className: "secondary-action danger",
      text: "Confirm saved decline audit",
      type: "button",
      attrs: { "data-safety-action": "confirm-decline-audit" },
    });
    confirm.addEventListener("click", actions.confirmDeclineAudit);
    card.append(
      element("p", {
        className: "muted",
        text: "Confirm only after the local safety-audit receipt is saved in a location you control.",
        attrs: { "data-safety-recovery-guidance": "true" },
      }),
      element("div", { className: "project-actions" }, [confirm]),
    );
  }

  if (
    assessment.state === "backupRequired" &&
    !pendingRecoveryMatchesCurrent &&
    !pendingDeclineMatchesCurrent
  ) {
    const noBackup = safetyConfirmation(
      "no-backup",
      "I choose not to create recovery data for this exact project and device state.",
      state.declineNoBackupConfirmed,
      (checked) => actions.updateBackupDeclineConfirmation("noBackup", checked),
    );
    const responsibility = safetyConfirmation(
      "responsibility",
      "I understand QMKUI will not provide recovery guidance for this run.",
      state.declineResponsibilityConfirmed,
      (checked) => actions.updateBackupDeclineConfirmation("responsibility", checked),
    );
    const decline = uiButton({
      className: "secondary-action danger",
      text: "Record backup decline",
      type: "button",
      attrs: { "data-safety-action": "decline" },
    });
    decline.addEventListener("click", actions.declineRecoveryBundle);
    card.append(noBackup, responsibility, element("div", { className: "project-actions" }, [decline]));
  }

  card.append(
    element("div", { className: "safety-write-gate", attrs: { "data-safety-write-gate": "true" } }, [
      element("h4", { text: "Device write" }),
      element("p", {
        className: "muted",
        text: assessment.requiresRunConfirmation
          ? "Unavailable. A future exact-device write adapter must still require a fresh confirmation for this run."
          : "Unavailable. QMKUI has no exact-device compile, bootloader, or flash adapter yet.",
      }),
    ]),
  );
  return card;
}

function safetyConfirmation(
  id: "no-backup" | "responsibility",
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const input = element("input", {
    attrs: {
      type: "checkbox",
      "data-safety-confirmation": id,
    },
  }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return element("label", { className: "safety-confirmation" }, [input, document.createTextNode(label)]);
}

function safetyStatusLabel(state: ReturnType<typeof createSafetyAssessment>["state"]): string {
  switch (state) {
    case "blocked":
      return "Safety checks blocked";
    case "backupRecorded":
      return "Backup recorded";
    case "declined":
      return "Backup declined";
    default:
      return "Backup required";
  }
}

function savedProjectList(projects: ProjectSummary[]): HTMLElement {
  const list = element("div", {
    className: "saved-projects",
    attrs: { "data-saved-project-count": String(projects.length) },
  });
  if (projects.length === 0) {
    list.append(element("p", { className: "empty muted", text: "Save the current project first." }));
    return list;
  }

  projects.forEach((project) => {
    list.append(
      element("article", { className: "saved-project", attrs: { "data-saved-project": project.id } }, [
        element("strong", { text: project.name }),
        element("small", { text: `${project.qmkKeyboard} - ${project.updatedAt}` }),
      ]),
    );
  });
  return list;
}

function diagnosticsDrawer(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  qmkJson: unknown,
  buildPlan: BuildPlan,
  actions: RenderActions,
): HTMLElement {
  const drawer = element("wa-drawer", {
    className: "diagnostics-drawer",
    attrs: {
      "data-diagnostics-drawer": "true",
      label: "Diagnostics",
      placement: "end",
    },
  });
  if (state.diagnosticsOpen) {
    drawer.setAttribute("open", "");
    (drawer as HTMLElement & { open: boolean }).open = true;
  } else {
    drawer.hidden = true;
    (drawer as HTMLElement & { open: boolean }).open = false;
  }

  const close = uiButton({
    className: "secondary-action",
    text: "Close",
    attrs: { "data-diagnostics-action": "close", slot: "footer" },
  });
  close.addEventListener("click", actions.closeDiagnostics);

  drawer.append(
    projectPanel(state, actions, issues),
    element("section", { className: "drawer-section" }, [
      buildSection(buildPlan, layout.keys.length),
    ]),
    details(issues, qmkJson, state),
    close,
  );

  return drawer;
}

function lightingPanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const profile = activeLightingProfile(state.project);
  const lightingSystems = lightingSystemsForKeyboard(state.keyboard);
  const supportedSystems = supportedLightingSystems(state.keyboard);
  const context = buildSelectedKeyContext(
    state.project,
    layout.keys,
    state.selectedLayerIndex,
    state.selectedKeyId,
  );
  const modeButtons = element("div", {
    className: "segmented",
    attrs: { "aria-label": "Lighting mode" },
  });
  (["reactive", "static", "off"] as const).forEach((mode) => {
    const selected = profile.mode === mode;
    const button = uiButton({
      className: `segment ${selected ? "active" : ""}`,
      text: modeLabel(mode),
      type: "button",
      attrs: {
        "aria-pressed": String(selected),
        "data-lighting-mode": mode,
      },
    });
    button.addEventListener("click", () => actions.updateLightingMode(mode));
    modeButtons.append(button);
  });

  const color = profile.perKey[state.selectedKeyId] ?? "#5fb99a";
  const colorInput = element("input", {
    attrs: {
      "aria-label": "Selected key color",
      "data-focus-id": "selected-lighting-color",
      type: "color",
      value: color,
    },
  });
  colorInput.addEventListener("input", () => {
    actions.updateSelectedLighting(colorInput.value);
  });

  return element("section", { className: "context-section lighting-panel", attrs: { "data-context-section": "lighting" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Lighting" }),
      element("small", { text: profile.name }),
    ]),
    modeButtons,
    element("div", { className: "lighting-quick-row" }, [
      fieldControl("Selected color", colorInput),
      definitionList([
        ["Mapped keys", String(Object.keys(profile.perKey).length)],
        ["Conditions", String(profile.conditions?.length ?? 0)],
      ]),
    ]),
    element("div", { className: "context-disclosures" }, [
      contextDisclosure("Lighting capabilities", "lighting-capabilities", [
        lightingCapabilityList(lightingSystems),
      ]),
      contextDisclosure("RGB Matrix", "rgb-matrix", [
        supportedSystems.some((system) => system.id === "rgbMatrix")
          ? rgbMatrixControls(profile, actions)
          : element("p", { className: "empty muted", text: "Not supported" }),
      ]),
      contextDisclosure("Selected key lighting", "selected-key-lighting", [
        context ? keyLightingDetails(context) : element("div"),
      ]),
    ]),
  ]);
}

function lightingCapabilityList(
  systems: ReturnType<typeof lightingSystemsForKeyboard>,
): HTMLElement {
  const list = element("div", { className: "lighting-systems" });
  systems.forEach((system) => {
    list.append(
      element(
        "div",
        {
          className: `lighting-system ${system.capability.support}`,
          attrs: {
            "data-lighting-system": system.id,
            "data-support": system.capability.support,
          },
        },
        [
          element("strong", { text: system.label }),
          element("small", { text: supportLabel(system.capability.support) }),
        ],
      ),
    );
  });
  return list;
}

function rgbMatrixControls(profile: LightingProfile, actions: RenderActions): HTMLElement {
  const global = profile.global ?? {};
  const brightness = Number(global.brightness ?? 180);
  const speed = Number(global.speed ?? 128);
  const effect = String(global.effect ?? "solid");
  const effectSelect = element("select", {
    attrs: {
      "aria-label": "RGB Matrix effect",
      "data-focus-id": "lighting-effect",
      "data-lighting-control": "effect",
    },
  });
  [
    ["solid", "Solid"],
    ["breathing", "Breathing"],
    ["reactive", "Reactive"],
    ["cycle", "Cycle"],
  ].forEach(([value, label]) => {
    effectSelect.append(element("option", { text: label, attrs: { value } }));
  });
  effectSelect.value = effect;
  effectSelect.addEventListener("change", () => {
    actions.updateLightingGlobal("effect", effectSelect.value);
  });

  const brightnessInput = rangeInput("Brightness", "brightness", brightness);
  brightnessInput.addEventListener("input", () => {
    actions.updateLightingGlobal("brightness", Number(brightnessInput.value));
  });

  const speedInput = rangeInput("Speed", "speed", speed);
  speedInput.addEventListener("input", () => {
    actions.updateLightingGlobal("speed", Number(speedInput.value));
  });

  return element("section", { className: "lighting-controls" }, [
    element("h3", { text: "RGB Matrix" }),
    fieldControl("Effect", effectSelect),
    fieldControl("Brightness", brightnessInput),
    fieldControl("Speed", speedInput),
  ]);
}

function rangeInput(label: string, key: string, value: number): HTMLInputElement {
  return element("input", {
    attrs: {
      "aria-label": label,
      "data-focus-id": `lighting-${key}`,
      "data-lighting-control": key,
      max: "255",
      min: "0",
      type: "range",
      value: String(value),
    },
  });
}

function testPanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const last = state.testEvents[0];
  const captureArea = element(
    "section",
    {
      className: "test-capture",
      attrs: {
        "aria-label": "Key tester capture area",
        "data-test-capture": "true",
        "data-focus-id": "test-capture",
        tabindex: "0",
      },
    },
    [
      element("h2", { text: "Host key test" }),
      element("p", {
        text: "Focus this area and press a key on this computer. QMKUI does not read from the keyboard.",
      }),
      definitionList([
        ["Layer", String(state.selectedLayerIndex)],
        ["Host", last ? `${last.code}` : ""],
        ["QMK", last?.qmk ?? ""],
        ["Matches", String(last?.matchedKeyIds.length ?? 0)],
      ]),
    ],
  );
  captureArea.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      return;
    }
    event.preventDefault();
    actions.captureHostKey({ code: event.code, key: event.key });
  });

  return element("section", { className: "context-section test-panel", attrs: { "data-context-section": "test" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Host key test" }),
      element("small", {
        text: last?.qmk ?? "",
        attrs: {
          "data-host-qmk": last?.qmk ?? "",
          "data-test-match-count": String(last?.matchedKeyIds.length ?? 0),
        },
      }),
    ]),
    captureArea,
    contextDisclosure("Captured events", "test-events", [
      testEventList(state.testEvents),
    ]),
  ]);
}

function testEventList(events: HostKeyCapture[]): HTMLElement {
  const list = element("div", { className: "test-events", attrs: { "data-test-events": String(events.length) } });
  events.forEach((event) => {
    list.append(
      element("div", {
        className: "test-event",
        attrs: {
          "data-event-code": event.code,
          "data-event-qmk": event.qmk,
        },
      }, [
        element("strong", { text: event.qmk }),
        element("small", { text: event.code }),
      ]),
    );
  });
  if (events.length === 0) {
    list.append(element("p", { className: "empty muted", text: "Focus and press a key" }));
  }
  return list;
}

function catalogPanel(state: EditorState, actions: RenderActions): HTMLElement {
  const searchInput = element("input", {
    attrs: {
      "aria-label": "Search catalog",
      "data-focus-id": "catalog-search",
      placeholder: "Search",
      value: state.catalogSearch,
    },
  });
  searchInput.addEventListener("input", () => {
    actions.updateCatalogSearch(searchInput.value);
  });

  const results = filteredCatalog(state.catalogSearch);
  const list = element("div", { className: "catalog-list", attrs: { "data-catalog-results": String(results.length) } });
  results.forEach((keyboard) => {
    list.append(catalogRow(keyboard, state, actions.selectKeyboardFromCatalog));
  });
  if (results.length === 0) {
    list.append(element("p", { className: "empty muted", text: "No matches" }));
  }

  return element("section", { className: "tab-panel catalog-panel", attrs: { "data-panel": "catalog" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Catalog" }),
      element("small", { text: `${bundledKeyboards.length} bundled keyboards` }),
    ]),
    searchInput,
    list,
  ]);
}

function catalogRow(
  keyboard: KeyboardDefinition,
  state: EditorState,
  selectKeyboard: (keyboardId: string) => void,
): HTMLElement {
  const active = keyboard.id === state.keyboard.id;
  const detected = detectedKeyboard(state);
  const matched = detected?.catalogKeyboardId === keyboard.id;
  const button = uiButton({
    className: "secondary-action",
    text: active ? "Open" : "Select",
    type: "button",
    attrs: {
      "data-catalog-action": "select",
      "data-catalog-keyboard-id": keyboard.id,
    },
  });
  button.addEventListener("click", () => selectKeyboard(keyboard.id));

  return element("article", {
    className: `catalog-row ${active ? "active" : ""}`,
    attrs: {
      "data-catalog-keyboard": keyboard.id,
      "data-detected-match": String(matched),
    },
  }, [
    element("div", {}, [
      element("strong", { text: keyboard.displayName }),
      element("small", { text: keyboard.qmkKeyboard }),
    ]),
    definitionList([
      ["Layout", keyboard.layouts[0]?.displayName ?? ""],
      ["USB", keyboard.usb ? `${keyboard.usb.vid}:${keyboard.usb.pid}` : "None"],
      ["Keys", String(keyboard.layouts[0]?.keys.length ?? 0)],
    ]),
    button,
  ]);
}

function systemPanel(state: EditorState, reloadProbe: () => void): HTMLElement {
  const report = state.doctorReport;
  const layout = selectedLayout(state.keyboard, state.project);
  const buildPlan = createBuildPlan(
    state.project,
    validateProject(state.project, state.keyboard),
    state.qmkDetected,
  );
  const commands = report?.snapshot.commands ?? [];
  const commandList = element("div", { className: "command-list", attrs: { "data-command-count": String(commands.length) } });
  commands.forEach((command) => {
    commandList.append(commandRow(command));
  });
  if (commands.length === 0) {
    commandList.append(element("p", { className: "empty muted", text: "No report loaded" }));
  }

  const findings = report?.findings ?? [];
  const findingList = element("ul", { className: "issues", attrs: { "data-finding-count": String(findings.length) } });
  findings.forEach((finding) => {
    findingList.append(
      element("li", {}, [
        element("span", { className: `severity ${finding.severity}`, text: finding.severity }),
        element("div", {}, [
          element("strong", { text: finding.title }),
          element("small", { text: finding.message }),
        ]),
      ]),
    );
  });
  if (findings.length === 0) {
    findingList.append(element("li", { className: "empty muted", text: "No findings" }));
  }

  const refresh = uiButton({ className: "secondary-action", text: "Refresh", type: "button" });
  refresh.addEventListener("click", reloadProbe);

  return element("section", { className: "tab-panel system-panel", attrs: { "data-panel": "system" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "System" }),
      refresh,
    ]),
    element("div", { className: "system-grid" }, [
      element("section", {}, [
        element("h3", { text: "Commands" }),
        commandList,
      ]),
      element("section", {}, [
        element("h3", { text: "Device" }),
        definitionList(systemRows(state)),
      ]),
      buildSection(buildPlan, layout.keys.length),
      element("section", {}, [
        element("h3", { text: "Findings" }),
        findingList,
      ]),
    ]),
  ]);
}

function buildSection(plan: BuildPlan, keyCount: number): HTMLElement {
  const blockers = element("ul", {
    className: "issues",
    attrs: { "data-build-blockers": String(plan.blockers.length) },
  });
  plan.blockers.forEach((blocker) => {
    blockers.append(
      element("li", {}, [
        element("span", { className: "severity warning", text: "block" }),
        element("div", {}, [element("strong", { text: blocker })]),
      ]),
    );
  });
  if (plan.blockers.length === 0) {
    blockers.append(element("li", { className: "empty muted", text: "Ready" }));
  }

  return element(
    "section",
    {
      attrs: {
        "data-build-output": plan.output,
        "data-build-ready": String(plan.selectedReady),
      },
    },
    [
      element("h3", { text: "Build" }),
      definitionList([
        ["Target", plan.keyboardTarget],
        ["Keymap", plan.keymapName],
        ["Keys", String(keyCount)],
        ["Output", plan.output.toUpperCase()],
        ["Local", plan.localReady ? "Ready" : "Blocked"],
        ["Remote", plan.remoteReady ? "Ready" : "Blocked"],
      ]),
      element("code", {
        className: "command-preview",
        text: plan.localCommand.join(" "),
        attrs: { "data-build-command": plan.localCommand.join(" ") },
      }),
      blockers,
    ],
  );
}

function commandRow(command: CommandStatus): HTMLElement {
  const ready = Boolean(command.path);
  return element("div", {
    className: `command-row ${ready ? "ready" : "missing"}`,
    attrs: {
      "data-command": command.name,
      "data-command-ready": String(ready),
    },
  }, [
    element("strong", { text: command.name }),
    element("small", { text: ready ? command.path ?? "" : requirementLabel(command.requiredFor) }),
  ]);
}

function systemRows(state: EditorState): Array<[string, string]> {
  const detected = detectedKeyboard(state);
  const qmkCommand = state.doctorReport?.snapshot.commands?.find(
    (command) => command.name === "qmk" && command.requiredFor === "localBuild",
  );
  return [
    ["Keyboard", detected?.displayName ?? state.keyboard.displayName],
    ["Device", detected ? `${detected.device.vid}:${detected.device.pid}` : "Preset"],
    [
      "Local build",
      state.doctorStatus === "missing"
        ? "Unavailable"
        : qmkCommand?.path
          ? "Ready"
          : "Missing qmk",
    ],
    ["Distro", state.doctorReport?.snapshot.distroId ?? ""],
  ];
}

function filteredCatalog(query: string): KeyboardDefinition[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return bundledKeyboards;
  }

  return bundledKeyboards.filter((keyboard) => {
    const text = [
      keyboard.id,
      keyboard.qmkKeyboard,
      keyboard.displayName,
      keyboard.manufacturer,
      ...(keyboard.aliases ?? []),
      keyboard.usb?.vid,
      keyboard.usb?.pid,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(needle);
  });
}

function detectedKeyboard(state: EditorState): DetectedKeyboard | undefined {
  return state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
}

function modeLabel(mode: LightingProfile["mode"]): string {
  if (mode === "off") {
    return "Off";
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function supportLabel(support: string): string {
  if (support === "supported") {
    return "Supported";
  }
  if (support === "unsupported") {
    return "Off";
  }
  if (support === "requiresBuild") {
    return "Build";
  }
  if (support === "requiresCustomC") {
    return "C";
  }
  return "Unknown";
}

function requirementLabel(requirement: CommandStatus["requiredFor"]): string {
  if (requirement === "localBuild") {
    return "Local builds";
  }
  if (requirement === "catalogSync") {
    return "Catalog sync";
  }
  return "Flashing";
}

function layerStrip(state: EditorState, actions: RenderActions): HTMLElement {
  return element("section", { className: "layer-strip", attrs: { "data-layer-strip": "true" } }, [
    layerTabs(state, actions),
    layerTools(state, actions),
  ]);
}

function layerTabs(state: EditorState, actions: RenderActions): HTMLElement {
  const tabs = element("div", {
    className: "layers",
    attrs: { "aria-label": "Layers", role: "tablist" },
  });
  const layerIndexes = state.project.layers.map((layer) => layer.index);

  state.project.layers.forEach((layer, position) => {
    const selected = layer.index === state.selectedLayerIndex;
    const tab = uiButton({
      className: `layer-tab ${selected ? "active" : ""}`,
      type: "button",
      attrs: {
        "aria-controls": "keyboard-panel",
        "aria-selected": String(selected),
        "data-layer": String(layer.index),
        id: `layer-tab-${layer.index}`,
        role: "tab",
        tabindex: selected ? "0" : "-1",
      },
    });

    tab.append(element("span", { text: String(layer.index) }), layer.name);
    tab.addEventListener("click", () => actions.selectLayer(layer.index));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const nextIndex = nextLayerIndex(layerIndexes, position, event.key);
      actions.selectLayer(nextIndex);
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`#layer-tab-${nextIndex}`)?.focus();
      });
    });

    tabs.append(tab);
  });

  const add = uiButton({
    className: "layer-tab add",
    text: "Add layer",
    type: "button",
  });
  add.addEventListener("click", actions.addLayer);
  tabs.append(add);

  return tabs;
}

function layerTools(state: EditorState, actions: RenderActions): HTMLElement {
  const layer = currentLayer(state);
  const references = scanLayerReferences(state.project, layer.index);
  const deleteState = canDeleteLayer(state.project, layer.index);
  const nameInput = element("input", {
    attrs: {
      "aria-label": "Layer name",
      "data-focus-id": "selected-layer-name",
      value: layer.name,
    },
  });
  nameInput.addEventListener("input", () => {
    actions.updateSelectedLayerName(nameInput.value);
  });

  const duplicate = uiButton({
    className: "secondary-action",
    text: "Duplicate",
    type: "button",
    attrs: { "data-layer-action": "duplicate" },
  });
  duplicate.addEventListener("click", actions.duplicateSelectedLayer);

  const deleteAttrs: Record<string, string> = {
    "data-layer-action": "delete",
    "data-layer-delete-ready": String(deleteState.deleted),
  };
  if (!deleteState.deleted) {
    deleteAttrs.disabled = "";
  }
  const remove = uiButton({
    className: "secondary-action danger",
    text: "Delete",
    type: "button",
    attrs: deleteAttrs,
  });
  remove.addEventListener("click", actions.deleteSelectedLayer);

  const actionGroup = element("div", {
    className: "layer-actions",
    attrs: { "data-layer-actions": "true" },
  }, [duplicate, remove]);

  return element("section", { className: "layer-tools", attrs: { "data-layer-tools": String(layer.index) } }, [
    element("label", { className: "layer-name-field assignment-field" }, [
      element("span", { text: "Layer name" }),
      nameInput,
    ]),
    actionGroup,
    definitionList([
      ["Index", String(layer.index)],
      ["Keys", String(layer.assignments.length)],
      ["Refs", String(references.length)],
      ["Delete", deleteStateLabel(deleteState)],
    ]),
  ]);
}

function deleteStateLabel(state: ReturnType<typeof canDeleteLayer>): string {
  if (state.deleted) {
    return "Ready";
  }
  if (state.reason === "base") {
    return "Base";
  }
  if (state.reason === "referenced") {
    return "In use";
  }
  if (state.reason === "notHighest") {
    return "Higher layers";
  }
  return "Missing";
}

function nextLayerIndex(layerIndexes: number[], position: number, key: string): number {
  if (key === "Home") {
    return layerIndexes[0];
  }
  if (key === "End") {
    return layerIndexes[layerIndexes.length - 1];
  }

  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const nextPosition = (position + direction + layerIndexes.length) % layerIndexes.length;
  return layerIndexes[nextPosition];
}

function nextContextPanel(panels: ContextPanel[], position: number, key: string): ContextPanel {
  if (key === "Home") {
    return panels[0];
  }
  if (key === "End") {
    return panels[panels.length - 1];
  }

  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const nextPosition = (position + direction + panels.length) % panels.length;
  return panels[nextPosition];
}

function board(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  selectKey: (keyId: string) => void,
): HTMLElement {
  const selectedLayer = currentLayer(state);
  const profile = activeLightingProfile(state.project);
  const bounds = layoutBounds(layout.keys);
  const panel = element("div", {
    className: "board",
    attrs: {
      "aria-label": "Keyboard layout",
      "aria-labelledby": `layer-tab-${selectedLayer?.index ?? 0}`,
      id: "keyboard-panel",
      role: "tabpanel",
    },
  });
  panel.style.width = `${bounds.width * KEY_UNIT}px`;
  panel.style.height = `${bounds.height * KEY_UNIT}px`;

  layout.keys.forEach((key) => {
    const assignment = selectedLayer?.assignments.find((item) => item.visualKeyId === key.id);
    const selected = key.id === state.selectedKeyId;
    const keyButton = keyboardKey({
      assignment,
      key,
      light: profile.perKey[key.id] ?? "#5fb99a",
      selected,
      selectedLayer,
    });
    keyButton.addEventListener("click", () => selectKey(key.id));
    panel.append(keyButton);
  });

  return panel;
}

function inspector(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const context = buildSelectedKeyContext(
    state.project,
    layout.keys,
    state.selectedLayerIndex,
    state.selectedKeyId,
  );
  const key = context?.key ?? layout.keys[0];
  const layer = currentLayer(state);
  const assignment = layer?.assignments.find((item) => item.visualKeyId === key.id);
  const profile = activeLightingProfile(state.project);
  const color = profile.perKey[key.id] ?? "#5fb99a";

  const keycodeInput = element("input", {
    attrs: {
      "aria-label": "QMK keycode",
      "data-focus-id": "selected-keycode",
      value: assignment?.qmk ?? "KC_NO",
    },
  });
  keycodeInput.addEventListener("input", () => {
    actions.updateSelectedKeycode(keycodeInput.value.trim().toUpperCase());
  });

  const colorInput = element("input", {
    attrs: {
      "aria-label": "Key lighting color",
      "data-focus-id": "selected-lighting-color",
      type: "color",
      value: color,
    },
  });
  colorInput.addEventListener("input", () => {
    actions.updateSelectedLighting(colorInput.value);
  });

  return element("section", { className: "context-section inspector", attrs: { "data-context-section": "assignment" } }, [
    element("div", { className: "selected-command-row" }, [
      fieldControl("QMK keycode", keycodeInput),
      fieldControl("Light", colorInput),
    ]),
    element("div", { className: "context-disclosures" }, [
      contextDisclosure("Assignment tools", "assignment-tools", [
        assignmentEditor(state, assignment, actions),
      ]),
      contextDisclosure("Keycode palette", "keycode-palette", [
        keycodePalette(state, actions),
      ]),
    ]),
  ]);
}

function assignmentEditor(
  state: EditorState,
  assignment: Assignment | undefined,
  actions: RenderActions,
): HTMLElement {
  const parsed = parseAdvancedAssignment(assignment?.qmk ?? "");
  if (!parsed) {
    return assignmentTemplates(state, actions);
  }

  return element(
    "section",
    {
      className: "assignment-editor",
      attrs: { "data-advanced-assignment": parsed.kind },
    },
    [assignmentHeader("JSON"), ...assignmentFields(state, parsed, actions)],
  );
}

function assignmentTemplates(state: EditorState, actions: RenderActions): HTMLElement {
  const targetLayerIndex = suggestedLayerTarget(state.project, state.selectedLayerIndex);
  const templates = [
    { id: "transparent", label: "Transparent", qmk: "KC_TRNS" },
    { id: "none", label: "None", qmk: "KC_NO" },
    { id: "layer", label: "Layer hold", qmk: layerKeycode("MO", targetLayerIndex) },
    { id: "layerTap", label: "Layer tap", qmk: layerTapKeycode(targetLayerIndex, "KC_SPC") },
    { id: "modTap", label: "Mod tap", qmk: modTapKeycode("MOD_LCTL", "KC_ESC") },
  ];
  const grid = element("div", { className: "assignment-template-grid" });

  templates.forEach((template) => {
    const button = uiButton({
      className: "assignment-template",
      text: template.label,
      type: "button",
      attrs: {
        "data-assignment-template": template.id,
        "data-keycode": template.qmk,
      },
    });
    button.addEventListener("click", () => actions.updateSelectedKeycode(template.qmk));
    grid.append(button);
  });

  return element(
    "section",
    {
      className: "assignment-editor",
      attrs: { "data-advanced-assignment": "templates" },
    },
    [assignmentHeader("JSON"), grid],
  );
}

function assignmentHeader(exportMode: string): HTMLElement {
  return element("div", { className: "assignment-header" }, [
    element("h3", { text: "Assignment" }),
    element("span", {
      className: "export-mode",
      text: exportMode,
      attrs: { "data-export-mode": exportMode.toLowerCase() },
    }),
  ]);
}

function assignmentFields(
  state: EditorState,
  parsed: AdvancedAssignment,
  actions: RenderActions,
): HTMLElement[] {
  if (parsed.kind === "layer") {
    return layerAssignmentFields(state, parsed, actions);
  }
  if (parsed.kind === "layerTap") {
    return layerTapAssignmentFields(state, parsed, actions);
  }
  return modTapAssignmentFields(parsed, actions);
}

function layerAssignmentFields(
  state: EditorState,
  parsed: Extract<AdvancedAssignment, { kind: "layer" }>,
  actions: RenderActions,
): HTMLElement[] {
  const actionSelect = optionSelect(
    "Layer action",
    "layer-action",
    layerAssignmentActions,
    parsed.action,
  );
  const targetSelect = layerSelect(state, parsed.targetLayerIndex);

  const update = () => {
    actions.updateSelectedKeycode(
      layerKeycode(actionSelect.value as LayerAssignmentAction, Number(targetSelect.value)),
    );
  };
  actionSelect.addEventListener("change", update);
  targetSelect.addEventListener("change", update);

  return [fieldControl("Action", actionSelect), fieldControl("Layer", targetSelect)];
}

function layerTapAssignmentFields(
  state: EditorState,
  parsed: Extract<AdvancedAssignment, { kind: "layerTap" }>,
  actions: RenderActions,
): HTMLElement[] {
  const targetSelect = layerSelect(state, parsed.targetLayerIndex);
  const tapInput = textInput("Tap key", "advanced-layer-tap-key", parsed.tapKey);
  const update = () => {
    actions.updateSelectedKeycode(layerTapKeycode(Number(targetSelect.value), tapInput.value));
  };
  targetSelect.addEventListener("change", update);
  tapInput.addEventListener("input", update);

  return [fieldControl("Layer", targetSelect), fieldControl("Tap", tapInput)];
}

function modTapAssignmentFields(
  parsed: Extract<AdvancedAssignment, { kind: "modTap" }>,
  actions: RenderActions,
): HTMLElement[] {
  const modifierSelect = optionSelect(
    "Modifier",
    "mod-tap-modifier",
    modTapModifiers,
    parsed.modifier,
  );
  const tapInput = textInput("Tap key", "advanced-mod-tap-key", parsed.tapKey);
  const update = () => {
    actions.updateSelectedKeycode(modTapKeycode(modifierSelect.value, tapInput.value));
  };
  modifierSelect.addEventListener("change", update);
  tapInput.addEventListener("input", update);

  return [fieldControl("Mod", modifierSelect), fieldControl("Tap", tapInput)];
}

function layerSelect(state: EditorState, selectedLayerIndex: number): HTMLSelectElement {
  return optionSelect(
    "Target layer",
    "target-layer",
    state.project.layers.map((layer) => ({
      value: String(layer.index),
      label: `${layer.index} ${layer.name}`,
    })),
    String(selectedLayerIndex),
  );
}

function optionSelect(
  label: string,
  field: string,
  options: Array<{ value: string; label: string }>,
  value: string,
): HTMLSelectElement {
  const select = element("select", {
    attrs: {
      "aria-label": label,
      "data-advanced-field": field,
      "data-focus-id": `advanced-${field}`,
    },
  });
  options.forEach((option) => {
    const node = element("option", { text: option.label, attrs: { value: option.value } });
    select.append(node);
  });
  select.value = value;
  return select;
}

function textInput(label: string, focusId: string, value: string): HTMLInputElement {
  return element("input", {
    attrs: {
      "aria-label": label,
      "data-advanced-field": "tap-key",
      "data-focus-id": focusId,
      value,
    },
  });
}

function fieldControl(label: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "assignment-field" }, [
    element("span", { text: label }),
    control,
  ]);
}

function selectedKeySummary(context: SelectedKeyContext): HTMLElement {
  const rows = [
    definitionRow("Key", context.key.label ?? context.key.id),
    definitionRow("Layer", context.selectedLayer.name),
    definitionRow("Current", context.selectedAssignment?.label ?? ""),
    definitionRow("Primary", context.primaryAssignment?.label ?? ""),
  ];
  if (context.key.matrix) {
    rows.push(definitionRow("Matrix", `${context.key.matrix.row}, ${context.key.matrix.col}`));
  }
  return element("dl", { attrs: { "data-selected-key-summary": context.key.id } }, rows);
}

function selectedKeyDetails(context: SelectedKeyContext): HTMLElement {
  return element("div", { className: "key-details" }, [
    keyLayerList(context.layers),
    keyLightingDetails(context),
    keyRelationList(context.relations, context.shortcuts),
  ]);
}

function keyLayerList(layers: KeyLayerDetail[]): HTMLElement {
  const list = element("div", {
    className: "layer-functions",
    attrs: { "data-key-detail-section": "layers" },
  });
  layers.forEach((detail) => {
    list.append(keyLayerRow(detail));
  });

  return element("section", { className: "detail-section" }, [
    element("h3", { text: "Functions" }),
    list,
  ]);
}

function keyLayerRow(detail: KeyLayerDetail): HTMLElement {
  const row = element("div", {
    className: `layer-function ${detail.isSelected ? "active" : ""}`,
    attrs: {
      "data-layer-function": String(detail.layer.index),
      "data-layer-qmk": detail.qmk,
    },
  });
  row.append(
    element("span", { className: "layer-index", text: String(detail.layer.index) }),
    element("div", {}, [
      element("strong", { text: detail.label }),
      element("small", { text: detail.resolved ? detail.resolved.qmk : detail.qmk }),
    ]),
  );
  return row;
}

function keyLightingDetails(context: SelectedKeyContext): HTMLElement {
  const lighting = context.lighting;
  const conditionList = element("div", {
    className: "condition-list",
    attrs: { "data-key-detail-section": "lighting-conditions" },
  });
  lighting.conditions.forEach((condition) => {
    conditionList.append(
      element("div", {
        className: "condition-row",
        attrs: {
          "data-lighting-condition": condition.id,
          "data-condition-color": condition.color,
        },
      }, [
        colorSwatch(condition.color),
        element("div", {}, [
          element("strong", { text: condition.name }),
          element("small", {
            text: [condition.when, condition.qmk, condition.layerIndex === undefined ? "" : `L${condition.layerIndex}`]
              .filter(Boolean)
              .join(" / "),
          }),
        ]),
      ]),
    );
  });

  if (lighting.conditions.length === 0) {
    conditionList.append(element("p", { className: "empty muted", text: "None" }));
  }

  return element("section", { className: "detail-section" }, [
    element("h3", { text: "Lighting" }),
    element("dl", { attrs: { "data-selected-lighting": context.key.id } }, [
      definitionRow("Profile", lighting.profileName),
      definitionRow("Mode", lighting.mode),
      definitionRow("Color", lighting.color),
    ]),
    conditionList,
  ]);
}

function keyRelationList(relations: KeyRelation[], shortcuts: KeyShortcut[]): HTMLElement {
  const list = element("div", {
    className: "relation-list",
    attrs: { "data-key-detail-section": "relations" },
  });
  relations.forEach((relation) => {
    list.append(relationRow(relation));
  });

  if (relations.length === 0 && shortcuts.length === 0) {
    list.append(element("p", { className: "empty muted", text: "None" }));
  }

  return element("section", { className: "detail-section" }, [
    element("h3", { text: "Related" }),
    list,
  ]);
}

function relationRow(relation: KeyRelation): HTMLElement {
  return element("div", {
    className: "relation-row",
    attrs: {
      "data-relation-kind": relation.kind,
      "data-relation-qmk": relation.qmk ?? "",
    },
  }, [
    element("span", { className: "relation-kind", text: relation.label }),
    element("div", {}, [
      element("strong", { text: relation.value }),
      element("small", { text: relation.layer ? `L${relation.layer.index} ${relation.layer.name}` : "" }),
    ]),
  ]);
}

function colorSwatch(color: string): HTMLElement {
  const swatch = element("span", { className: "color-swatch" });
  swatch.style.background = color;
  return swatch;
}

function contextDisclosure(
  summary: string,
  id: string,
  children: Array<Node | string>,
): HTMLElement {
  return element("wa-details", {
    className: "context-disclosure",
    attrs: {
      "data-context-detail": id,
      appearance: "outlined",
      summary,
    },
  }, children);
}

function keycodePalette(state: EditorState, actions: RenderActions): HTMLElement {
  const searchInput = element("input", {
    attrs: {
      "aria-label": "Search keycodes",
      "data-focus-id": "keycode-search",
      placeholder: "Search",
      value: state.keycodeSearch,
    },
  });
  searchInput.addEventListener("input", () => {
    actions.updateKeycodeSearch(searchInput.value);
  });

  const tabs = element("div", {
    className: "keycode-tabs",
    attrs: { "aria-label": "Keycode categories", role: "tablist" },
  });
  keycodeCategories.forEach((category) => {
    const selected = category.id === state.keycodeCategoryId;
    const tab = uiButton({
      className: `keycode-tab ${selected ? "active" : ""}`,
      text: category.label,
      type: "button",
      attrs: {
        "aria-selected": String(selected),
        "data-keycode-category": category.id,
        role: "tab",
      },
    });
    tab.addEventListener("click", () => actions.selectKeycodeCategory(category.id));
    tabs.append(tab);
  });

  const entries = visibleKeycodes(state);
  const grid = element("div", { className: "keycode-grid" });
  entries.forEach((entry) => {
    grid.append(keycodeButton(entry, actions.updateSelectedKeycode));
  });

  if (entries.length === 0) {
    grid.append(element("p", { className: "empty", text: "No matches" }));
  }

  return element("section", { className: "keycode-browser" }, [
    element("h3", { text: "Keycodes" }),
    searchInput,
    tabs,
    grid,
  ]);
}

function visibleKeycodes(state: EditorState): KeycodeEntry[] {
  const query = state.keycodeSearch.trim().toLowerCase();
  const entries = query
    ? keycodeCategories.flatMap((category) => category.entries)
    : (keycodeCategories.find((category) => category.id === state.keycodeCategoryId)?.entries ??
      keycodeCategories[0]?.entries ??
      []);

  if (!query) {
    return entries;
  }

  return entries.filter((entry) => {
    const text = `${entry.label} ${entry.qmk} ${entry.kind}`.toLowerCase();
    return text.includes(query);
  });
}

function keycodeButton(
  entry: KeycodeEntry,
  updateKeycode: (qmk: string) => void,
): HTMLElement {
  const button = uiButton({
    className: "keycode-option",
    type: "button",
    attrs: { "data-keycode": entry.qmk },
  });
  button.append(
    element("strong", { text: entry.label }),
    element("small", { text: entry.qmk }),
  );
  button.addEventListener("click", () => updateKeycode(entry.qmk));
  return button;
}

function selectedKeyRows(
  key: VisualKey,
  layer: ReturnType<typeof currentLayer>,
): HTMLElement[] {
  const rows = [definitionRow("Key", key.label ?? key.id), definitionRow("Layer", layer?.name ?? "")];
  if (key.matrix) {
    rows.push(definitionRow("Matrix", `${key.matrix.row}, ${key.matrix.col}`));
  }
  return rows;
}

type FocusedElement = {
  focusId: string;
  selectionEnd: number | null;
  selectionStart: number | null;
} | null;

function captureFocusedInput(root: HTMLElement): FocusedElement {
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

function restoreFocusedInput(root: HTMLElement, focusedInput: FocusedElement): void {
  if (!focusedInput) {
    return;
  }

  const nextElement = root.querySelector<HTMLElement>(
    `[data-focus-id="${focusedInput.focusId}"]`,
  );
  if (!nextElement) {
    return;
  }

  nextElement.focus();
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

function details(issues: UiIssue[], qmkJson: unknown, state: EditorState): HTMLElement {
  const detected = state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
  return element("section", { className: "details" }, [
    element("div", {}, [element("h2", { text: "Validation" }), issueList(issues)]),
    element("div", {}, [
      element("h2", { text: "QMK JSON" }),
      element("pre", { text: JSON.stringify(qmkJson, null, 2) }),
    ]),
    element("div", {}, [
      element("h2", { text: "System" }),
      definitionList([
        ["Local build", state.qmkDetected ? "Ready" : "Missing qmk"],
        ["Keyboard", detected?.displayName ?? state.keyboard.displayName],
        ["Device", detected ? `${detected.device.vid}:${detected.device.pid}` : "Preset"],
      ]),
    ]),
  ]);
}

function issueList(issues: UiIssue[]): HTMLElement {
  const list = element("ul", { className: "issues" });
  if (issues.length === 0) {
    list.append(element("li", { className: "empty", text: "No blocking project issues" }));
    return list;
  }

  issues.forEach((issue) => {
    list.append(
      element("li", {}, [
        element("span", { className: `severity ${issue.severity}`, text: issue.severity }),
        element("div", {}, [
          element("strong", { text: issue.title }),
          element("small", { text: issue.path }),
        ]),
      ]),
    );
  });

  return list;
}

function definitionList(rows: Array<[string, string]>): HTMLElement {
  const list = element("dl");
  rows.forEach(([term, description]) => {
    list.append(definitionRow(term, description));
  });
  return list;
}

function definitionRow(term: string, description: string): HTMLElement {
  return element("div", {}, [
    element("dt", { text: term }),
    element("dd", { text: description }),
  ]);
}

function applyDoctorReport(state: EditorState, report: DoctorReport | null): void {
  state.doctorReport = report ?? undefined;
  state.doctorStatus = report ? "ready" : "missing";
  state.qmkDetected = report ? qmkDetectedFromReport(report) : state.fallbackQmkDetected;
}

function keyboardForProject(project: Project): KeyboardDefinition | undefined {
  return bundledKeyboards.find(
    (keyboard) =>
      keyboard.id === project.target.keyboardId &&
      keyboard.qmkKeyboard === project.target.qmkKeyboard,
  );
}

function projectFromDraft(json: string): {
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
      return { project: importProjectJson(json) };
    }
  }
}

function defaultSafetyLedgerStorage(): SafetyLedgerStorage {
  try {
    const storage = window.localStorage;
    return storage ? createSafetyLedgerStorage(storage) : createMemorySafetyLedgerStorage();
  } catch {
    return createMemorySafetyLedgerStorage();
  }
}

function downloadRecoveryBundle(bundle: RecoveryBundle): void {
  downloadJson(
    serializeRecoveryBundle(bundle),
    `${bundle.project.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-recovery.json`,
  );
}

function downloadSafetyAudit(receipt: SafetyAuditReceipt): void {
  downloadJson(
    serializeSafetyAuditReceipt(receipt),
    `${receipt.device.qmkKeyboard.replace(/[^a-z0-9_-]+/gi, "-")}-safety-audit.json`,
  );
}

function downloadQmkJson(output: unknown, currentProject: Project): void {
  const contents = JSON.stringify(output, null, 2);
  if (typeof contents !== "string") {
    return;
  }
  const filename = currentProject.build.keymapName
    .replace(/[^a-z0-9_-]+/gi, "-")
    .toLowerCase();
  downloadJson(`${contents}\n`, `${filename}-qmk.json`);
}

function downloadJson(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

function openProject(
  state: EditorState,
  project: Project,
  keyboard: KeyboardDefinition,
  status: string,
): void {
  state.pendingRecoveryBundle = undefined;
  state.pendingDecline = undefined;
  state.declineNoBackupConfirmed = false;
  state.declineResponsibilityConfirmed = false;
  state.keyboard = structuredClone(keyboard);
  state.project = structuredClone(project);
  state.selectedLayerIndex = defaultSelectedLayerIndex(state.project);
  state.selectedKeyId = selectedLayout(state.keyboard, state.project).keys[0]?.id ?? "";
  state.projectJsonDraft = JSON.stringify(state.project, null, 2);
  state.projectStatus = status;
  state.activeView = "workspace";
  state.activeContextPanel = "assignment";
  state.diagnosticsOpen = false;
}

function qmkDetectedFromReport(report: DoctorReport): boolean {
  return (
    report.snapshot.commands?.some(
      (command) =>
        command.name === "qmk" && command.requiredFor === "localBuild" && Boolean(command.path),
    ) ?? false
  );
}

function keyAriaLabel(
  layer: ReturnType<typeof currentLayer>,
  key: VisualKey,
  assignment: Assignment | undefined,
): string {
  const keyName = key.label ?? key.id;
  const matrix = key.matrix
    ? `matrix row ${key.matrix.row}, column ${key.matrix.col}`
    : "matrix not mapped";
  const layerName = layer ? `layer ${layer.index} ${layer.name}` : "unknown layer";
  return `${layerName}, key ${keyName}, ${matrix}, assigned ${formatKeycap(assignment?.qmk)}`;
}

function currentLayer(state: EditorState) {
  return (
    state.project.layers.find((layer) => layer.index === state.selectedLayerIndex) ??
    state.project.layers[0]
  );
}

function defaultSelectedLayerIndex(currentProject: Project): number {
  return (
    currentProject.layers.find((layer) => /^win base$/i.test(layer.name))?.index ??
    currentProject.layers[0]?.index ??
    0
  );
}

function selectedLayout(keyboard: KeyboardDefinition, currentProject: Project) {
  return (
    keyboard.layouts.find((layout) => layout.id === currentProject.target.layoutId) ??
    keyboard.layouts[0]
  );
}

function activeLightingProfile(currentProject: Project): LightingProfile {
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

function updateAssignment(state: EditorState, qmk: string): void {
  const layer = currentLayer(state);
  const assignment = layer.assignments.find((item) => item.visualKeyId === state.selectedKeyId);
  if (!assignment) {
    return;
  }

  assignment.qmk = qmk || "KC_NO";
  assignment.kind = kindForKeycode(assignment.qmk);
}

function updateLighting(state: EditorState, color: string): void {
  activeLightingProfile(state.project).perKey[state.selectedKeyId] = color;
}

function updateLightingGlobal(
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

function keycapLabel(
  assignment: Assignment | undefined,
  options: Parameters<typeof formatKeycap>[1] = {},
): string {
  return formatKeycap(assignment?.qmk, options);
}

function safeExportQmkJson(
  currentProject: Project,
  keyboard: KeyboardDefinition,
  issues: UiIssue[],
): unknown {
  if (issues.some((issue) => issue.severity === "error")) {
    return { blocked: "Project cannot export until validation errors are fixed." };
  }

  return exportQmkJson(currentProject, keyboard);
}

function layoutBounds(keys: VisualKey[]): { width: number; height: number } {
  return keys.reduce(
    (bounds, key) => ({
      width: Math.max(bounds.width, key.x + (key.w ?? 1)),
      height: Math.max(bounds.height, key.y + (key.h ?? 1)),
    }),
    { width: 0, height: 0 },
  );
}

type ElementOptions = {
  attrs?: Record<string, string>;
  className?: string;
  text?: string;
  type?: "button" | "reset" | "submit";
};

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementOptions,
  children?: Array<Node | string>,
): HTMLElementTagNameMap[K];
function element(
  tagName: string,
  options?: ElementOptions,
  children?: Array<Node | string>,
): HTMLElement;
function element(
  tagName: string,
  options: ElementOptions = {},
  children: Array<Node | string> = [],
): HTMLElement {
  const node = document.createElement(tagName);

  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.type !== undefined && node instanceof HTMLButtonElement) {
    node.type = options.type;
  }
  Object.entries(options.attrs ?? {}).forEach(([name, value]) => {
    node.setAttribute(name, value);
  });
  children.forEach((child) => node.append(child));

  return node;
}

type UiButtonOptions = ElementOptions;

function uiButton(options: UiButtonOptions = {}, children: Array<Node | string> = []): HTMLElement {
  const attrs = {
    ...(options.type ? { type: options.type } : {}),
    ...(options.attrs ?? {}),
  };
  const className = ["control-button", options.className].filter(Boolean).join(" ");
  const button = element(
    "wa-button",
    {
      ...options,
      className,
      attrs,
    },
    children,
  );
  if ("disabled" in attrs) {
    button.setAttribute("disabled", "");
    (button as HTMLElement & { disabled: boolean }).disabled = true;
  } else {
    (button as HTMLElement & { disabled: boolean }).disabled = false;
  }
  return button;
}

function keyboardKey({
  assignment,
  key,
  light,
  selected,
  selectedLayer,
}: {
  assignment: Assignment | undefined;
  key: VisualKey;
  light: string;
  selected: boolean;
  selectedLayer: ReturnType<typeof currentLayer>;
}): HTMLElement {
  const keyButton = element("qmk-key", {
    className: `key ${selected ? "selected" : ""}`,
    attrs: {
      "aria-label": keyAriaLabel(selectedLayer, key, assignment),
      "aria-pressed": String(selected),
      "data-key": key.id,
      role: "button",
      tabindex: "0",
    },
  });
  keyButton.style.left = `${key.x * KEY_UNIT}px`;
  keyButton.style.top = `${key.y * KEY_UNIT}px`;
  keyButton.style.width = `${(key.w ?? 1) * KEY_UNIT - KEY_INSET}px`;
  keyButton.style.height = `${(key.h ?? 1) * KEY_UNIT - KEY_INSET}px`;
  keyButton.style.setProperty("--key-light", light);
  const label = keycapLabel(assignment, { compact: true });
  keyButton.style.setProperty("--key-label-size", keyLabelSize(label, key));
  keyButton.append(element("strong", { text: label }));
  keyButton.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    keyButton.click();
  });
  return keyButton;
}

function keyLabelSize(label: string, key: VisualKey): string {
  if (!label) {
    return "12px";
  }
  const availableWidth = Math.max(1, (key.w ?? 1) * KEY_UNIT - KEY_INSET - 12);
  const widthPerCharacter = label.length <= 3 ? 0.78 : 0.7;
  const size = Math.min(12, Math.max(7, Math.floor(availableWidth / (label.length * widthPerCharacter))));
  return `${size}px`;
}
