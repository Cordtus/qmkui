import { AppView, EditorState, RenderActions, isKeychronV5MaxSnapshot } from "../appState";
import { KeyboardDefinition, UiIssue, jsonExportBlockers } from "../domain";
import { icon, type IconName } from "../icons";
import { connectionContent, connectionScreen } from "./connection";
import { catalogPanel, detectedKeyboard, projectDetailsDrawer, systemPanel, testPanel } from "./panels";
import { element, showNativeDialog, uiButton } from "./primitives";
import { safetyPanel, snapshotContent } from "./snapshot";
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
  const views: Array<{ id: AppView; label: string; hint: string; icon: IconName }> = [
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
        "aria-expanded": String(state.boardPickerOpen),
        "aria-haspopup": "dialog",
        "data-board-picker-open": "true",
        "data-focus-id": "board-picker-trigger",
        tabindex: "0",
        title: "Project keyboard target; click to change",
      },
    },
    [
      icon("keyboard", { size: 16 }),
      element("span", { text: state.keyboard.displayName }),
      icon("caret-down", { size: 12 }),
    ],
  );
  keyboardSwitch.addEventListener("click", actions.openBoardPicker);

  const save = iconAction("floppy-disk", "Save project", { "data-project-action": "save" }, actions.saveProject);
  const project = iconAction(
    "file-code",
    "Project details",
    { "data-project-details-action": "open", "data-focus-id": "project-details-trigger" },
    actions.openProjectDetails,
  );
  const read = state.hardwareSnapshot
    ? iconAction(
        "arrows-clockwise",
        state.snapshotReadStatus === "reading" ? "Reading device" : "Read device",
        {
          "data-device-action": "refresh",
          ...(state.snapshotReadStatus === "reading"
            ? { disabled: "", "aria-busy": "true" }
            : {}),
        },
        actions.readDevice,
      )
    : undefined;

  const exportJson = exportJsonMenuItem(state, issues, actions);
  const choose = menuAction("plug", "Change connected keyboard", "data-device-switch", actions.chooseBrowserKeyboard);

  return element("header", { className: "topbar workspace-header" }, [
    element("div", { className: "project-heading" }, [
      element("div", { className: "project-title-row" }, [
        element("h1", { text: state.project.name }),
        element("span", {
          className: `status ${hasErrors ? "blocked" : "ready"}`,
          text: topbarStatusLabel(issues),
          attrs: { "data-keymap-status": "true", title: "Keymap validation" },
        }),
      ]),
      element("div", { className: "project-meta" }, [
        keyboardSwitch,
        element("small", { className: "device-id", text: deviceId, attrs: { title: "Connected device id" } }),
      ]),
      ...(state.projectStatus
        ? [
            element("p", {
              className: "topbar-status",
              text: state.projectStatus,
              attrs: { "aria-live": "polite", "data-project-status": "true", role: "status" },
            }),
          ]
        : []),
    ]),
    element("div", { className: "topbar-actions" }, [
      historyControls(state, actions),
      iconAction(
        "magnifying-glass",
        "Commands (Ctrl-K)",
        {
          "aria-expanded": String(state.commandPaletteOpen),
          "aria-haspopup": "dialog",
          "data-command-palette-open": "true",
          "data-focus-id": "command-palette-trigger",
          tabindex: "0",
        },
        actions.openCommandPalette,
      ),
      save,
      project,
      ...(read ? [read] : []),
      overflowMenu([exportJson, choose]),
    ]),
  ]);
}

function overflowMenu(items: HTMLElement[]): HTMLElement {
  const menu = element("details", { className: "overflow-menu", attrs: { "data-overflow-menu": "true" } }, [
    element("summary", {
      className: "overflow-trigger",
      attrs: { "aria-label": "More actions", title: "More actions" },
    }, [icon("dots-three", { size: 18 })]),
    element("div", { className: "overflow-list" }, items),
  ]);
  menu.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("button")) {
      menu.removeAttribute("open");
    }
  });
  return menu;
}

