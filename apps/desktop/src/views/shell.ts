import { AppView, EditorState, RenderActions, isKeychronV5MaxSnapshot } from "../appState";
import { KeyboardDefinition, UiIssue, jsonExportBlockers } from "../domain";
import { connectionContent, connectionScreen } from "./connection";
import { catalogPanel, detectedKeyboard, projectDetailsDrawer, systemPanel, testPanel } from "./panels";
import { element, uiButton } from "./primitives";
import { snapshotContent } from "./snapshot";
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
  // One navigation, three jobs: shape the keymap, set the lighting, inspect the
  // board you have plugged in. Catalog/System are supporting surfaces, not
  // places you live in. Hints live in the tooltip so labels never truncate.
  const groups: Array<{ label: string; views: Array<{ id: AppView; label: string; hint: string }> }> = [
    {
      label: "Edit",
      views: [
        { id: "keymap", label: "Keymap", hint: "Assign keys and set lighting" },
        { id: "device", label: "Device", hint: "Read the connected board" },
      ],
    },
    {
      label: "Setup",
      views: [
        { id: "catalog", label: "Catalog", hint: "Pick a keyboard" },
        { id: "system", label: "System", hint: "Build, flash, diagnostics" },
      ],
    },
  ];
  const nav = element("nav");
  groups.forEach((group) => {
    nav.append(element("p", { className: "rail-group-label", text: group.label }));
    group.views.forEach((view) => {
      const selected = view.id === activeView;
      const button = uiButton({
        className: `nav-item ${selected ? "active" : ""}`,
        type: "button",
        text: view.label,
        attrs: {
          "aria-current": selected ? "page" : "false",
          "data-view": view.id,
          title: view.hint,
        },
      });
      button.addEventListener("click", () => selectView(view.id));
      nav.append(button);
    });
  });

  return element("aside", { className: "rail app-rail" }, [
    element("div", { className: "brand" }, [
      element("span", { className: "mark", text: "Q" }),
      element("div", { className: "brand-text" }, [
        element("strong", { text: "QMKUI" }),
        element("small", { text: "via read/write" }),
      ]),
    ]),
    nav,
  ]);
}

/**
 * Single header for the whole workbench: view, project identity, status, and
 * the global actions. There is deliberately no second device header inside a
 * view; the device actions appear here once a board is connected.
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
    text: "Save",
    attrs: { "data-project-action": "save", title: "Save the current project" },
  });
  save.addEventListener("click", actions.saveProject);

  const projectDetails = uiButton({
    className: "secondary-action",
    text: "Project",
    attrs: { "data-project-details-action": "open", title: "Project details and import/export" },
  });
  projectDetails.addEventListener("click", actions.openProjectDetails);

  return element("header", { className: "topbar workspace-header" }, [
    element("div", { className: "project-heading" }, [
      element("p", { className: "eyebrow", text: viewLabel(state.activeView) }),
      element("h1", { text: state.project.name }),
      element("div", { className: "project-meta" }, [
        element("span", { className: "device-chip", text: deviceName, attrs: { title: "Connected device" } }),
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
      element("div", { className: "action-group" }, [
        exportJsonButton(state, issues, actions),
        save,
        projectDetails,
      ]),
      ...(state.hardwareSnapshot ? [deviceActions(state, actions)] : []),
    ]),
  ]);
}

/**
 * Device actions for whichever view is open. One read controls the snapshot:
 * it is the header action, not a second button inside the view.
 */
function deviceActions(state: EditorState, actions: RenderActions): HTMLElement {
  const refresh = uiButton({
    className: "secondary-action",
    text: state.snapshotReadStatus === "reading" ? "Reading..." : "Read device",
    attrs: {
      "data-device-action": "refresh",
      ...(state.snapshotReadStatus === "reading" ? { disabled: "" } : {}),
    },
  });
  refresh.addEventListener("click", actions.readDevice);
  const choose = uiButton({
    className: "secondary-action",
    text: "Change keyboard",
    attrs: { "data-device-action": "connect" },
  });
  choose.addEventListener("click", actions.chooseBrowserKeyboard);
  return element("div", { className: "action-group" }, [refresh, choose]);
}

export function viewLabel(view: AppView): string {
  switch (view) {
    case "keymap":
      return "Keymap";
    case "device":
      return "Device";
    case "catalog":
      return "Catalog";
    default:
      return "System";
  }
}

/** Export is a single always-visible action; blocked states explain themselves. */
function exportJsonButton(state: EditorState, issues: UiIssue[], actions: RenderActions): HTMLElement {
  const invalid = issues.some((issue) => issue.severity === "error");
  const cBlockers = jsonExportBlockers(state.project);
  const blocked = invalid || cBlockers.length > 0;
  const download = uiButton({
    className: "secondary-action",
    text: "QMK JSON",
    attrs: {
      "data-qmk-action": "download",
      title: "QMK Configurator/VIA keymap JSON (layers only; lighting is in the firmware bundle)",
      ...(blocked
        ? {
            disabled: "",
            title: invalid ? "Resolve keymap validation errors first" : cBlockers.join(" "),
          }
        : {}),
    },
  });
  download.addEventListener("click", actions.downloadQmkJson);
  return download;
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
  if (state.activeView === "device") {
    return deviceContent(state, actions);
  }

  return element("div", {
    className: "view-stack",
    attrs: { "data-panel": "keymap" },
  }, [
    editor(state, layout, actions),
  ]);
}

function deviceContent(state: EditorState, actions: RenderActions): HTMLElement {
  if (!state.hardwareSnapshot) {
    return connectionPanelView(state, actions);
  }
  // The snapshot is the read-only board; the key tester lives here because both
  // answer "what is this device actually doing right now?".
  return element("div", { className: "view-stack device-view" }, [
    snapshotContent(state, actions),
    element("section", { className: "device-tester" }, [
      testPanel(state, actions),
    ]),
  ]);
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

/** Lighting lives in the Keymap view's rail; no separate destination. */
function connectionPanelView(state: EditorState, actions: RenderActions): HTMLElement {
  return element("section", {
    className: "view-stack device-view",
    attrs: { "data-panel": "device" },
  }, [connectionContent(state, actions)]);
}

export function editor(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  return element("section", {
    className: "editor",
    attrs: { "data-workbench-surface": "true" },
  }, [
    keyboardWorkspace(state, layout, actions),
  ]);
}


