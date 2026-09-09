import { AppView, EditorState, RenderActions, isProtocolVerifiableSelection } from "../appState";
import { BuildPlan } from "../buildPlan";
import { chooseBrowserKeyboard } from "../devices/browserKeyboardDiscovery";
import { KeyboardDefinition, Project, UiIssue, jsonExportBlockers } from "../domain";
import { connectionContent, connectionError, connectionScreen } from "./connection";
import { catalogPanel, projectDetailsDrawer, systemPanel } from "./panels";
import { element, uiButton } from "./primitives";
import { snapshotContent, snapshotScreen } from "./snapshot";
import { keyboardWorkspace } from "./workspace";
export function mainShell(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  qmkJson: unknown,
  buildPlan: BuildPlan,
  actions: RenderActions,
): HTMLElement {
  const hasDeviceSession =
    state.hardwareSnapshot !== undefined || state.deviceSelection.state === "selected";
  if (!hasDeviceSession) {
    return connectionScreen(state, actions);
  }

  return appShell(state, layout, issues, qmkJson, buildPlan, actions);
}

export function appShell(
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
      projectDetailsDrawer(state, actions),
    ]),
  ]);
}

export function rail(activeView: AppView, selectView: (view: AppView) => void): HTMLElement {
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

  return element("aside", { className: "rail app-rail" }, [
    element("div", { className: "brand" }, [
      element("span", { className: "mark", text: "Q" }),
      element("div", {}, [
        element("strong", { text: "QMKUI" }),
      ]),
    ]),
    nav,
  ]);
}

export function topbar(
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

  const projectDetails = uiButton({
    className: "secondary-action",
    text: "Project details",
    attrs: { "data-project-details-action": "open" },
  });
  projectDetails.addEventListener("click", actions.openProjectDetails);

  return element("header", { className: "topbar workspace-header" }, [
    element("div", { className: "project-heading" }, [
      element("p", { className: "eyebrow", text: state.keyboard.displayName }),
      element("h1", { text: state.project.name }),
    ]),
    element("div", { className: "topbar-actions" }, [
      save,
      projectDetails,
      element("div", {
        className: `status ${statusClass}`,
        text: topbarStatusLabel(issues, buildPlan),
      }),
    ]),
  ]);
}

export function topbarStatusLabel(issues: UiIssue[], buildPlan: BuildPlan): string {
  if (issues.some((issue) => issue.severity === "error")) {
    return "Fix keymap issues";
  }
  return "Keymap valid";
}

export function activePanel(
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
    return systemPanel(state, issues, qmkJson, actions.reloadProbe, actions.downloadSupportBundle, actions);
  }

  return element("div", {
    className: "view-stack",
    attrs: {
      "data-panel": "workspace",
    },
  }, [
    workspaceModeToggle(state, actions),
    state.workspaceMode === "editor"
      ? editor(state, layout, issues, actions)
      : deviceContent(state, actions),
  ]);
}

function workspaceModeToggle(state: EditorState, actions: RenderActions): HTMLElement {
  const modes: Array<{ id: "device" | "editor"; label: string }> = [
    { id: "device", label: "Device" },
    { id: "editor", label: "Project editor" },
  ];
  const toggle = element("div", {
    className: "workspace-mode-toggle",
    attrs: { "data-workspace-mode-toggle": "true" },
  });
  modes.forEach((mode) => {
    const button = uiButton({
      className: "workspace-mode-tab",
      type: "button",
      text: mode.label,
      attrs: {
        "data-workspace-mode": mode.id,
        "aria-pressed": String(mode.id === state.workspaceMode),
      },
    });
    button.addEventListener("click", () => actions.selectWorkspaceMode(mode.id));
    toggle.append(button);
  });
  return toggle;
}

function deviceContent(state: EditorState, actions: RenderActions): HTMLElement {
  return state.hardwareSnapshot
    ? snapshotContent(state, actions)
    : connectionContent(state, actions);
}

export function detectionStrip(state: EditorState, reloadProbe: () => void): HTMLElement {
  const detected = state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
  const connectedLabel = connectedDeviceLabel(state);
  const keyboardName = connectedLabel ?? detected?.displayName ?? state.keyboard.displayName;
  const deviceId = detected
    ? `${detected.device.vid}:${detected.device.pid}`
    : connectedLabel
      ? "Connected"
      : "Preset";
  const statusText =
    state.doctorStatus === "loading"
      ? "Checking"
      : state.doctorStatus === "missing"
        ? "Unavailable"
        : deviceId;

  const refresh = uiButton({ className: "secondary-action", text: "Refresh", type: "button" });
  refresh.addEventListener("click", reloadProbe);

  return element("section", { className: "probe-strip" }, [
    element("div", { className: "probe-summary" }, [
      element("h2", { text: "Keyboard" }),
      element("p", {
        text: keyboardName,
      }),
    ]),
    element("div", { className: "probe-meta probe-actions" }, [
      element("strong", { text: statusText }),
      refresh,
    ]),
  ]);
}