function iconAction(
  name: IconName,
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
  name: IconName,
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
  const dialog = element("dialog", {
    className: "command-palette",
    attrs: { "aria-label": "Commands", "data-command-palette": "true" },
  });
  if (!state.commandPaletteOpen) {
    dialog.hidden = true;
    dialog.removeAttribute("open");
    (dialog as HTMLElement & { open: boolean }).open = false;
    return dialog;
  }
  dialog.hidden = false;

  const input = element("input", {
    attrs: {
      "aria-activedescendant": "",
      "aria-controls": "palette-list",
      "aria-expanded": "true",
      "aria-label": "Search commands",
      autofocus: "",
      "data-focus-id": "command-search",
      placeholder: "Type a command",
      role: "combobox",
      type: "search",
    },
  });
  const list = element("div", {
    className: "palette-list",
    attrs: { id: "palette-list", role: "listbox", "data-command-list": "true" },
  });
  const empty = element("p", { className: "palette-empty", text: "No matching commands." });
  empty.hidden = true;

  const commands: Array<{ icon: IconName; label: string; run: () => void }> = [
    { icon: "keyboard", label: "Go to Keymap", run: () => actions.selectView("keymap") },
    { icon: "usb", label: "Go to Device", run: () => actions.selectView("device") },
    { icon: "lightning", label: "Go to Firmware", run: () => actions.selectView("firmware") },
    { icon: "floppy-disk", label: "Save project", run: actions.saveProject },
    { icon: "keyboard", label: "Choose keyboard definition", run: actions.openBoardPicker },
    { icon: "plug", label: "Change connected keyboard", run: actions.chooseBrowserKeyboard },
    { icon: "file-code", label: "Project details", run: actions.openProjectDetails },
    { icon: "download-simple", label: "Export QMK JSON", run: actions.downloadQmkJson },
    { icon: "arrows-clockwise", label: "Read device", run: actions.readDevice },
  ];

  const rows: HTMLElement[] = [];
  let active = -1;
  const visibleRows = () => rows.filter((row) => !row.hidden);
  const setActive = (index: number) => {
    const visible = visibleRows();
    if (visible.length === 0) {
      active = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    active = Math.max(0, Math.min(index, visible.length - 1));
    rows.forEach((row) => row.classList.remove("active"));
    const row = visible[active]!;
    row.classList.add("active");
    row.scrollIntoView?.({ block: "nearest" });
    input.setAttribute("aria-activedescendant", row.id);
  };

  commands.forEach((command, index) => {
    const button = uiButton(
      {
        className: "palette-row",
        type: "button",
        attrs: {
          "data-command": command.label,
          id: `palette-option-${index}`,
          role: "option",
        },
      },
      [
        icon(command.icon, { size: 15 }),
        element("span", { className: "palette-label", text: command.label }),
      ],
    );
    rows.push(button);
    list.append(button);
  });
  // Delegated so filtered rows and icon children share one handler.
  list.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-command]");
    const command = commands.find((candidate) => candidate.label === row?.dataset.command);
    if (!command) {
      return;
    }
    actions.closeCommandPalette();
    command.run();
  });

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    rows.forEach((row) => {
      row.hidden = !row.textContent?.toLowerCase().includes(query);
    });
    empty.hidden = visibleRows().length > 0;
    setActive(0);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = visibleRows()[active];
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });

  dialog.append(
    element("div", { className: "palette-search" }, [icon("magnifying-glass", { size: 16 }), input]),
    list,
    empty,
  );
  setActive(0);
  showNativeDialog(dialog, () => input.focus());
  dialog.addEventListener("close", () => {
    if (state.commandPaletteOpen) {
      actions.closeCommandPalette();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    actions.closeCommandPalette();
  });
  return dialog;
}

function boardPickerDialog(state: EditorState, actions: RenderActions): HTMLElement {
  const dialog = element("dialog", {
    className: "board-picker-dialog",
    attrs: { "aria-label": "Choose keyboard", "data-board-picker": "true" },
  });
  if (!state.boardPickerOpen) {
    dialog.hidden = true;
    dialog.removeAttribute("open");
    (dialog as HTMLElement & { open: boolean }).open = false;
    return dialog;
  }
  dialog.hidden = false;
  const cancel = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Cancel",
    attrs: { "data-board-picker-cancel": "true" },
  });
  cancel.addEventListener("click", actions.closeBoardPicker);
  dialog.append(
    catalogPanel(state, actions),
    element("div", { className: "board-picker-actions" }, [cancel]),
  );
  dialog.addEventListener("close", () => {
    if (state.boardPickerOpen) {
      actions.closeBoardPicker();
    }
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    actions.closeBoardPicker();
  });
  showNativeDialog(dialog, () => {
    dialog.querySelector<HTMLInputElement>("input")?.focus();
  });
  return dialog;
}

/** Export menu row; blocked states explain themselves in the title. */
function exportJsonMenuItem(state: EditorState, issues: UiIssue[], actions: RenderActions): HTMLElement {
  const invalid = issues.some((issue) => issue.severity === "error");
  const cBlockers = jsonExportBlockers(state.project);
  const blocked = invalid || cBlockers.length > 0;
  const row = menuAction("download-simple", "Export QMK JSON", "data-qmk-action", actions.downloadQmkJson);
  row.setAttribute("data-qmk-action", "download");
  if (blocked) {
    row.setAttribute("disabled", "");
    (row as HTMLElement & { disabled: boolean }).disabled = true;
    row.setAttribute("title", invalid ? "Resolve keymap validation errors first" : cBlockers.join(" "));
  }
  return row;
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
    ...(isKeychronV5MaxSnapshot(state.hardwareSnapshot) ? [] : [safetyPanel(state, actions)]),
    ...(state.keyTesterOpen && isKeychronV5MaxSnapshot(state.hardwareSnapshot)
      ? [element("section", { className: "device-tester" }, [testPanel(state, actions)])]
      : []),
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


