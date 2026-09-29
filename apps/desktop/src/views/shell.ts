import { AppView, EditorState, RenderActions, isKeychronV5MaxSnapshot, isProtocolVerifiableSelection } from "../appState";
import { KeyboardDefinition, UiIssue, jsonExportBlockers } from "../domain";
import { connectionContent, connectionError, connectionScreen } from "./connection";
import { catalogPanel, detectedKeyboard, projectDetailsDrawer, systemPanel } from "./panels";
import { element, uiButton } from "./primitives";
import { deviceWriteControls, snapshotContent } from "./snapshot";
import { historyControls, keyboardWorkspace } from "./workspace";

export function mainShell(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  qmkJson: unknown,
  actions: RenderActions,
): HTMLElement {
  const hasDeviceSession =
    state.hardwareSnapshot !== undefined || state.deviceSelection.state === "selected";
  if (!hasDeviceSession) {
    return connectionScreen(state, actions);
  }

  return appShell(state, layout, issues, qmkJson, actions);
}

export function appShell(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  issues: UiIssue[],
  qmkJson: unknown,
  actions: RenderActions,
): HTMLElement {
  return element("main", { className: "shell" }, [
    rail(state.activeView, actions.selectView),
    element("section", { className: "workspace" }, [
      topbar(state, issues, actions),
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

/**
 * Single header for the whole workbench: project identity, global actions
 * (undo/redo, save, project details), and the probe/write status. Device
 * identity is folded into the eyebrow so there is no separate detection band.
 */
export function topbar(
  state: EditorState,
  issues: UiIssue[],
  actions: RenderActions,
): HTMLElement {
  const hasErrors = issues.some((issue) => issue.severity === "error");
  const statusClass = hasErrors ? "blocked" : "ready";
  const detected = detectedKeyboard(state);
  const connectedLabel = connectedDeviceLabel(state);
  const deviceName = connectedLabel ?? detected?.displayName ?? state.keyboard.displayName;
  const deviceId = detected
    ? `${detected.device.vid}:${detected.device.pid}`
    : connectedLabel
      ? "Connected"
      : "Preset";

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

  const refresh = uiButton({
    className: "secondary-action",
    text: "Refresh devices",
    attrs: { "data-probe-refresh": "true" },
  });
  refresh.addEventListener("click", actions.reloadProbe);

  return element("header", { className: "topbar workspace-header" }, [
    element("div", { className: "project-heading" }, [
      element("p", { className: "eyebrow", text: deviceName }),
      element("h1", { text: state.project.name }),
      element("div", { className: "project-meta" }, [
        element("small", { className: "device-id", text: deviceId }),
        element("span", {
          className: `status ${statusClass}`,
          text: topbarStatusLabel(issues),
          attrs: { "data-keymap-status": "true" },
        }),
      ]),
    ]),
    element("div", { className: "topbar-actions" }, [
      historyControls(state, actions),
      element("div", { className: "action-group" }, [save, projectDetails]),
      element("div", { className: "action-group" }, [refresh]),
    ]),
  ]);
}

export function topbarStatusLabel(issues: UiIssue[]): string {
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

/**
 * Device-context label for the header. When a device session is active the
 * header reports the actual device (or a neutral "VIA device" for an unknown
 * one) instead of the bundled preset, so an unrecognized device is never
 * presented as a known model.
 */
function connectedDeviceLabel(state: EditorState): string | null {
  const snapshot = state.hardwareSnapshot;
  if (snapshot) {
    if (isKeychronV5MaxSnapshot(snapshot) && snapshot.identity.state === "available") {
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
    editorDeviceWrite(state, actions),
  ]);
}

function editorDeviceWrite(state: EditorState, actions: RenderActions): HTMLElement {
  return deviceWriteControls(state, actions, {
    description: `Writes the project keymap (${state.project.layers.length} layers) to the connected device.`,
    controls: (confirmed) => {
      const writeKeymap = uiButton({
        className: "secondary-action",
        type: "button",
        text: "Write keymap to device",
        attrs: { "data-write-keymap": "true" },
      });
      writeKeymap.addEventListener("click", () => actions.writeKeymapToDevice(confirmed()));
      return [writeKeymap];
    },
  });
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
  ]);
}