/**
 * A device-context label for the connection strip. When a device session is
 * active the strip reports the actual device (or a neutral "VIA device" for an
 * unknown one) instead of the bundled preset keyboard, so an unrecognized
 * device is never presented as a known model.
 */
function connectedDeviceLabel(state: EditorState): string | null {
  const snapshot = state.hardwareSnapshot;
  if (snapshot) {
    if (snapshot.identity.state === "available") {
      return snapshot.identity.value.model;
    }
    return "VIA device";
  }
  if (state.deviceSelection.state === "selected") {
    return state.deviceSelection.identity.productName ?? "VIA device";
  }
  return null;
}

export function editor(
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

export function editorWorkflow(
  state: EditorState,
  issues: UiIssue[],
  actions: RenderActions,
): HTMLElement {
  const invalid = issues.some((issue) => issue.severity === "error");
  const cBlockers = jsonExportBlockers(state.project);
  const exportBlocked = invalid || cBlockers.length > 0;
  const download = uiButton({
    className: "secondary-action",
    text: "Download QMK JSON",
    type: "button",
    attrs: {
      "data-qmk-action": "download",
      ...(exportBlocked
        ? {
            disabled: "",
            title: invalid
              ? "Resolve keymap validation errors first"
              : cBlockers.join(" "),
          }
        : {}),
    },
  });
  download.addEventListener("click", actions.downloadQmkJson);
  const connect = uiButton({
    className: "secondary-action",
    text:
      state.deviceSelection.state === "selecting" ? "Choosing keyboard..." : "Choose keyboard",
    type: "button",
    attrs: {
      "data-device-action": "connect",
      ...(state.deviceSelection.state === "selecting" ? { disabled: "" } : {}),
    },
  });
  connect.addEventListener("click", actions.chooseBrowserKeyboard);
  const protocolAction = isProtocolVerifiableSelection(state.deviceSelection)
    ? uiButton({
        className: "secondary-action",
        text:
          state.protocolVerification.state === "verifying"
            ? "Verifying protocol..."
            : "Verify protocol",
        type: "button",
        attrs: {
          "data-device-action": "verify-protocol",
          ...(state.protocolVerification.state === "verifying" ? { disabled: "" } : {}),
        },
      })
    : undefined;
  protocolAction?.addEventListener("click", actions.verifyKeychronV5MaxProtocol);

  const writeControls = deviceWriteControls(state, actions);

  const actionGroup = element("div", { className: "workflow-actions", attrs: { "aria-label": "Editor actions" } }, [
    download,
    connect,
    ...(protocolAction ? [protocolAction] : []),
  ]);
  const notices = element("div", { className: "workflow-notices" }, [
    ...(invalid
      ? [element("small", { text: "Fix keymap validation errors to download QMK JSON." })]
      : []),
    element("small", {
      attrs: { "data-device-state": "true" },
      text: connectionError(state.deviceSelection, state.protocolVerification, "idle"),
    }),
  ]);

  return element("section", {
    className: "editor-workflow",
    attrs: { "data-editor-workflow": "true" },
  }, [
    actionGroup,
    notices,
    writeControls,
  ]);
}

/**
 * Gated "write the whole project keymap to the device" controls. The
 * confirmation checkbox gates every write; EEPROM save is separate.
 */
function deviceWriteControls(state: EditorState, actions: RenderActions): HTMLElement {
  const confirm = element("label", { className: "write-confirm" }, [
    element("input", {
      attrs: { "data-write-confirm": "true", type: "checkbox" },
    }),
    element("span", { text: "I understand this writes to the live keymap." }),
  ]);
  const enable = uiButton({
    className: "secondary-action",
    type: "button",
    text: state.deviceWriteEnabled ? "Writes enabled" : "Enable device writes",
    attrs: {
      "data-device-write-enable": "true",
      ...(state.deviceWriteEnabled ? { disabled: "" } : {}),
    },
  });
  enable.addEventListener("click", () => {
    const checked = confirm.querySelector<HTMLInputElement>("[data-write-confirm]")?.checked;
    actions.enableDeviceWrites(Boolean(checked));
  });
  const writeKeymap = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Write keymap to device",
    attrs: { "data-write-keymap": "true" },
  });
  writeKeymap.addEventListener("click", () => {
    const checked = confirm.querySelector<HTMLInputElement>("[data-write-confirm]")?.checked;
    actions.writeKeymapToDevice(Boolean(checked));
  });
  const save = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Save to EEPROM",
    attrs: { "data-device-save-eeprom": "true" },
  });
  save.addEventListener("click", () => {
    const checked = confirm.querySelector<HTMLInputElement>("[data-write-confirm]")?.checked;
    actions.saveEepromToDevice(Boolean(checked));
  });

  return element("section", {
    className: "device-write-controls",
    attrs: { "data-editor-write-controls": "true" },
  }, [
    element("h3", { text: "Device write" }),
    element("p", {
      text: `Writes the project keymap (${state.project.layers.length} layers) to the connected device.`,
    }),
    confirm,
    element("div", { className: "device-write-actions" }, [enable, writeKeymap, save]),
  ]);
}
