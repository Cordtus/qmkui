import { AppView, EditorState, RenderActions, isKeychronV5MaxSnapshot } from "../appState";
import { KeyboardDefinition, UiIssue, jsonExportBlockers } from "../domain";
import { icon } from "../icons";
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
      commandPalette(state, actions),
      boardPickerDialog(state, actions),
      projectDetailsDrawer(state, actions),
    ]),
  ]);
}

export function rail(activeView: AppView, selectView: (view: AppView) => void): HTMLElement {
  // Three destinations: shape the keymap, inspect the board, manage firmware.
  // Choosing a keyboard is a dialog, not a place you live in.
  const views: Array<{ id: AppView; label: string; hint: string; icon: Parameters<typeof icon>[0] }> = [
    { id: "keymap", label: "Keymap", hint: "Assign keys and set lighting", icon: "keyboard" },
    { id: "device", label: "Device", hint: "Inspect the connected board", icon: "usb" },
    { id: "firmware", label: "Firmware", hint: "Build, flash and diagnostics", icon: "lightning" },
  ];
  const nav = element("nav", { attrs: { "aria-label": "Workbench" } });
  views.forEach((view) => {
    const selected = view.id === activeView;
    const button = uiButton(
      {
        className: `nav-item ${selected ? "active" : ""}`,
        type: "button",
        attrs: {
          "aria-current": selected ? "page" : "false",
          "data-view": view.id,
          title: view.hint,
        },
      },
      [icon(view.icon, { size: 20 }), element("span", { className: "nav-label", text: view.label })],
    );
    button.addEventListener("click", () => selectView(view.id));
    nav.append(button);
  });

  return element("aside", { className: "rail app-rail" }, [
    element("div", { className: "brand", attrs: { title: "QMKUI" } }, [
      element("span", { className: "mark", text: "Q" }),
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
  const detected = detectedKeyboard(state);
  const connectedLabel = connectedDeviceLabel(state);
  const deviceName = connectedLabel ?? detected?.displayName ?? state.keyboard.displayName;
  const deviceId = detected
    ? `${detected.device.vid}:${detected.device.pid}`
    : connectedLabel
      ? "Connected"
      : "Preset";

  const keyboardSwitch = uiButton(
    {
      className: "keyboard-switch",
      type: "button",
      attrs: {
        "data-board-picker-open": "true",
        title: "Choose a keyboard definition",
      },
    },
    [
      icon("keyboard", { size: 16 }),
      element("span", { text: deviceName }),
      icon("caret-down", { size: 12 }),
    ],
  );
  keyboardSwitch.addEventListener("click", actions.openBoardPicker);

  const save = iconAction("floppy-disk", "Save project", { "data-project-action": "save" }, actions.saveProject);
  const project = iconAction(
    "file-code",
    "Project details",
    { "data-project-details-action": "open" },
    actions.openProjectDetails,
  );
  const read = state.hardwareSnapshot
    ? iconAction(
        "arrows-clockwise",
        state.snapshotReadStatus === "reading" ? "Reading device" : "Read device",
        { "data-device-action": "refresh" },
        actions.readDevice,
      )
    : undefined;

  const support = menuAction("file-code", "Support bundle", "data-support-bundle", actions.downloadSupportBundle);
  const exportJson = exportJsonButton(state, issues, actions);
  const choose = menuAction("keyboard", "Change keyboard", "data-device-action-choose", actions.openBoardPicker);

  return element("header", { className: "topbar workspace-header" }, [
    element("div", { className: "project-heading" }, [
      element("div", { className: "project-title-row" }, [
        element("h1", { text: state.project.name }),
        element("span", {
          className: `status ${hasErrors ? "blocked" : "ready"}`,
          text: topbarStatusLabel(issues),
          attrs: { "data-keymap-status": "true" },
        }),
      ]),
      element("div", { className: "project-meta" }, [
        keyboardSwitch,
        element("small", { className: "device-id", text: deviceId }),
        element("span", { className: "view-name", text: viewLabel(state.activeView) }),
      ]),
    ]),
    element("div", { className: "topbar-actions" }, [
      historyControls(state, actions),
      iconAction("magnifying-glass", "Commands (Ctrl-K)", { "data-command-palette-open": "true" }, actions.openCommandPalette),
      save,
      project,
      ...(read ? [read] : []),
      element("details", { className: "overflow-menu", attrs: { "data-overflow-menu": "true" } }, [
        element("summary", {
          className: "overflow-trigger",
          attrs: { "aria-label": "More actions", title: "More actions" },
        }, [icon("dots-three", { size: 18 })]),
        element("div", { className: "overflow-list" }, [exportJson, support, choose]),
      ]),
    ]),
  ]);
}

function iconAction(
  name: Parameters<typeof icon>[0],
  label: string,
  attrs: Record<string, string>,
  onClick: () => void,
): HTMLElement {
  const button = uiButton(
    {
      className: "icon-action",
      type: "button",
      attrs: { ...attrs, "aria-label": label, title: label },
    },
    [icon(name, { size: 17 })],
  );
  button.addEventListener("click", onClick);
  return button;
}

function menuAction(
  name: Parameters<typeof icon>[0],
  label: string,
  marker: string,
  onClick: () => void,
): HTMLElement {
  const button = uiButton(
    {
      className: "menu-action",
      type: "button",
      attrs: { [marker]: "true" },
    },
    [icon(name, { size: 15 }), element("span", { text: label })],
  );
  button.addEventListener("click", onClick);
  return button;
}

function commandPalette(state: EditorState, actions: RenderActions): HTMLElement {
  const input = element("input", {
    attrs: {
      "aria-label": "Search commands",
      "data-focus-id": "command-search",
      placeholder: "Type a command",
      type: "search",
    },
  });
  const list = element("div", { className: "command-list", attrs: { "data-command-list": "true" } });
  const commands: Array<{
    icon: Parameters<typeof icon>[0];
    label: string;
    hint: string;
    run: () => void;
  }> = [
    { icon: "keyboard", label: "Go to Keymap", hint: "1", run: () => actions.selectView("keymap") },
    { icon: "usb", label: "Go to Device", hint: "2", run: () => actions.selectView("device") },
    { icon: "lightning", label: "Go to Firmware", hint: "3", run: () => actions.selectView("firmware") },
    { icon: "floppy-disk", label: "Save project", hint: "", run: actions.saveProject },
    { icon: "keyboard", label: "Change keyboard", hint: "", run: actions.openBoardPicker },
    { icon: "file-code", label: "Project details", hint: "", run: actions.openProjectDetails },
    { icon: "download-simple", label: "Export QMK JSON", hint: "", run: actions.downloadQmkJson },
    { icon: "file-code", label: "Export support bundle", hint: "", run: actions.downloadSupportBundle },
    { icon: "lightning", label: "Download firmware bundle", hint: "", run: actions.downloadFirmwareBundle },
    { icon: "arrows-clockwise", label: "Read device", hint: "", run: actions.readDevice },
  ];
  commands.forEach((command) => {
    const button = uiButton(
      { className: "command-row", type: "button", attrs: { "data-command": command.label } },
      [
        icon(command.icon, { size: 15 }),
        element("span", { className: "command-label", text: command.label }),
        ...(command.hint ? [element("kbd", { text: command.hint })] : []),
      ],
    );
    button.addEventListener("click", () => {
      actions.closeCommandPalette();
      command.run();
    });
    list.append(button);
  });
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    list.querySelectorAll<HTMLElement>("[data-command]").forEach((row) => {
      row.hidden = !row.textContent?.toLowerCase().includes(query);
    });
  });

  const dialog = element("wa-dialog", {
    className: "command-palette",
    attrs: { label: "Commands", "data-command-palette": "true" },
  }, [
    element("div", { className: "command-search" }, [icon("magnifying-glass", { size: 16 }), input]),
    list,
    element("p", { className: "hint command-hint", text: "Ctrl-K opens this anywhere. Esc closes it." }),
  ]);
  if (state.commandPaletteOpen) {
    dialog.hidden = false;
    dialog.setAttribute("open", "");
    (dialog as HTMLElement & { open: boolean }).open = true;
    queueMicrotask(() => input.focus());
  } else {
    dialog.hidden = true;
    dialog.removeAttribute("open");
    (dialog as HTMLElement & { open: boolean }).open = false;
  }
  dialog.addEventListener("wa-after-hide", () => {
    if (state.commandPaletteOpen) {
      actions.closeCommandPalette();
    }
  });
  return dialog;
}

function boardPickerDialog(state: EditorState, actions: RenderActions): HTMLElement {
  const dialog = element("wa-dialog", {
    className: "board-picker-dialog",
    attrs: { label: "Choose keyboard", "data-board-picker": "true" },
  }, [
    element("p", {
      className: "hint board-picker-hint",
      text: "Switch the project to another bundled definition.",
    }),
    catalogPanel(state, actions),
  ]);
  if (state.boardPickerOpen) {
    dialog.hidden = false;
    dialog.setAttribute("open", "");
    (dialog as HTMLElement & { open: boolean }).open = true;
  } else {
    dialog.hidden = true;
    dialog.removeAttribute("open");
    (dialog as HTMLElement & { open: boolean }).open = false;
  }
  dialog.addEventListener("wa-after-hide", () => {
    if (state.boardPickerOpen) {
      actions.closeBoardPicker();
    }
  });
  return dialog;
}

export function viewLabel(view: AppView): string {
  switch (view) {
    case "keymap":
      return "Keymap";
    case "device":
      return "Device";
    case "firmware":
      return "Firmware";
    default:
      return "Keymap";
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
  if (state.activeView === "firmware") {
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


