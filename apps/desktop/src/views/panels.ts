import { EditorState, RenderActions, activeLightingProfile, bundledKeyboards, currentLayer, selectedLayout } from "../appState";
import { BuildPlan, createBuildPlan } from "../buildPlan";
import { BuildStep } from "../buildService";
import { firmwareBundleFileName } from "../firmwareBundle";
import { CommandStatus, DetectedKeyboard, KeyboardDefinition, LightingProfile, UiIssue, validateProject } from "../domain";
import { illuminationBase, type IlluminationBase } from "../illumination";
import { DEFAULT_BOARD_COLOR, boardColor, buildSelectedKeyContext, lightingForKey } from "../keyDetails";
import { HostKeyCapture } from "../keyTester";
import { canDeleteLayer, scanLayerReferences } from "../layerActions";
import { supportedLightingSystems } from "../lightingCapabilities";
import { ProjectSummary } from "../projectStorage";
import { icon, type IconName } from "../icons";
import { colorPicker, contextDisclosure, controlGroup, definitionList, element, fieldControl, optionSelect, rangeInput, showNativeDialog, uiButton } from "./primitives";
import { macroEditor, previewLightingColor } from "./workspace";
import { resolveRgbMatrixEffect, rgbMatrixEffectsFor, viaDefinitionFor, type ViaRgbMatrixEffect } from "../viaDefinition";
import { lightingRuleTriggerLabel } from "../lightingRules";

export type BuildActions = {
  runLocalBuild: () => void;
  setFlashConfirmed: (confirmed: boolean) => void;
  runFlashDryRun: () => void;
  downloadFirmwareBundle: () => void;
  selectView: (view: "device") => void;
  selectFirmwareStep: (step: "build" | "flash" | "verify") => void;
  setBuildLogOpen: (open: boolean) => void;
};
export function projectPanel(
  state: EditorState,
  actions: RenderActions,
): HTMLElement {
  const savedProjects = state.projectStorage.list();
  if (!state.selectedSavedProjectId && savedProjects[0]) {
    state.selectedSavedProjectId = savedProjects[0].id;
  }
  const selectedSavedProject = savedProjects.find(
    (project) => project.id === state.selectedSavedProjectId,
  );

  const savedOptions =
    savedProjects.length > 0
      ? savedProjects.map((project) => ({
          value: project.id,
          label: `${project.name} - ${project.qmkKeyboard}`,
        }))
      : [{ value: "", label: "No saved projects" }];
  const savedSelect = optionSelect(
    "Saved projects",
    "saved-project",
    savedOptions,
    state.selectedSavedProjectId,
  );
  savedSelect.setAttribute("data-focus-id", "saved-project-select");
  savedSelect.addEventListener("change", () => {
    actions.selectSavedProject(savedSelect.value);
  });

  const projectDraft = element("textarea", {
    attrs: {
      "aria-label": "Project, recovery bundle, or safety audit JSON",
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
    text: "Save project",
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

  const savedProjectName = element("input", {
    attrs: {
      "aria-label": "Saved project name",
      "data-focus-id": "saved-project-name",
      value: selectedSavedProject?.name ?? "",
    },
  }) as HTMLInputElement;

  const rename = uiButton({
    className: "secondary-action",
    text: "Rename",
    type: "button",
    attrs: { "data-project-action": "rename" },
  });
  rename.addEventListener("click", () => actions.renameSavedProject(savedProjectName.value));

  const duplicate = uiButton({
    className: "secondary-action",
    text: "Duplicate",
    type: "button",
    attrs: { "data-project-action": "duplicate" },
  });
  duplicate.addEventListener("click", actions.duplicateSavedProject);

  const remove = uiButton({
    className: "secondary-action danger",
    text: "Delete",
    type: "button",
    attrs: { "data-project-action": "delete" },
  });
  remove.addEventListener("click", actions.deleteSavedProject);

  const refreshDraft = uiButton({
    className: "secondary-action",
    text: "Reset draft",
    type: "button",
    attrs: { "data-project-action": "refresh-draft" },
  });
  refreshDraft.addEventListener("click", () => {
    const json = JSON.stringify(state.project, null, 2);
    projectDraft.value = json;
    actions.updateProjectJsonDraft(json);
  });

  const importDraft = uiButton({
    className: "secondary-action",
    text: "Import draft",
    type: "button",
    attrs: { "data-project-action": "import" },
  });
  importDraft.addEventListener("click", actions.importProjectDraft);

  const exportProject = uiButton({
    className: "secondary-action",
    text: "Export project JSON",
    type: "button",
    attrs: { "data-project-action": "export" },
  });
  exportProject.addEventListener("click", actions.downloadProjectJson);

  const transfer = element("details", {
    className: "project-transfer",
    attrs: {
      "data-project-section": "transfer",
    },
  }, [
    element("summary", { text: "Import or export" }),
    element("div", { className: "project-transfer-content" }, [
      element("p", {
        className: "hint",
        text: "Import a project, recovery bundle, or safety audit receipt.",
      }),
      element("div", { className: "project-actions" }, [exportProject]),
      projectDraft,
      element("div", { className: "project-actions" }, [refreshDraft, importDraft]),
    ]),
  ]);

  return element("section", { className: "project-panel" }, [
    element("div", { className: "project-details-content" }, [
      element("section", {
        className: "project-section",
        attrs: { "data-project-section": "current" },
      }, [
        element("h2", { text: "Current project" }),
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
        element("div", { className: "project-actions" }, [save]),
      ]),
      element("section", {
        className: "project-section",
        attrs: { "data-project-section": "saved" },
      }, [
        element("h2", { text: "Saved projects" }),
        element("small", { text: String(savedProjects.length) }),
        savedSelect,
        savedProjectList(savedProjects),
        ...(savedProjects.length > 0
          ? [
              element("label", { className: "saved-project-name" }, [
                element("span", { text: "Saved project name" }),
                savedProjectName,
              ]),
              element("div", { className: "project-actions" }, [open, rename, duplicate, remove]),
            ]
          : []),
      ]),
      element("section", {
        className: "project-section",
        attrs: { "data-project-section": "macros" },
      }, [
        element("h2", { text: "Macros" }),
        macroEditor(state, actions),
      ]),
      transfer,
    ]),
  ]);
}

export function savedProjectList(projects: ProjectSummary[]): HTMLElement {
  const list = element("div", {
    className: "saved-projects",
    attrs: { "data-saved-project-count": String(projects.length) },
  });
  if (projects.length === 0) {
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

export function projectDetailsDrawer(
  state: EditorState,
  actions: RenderActions,
): HTMLElement {
  const drawer = element("dialog", {
    className: "project-details-drawer",
    attrs: {
      "aria-label": "Project details",
      "data-project-details-drawer": "true",
    },
  });
  if (!state.projectDetailsOpen) {
    drawer.hidden = true;
    drawer.removeAttribute("open");
    return drawer;
  }
  drawer.hidden = false;
  showNativeDialog(drawer, () => {
    drawer.querySelector<HTMLElement>("input, textarea, button")?.focus();
  });
  drawer.addEventListener("close", () => {
    if (state.projectDetailsOpen) {
      actions.closeProjectDetails();
    }
  });
  drawer.addEventListener("cancel", (event) => {
    event.preventDefault();
    actions.closeProjectDetails();
  });

  const close = uiButton({
    className: "secondary-action drawer-footer",
    text: "Close",
    attrs: { "data-project-details-action": "close" },
  });
  close.addEventListener("click", actions.closeProjectDetails);

  drawer.append(projectPanel(state, actions), close);

  return drawer;
}

/**
 * Lighting controls, rendered inside the Keymap view's Lighting tab. The wheel
 * applies to the current key selection; the Board colour input is the separate
 * board-wide VIA write.
 */
export function lightingPanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const profile = activeLightingProfile(state.project);
  const supportedSystems = supportedLightingSystems(state.keyboard);
  const rgbMatrix = supportedSystems.some((system) => system.id === "rgbMatrix");
  const effects = rgbMatrixEffectsFor(state.keyboard.qmkKeyboard);
  const base = illuminationBase(state.hardwareSnapshot);
  const context = buildSelectedKeyContext(
    state.project,
    layout.keys,
    state.selectedLayerIndex,
    state.selectedKeyId,
    base,
  );
  const selectedLighting = context?.lighting ?? lightingForKey(profile, state.selectedKeyId, base);
  const modeButtons = element("div", {
    className: "segmented",
    attrs: { "aria-label": "Lighting mode", role: "group" },
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

  const selectedCount = state.selectedKeyIds.length;
  const picker = colorPicker({
    label: "Selected keys colour",
    value: selectedLighting.color,
    focusId: "selected-lighting-color",
    onPreview: previewLightingColor,
    onCommit: actions.updateSelectedLighting,
  });
  const selectAll = uiButton({
    className: `secondary-action ${selectedCount === layout.keys.length ? "active" : ""}`,
    text: "All keys",
    type: "button",
    attrs: {
      "aria-pressed": String(selectedCount === layout.keys.length),
      "data-lighting-select-all": "true",
    },
  });
  selectAll.addEventListener("click", actions.selectAllKeys);

  const canPaint = Boolean(selectedLighting.color);
  const paint = uiButton({
    className: `secondary-action ${state.lightingPaint ? "active" : ""}`,
    text: state.lightingPaint ? "Painting" : "Paint keys",
    type: "button",
    attrs: {
      "aria-pressed": String(state.lightingPaint),
      "data-lighting-paint": "true",
      title: canPaint ? "Click keys to apply the current colour" : "Pick a colour first",
      ...(canPaint || state.lightingPaint ? {} : { disabled: "" }),
    },
  });
  paint.addEventListener("click", actions.toggleLightingPaint);

  const clear = uiButton({
    className: "secondary-action",
    text: "Clear",
    type: "button",
    attrs: {
      "data-lighting-clear": "true",
      title: "Remove the colour override from the selected keys",
    },
  });
  clear.addEventListener("click", actions.clearSelectedLighting);

  const swatches = swatchRow(profile, actions);

  return element("section", {
    className: "lighting-panel",
    attrs: { "data-context-section": "lighting" },
  }, [
    controlGroup("selected-key-lighting", "Key colour", [
      picker,
      element("div", { className: "selection-row" }, [
        element("span", {
          className: "selection-count",
          text: `${selectedCount} of ${layout.keys.length} keys`,
          attrs: { "data-lighting-selection-count": "true" },
        }),
        element("div", { className: "selection-actions" }, [paint, selectAll, clear]),
      ]),
      swatches,
      element("span", {
        className: "visually-hidden",
        text: selectedLighting.color || "unset",
        attrs: { "data-lighting-color-readout": "true" },
      }),
      element("div", { className: "assignment-field" }, [
        element("span", { text: "Mode" }),
        modeButtons,
      ]),
    ]),
    ...(rgbMatrix ? [controlGroup("lighting-rules", "Key rules", [lightingRulesPanel(state, layout, actions)])] : []),
    ...(rgbMatrix
      ? [controlGroup("board-lighting", "Board lighting", [
          element("div", { className: "board-light-head" }, [
            element("span", {
              className: "hint",
              text: base
                ? `Current board: ${base.source}`
                : "No board lighting read; the controls use the project profile.",
            }),
            resyncLightingButton(actions),
          ]),
          ...(state.lightingStatus
            ? [element("small", { className: "board-light-status", text: state.lightingStatus })]
            : []),
          rgbMatrixControls(profile, actions, effects, base),
        ])]
      : []),
  ]);
}

/** Recently used colours from the project, click to apply to the selection. */
function swatchRow(
  profile: ReturnType<typeof activeLightingProfile>,
  actions: RenderActions,
): HTMLElement {
  const colors = [...new Set(Object.values(profile.perKey))].slice(0, 10);
  const row = element("div", {
    className: "swatch-row",
    attrs: { "data-lighting-recent-swatches": "true" },
  });
  colors.forEach((color) => {
    const swatch = element("button", {
      className: "swatch",
      type: "button",
      attrs: { "data-lighting-swatch": color, title: color, "aria-label": `Use ${color}` },
    });
    swatch.style.background = color;
    swatch.addEventListener("click", () => actions.updateSelectedLighting(color));
    row.append(swatch);
  });
  return row;
}

/**
 * Firmware-side rules. These are stored in the project and exported as QMK C;
 * the app does not write them over VIA. The target is always the selected key.
 */
function lightingRulesPanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const target = layout.keys.find((key) => key.id === state.selectedKeyId);
  const rules = (state.project.lightingRules ?? []).filter(
    (rule) => rule.targetKeyId === state.selectedKeyId,
  );
  const list = element("ul", {
    className: "rule-list",
    attrs: { "data-lighting-rules": String(rules.length) },
  });
  rules.forEach((rule) => {
    const remove = uiButton(
      {
        className: "icon-action compact",
        type: "button",
        attrs: {
          "aria-label": `Remove ${lightingRuleTriggerLabel(rule.trigger, layout.keys)} rule`,
          "data-lighting-rule-remove": rule.id,
          title: "Remove rule",
        },
      },
      [icon("x", { size: 13 })],
    );
    remove.addEventListener("click", () => actions.removeLightingRule(rule.id));
    const swatch = element("span", { className: "swatch", attrs: { "aria-hidden": "true" } });
    swatch.style.background = rule.color;
    list.append(
      element("li", { className: "rule-row", attrs: { "data-lighting-rule": rule.id } }, [
        swatch,
        element("strong", { text: lightingRuleTriggerLabel(rule.trigger, layout.keys) }),
        remove,
      ]),
    );
  });
  let triggerKind: "lock" | "layer" | "held" = "lock";
  let lockKind: "capsLock" | "numLock" | "scrollLock" = "capsLock";
  const triggerRow = element("div", {
    className: "segmented rule-trigger-kinds",
    attrs: { "aria-label": "Rule trigger kind", role: "group" },
  });
  const lockRow = element("div", {
    className: "segmented rule-lock-kinds",
    attrs: { "aria-label": "Lock indicator", role: "group" },
  });
  const layer = optionSelect(
    "Rule layer",
    "rule-layer",
    state.project.layers.map((item) => ({ value: String(item.index), label: `${item.index} ${item.name}` })),
    String(state.selectedLayerIndex),
  );
  layer.setAttribute("data-lighting-rule-layer", "true");
  const held = optionSelect(
    "Rule held key",
    "rule-held",
    layout.keys.map((key) => ({ value: key.id, label: key.label ?? key.id })),
    state.selectedKeyId,
  );
  held.setAttribute("data-lighting-rule-held", "true");
  const layerField = fieldControl("Layer", layer);
  const heldField = fieldControl("Held key", held);
  const lockField = element("div", { className: "rule-lock-field" }, [lockRow]);
  const syncFields = () => {
    layerField.hidden = triggerKind !== "layer";
    heldField.hidden = triggerKind !== "held";
    lockField.hidden = triggerKind !== "lock";
    triggerRow.querySelectorAll<HTMLElement>("[data-rule-kind]").forEach((button) => {
      button.classList.toggle("active", button.dataset.ruleKind === triggerKind);
    });
    lockRow.querySelectorAll<HTMLElement>("[data-rule-lock]").forEach((button) => {
      button.classList.toggle("active", button.dataset.ruleLock === lockKind);
    });
  };
  (["lock", "layer", "held"] as const).forEach((kind) => {
    const label = kind === "lock" ? "Lock" : kind === "layer" ? "Layer" : "Held key";
    const button = uiButton(
      {
        className: "segment",
        type: "button",
        attrs: { "data-rule-kind": kind, "aria-pressed": String(kind === triggerKind) },
      },
      [icon(kind === "lock" ? "lock" : kind === "layer" ? "stack" : "cursor-click", { size: 13 }), element("span", { text: label })],
    );
    button.addEventListener("click", () => {
      triggerKind = kind;
      triggerRow.querySelectorAll<HTMLElement>("[data-rule-kind]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate.dataset.ruleKind === kind));
      });
      syncFields();
    });
    triggerRow.append(button);
  });
  (["capsLock", "numLock", "scrollLock"] as const).forEach((lock) => {
    const button = uiButton({
      className: "segment compact",
      text: lock === "capsLock" ? "Caps" : lock === "numLock" ? "Num" : "Scroll",
      type: "button",
      attrs: { "data-rule-lock": lock, "aria-pressed": String(lock === lockKind) },
    });
    button.addEventListener("click", () => {
      lockKind = lock;
      lockRow.querySelectorAll<HTMLElement>("[data-rule-lock]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate.dataset.ruleLock === lock));
      });
      syncFields();
    });
    lockRow.append(button);
  });
  syncFields();

  const add = uiButton({
    className: "secondary-action",
    type: "button",
    text: target ? `Add rule for ${target.label ?? target.id}` : "Add rule",
    attrs: { "data-lighting-rule-add": "true" },
  });
  add.addEventListener("click", () => {
    if (triggerKind === "lock") {
      actions.addLightingRule({ kind: "lock", lock: lockKind });
    } else if (triggerKind === "layer") {
      actions.addLightingRule({ kind: "layer", layerIndex: Number(layer.value) });
    } else {
      actions.addLightingRule({ kind: "held", keyId: held.value });
    }
  });

  return element("section", {
    className: "lighting-rules",
    attrs: { "data-rule-target": state.selectedKeyId },
  }, [
    list,
    triggerRow,
    lockField,
    layerField,
    heldField,
    element("div", { className: "rule-actions" }, [add]),
  ]);
}

function firmwareButton(download: () => void): HTMLElement {
  const button = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Download firmware bundle",
    attrs: {
      "data-firmware-bundle": "true",
      title: "Download a zip with keymap.c, the lighting overlay and build instructions",
    },
  });
  button.addEventListener("click", download);
  return button;
}

export function rgbMatrixControls(
  profile: LightingProfile,
  actions: RenderActions,
  effects: ViaRgbMatrixEffect[],
  base: IlluminationBase | null,
): HTMLElement {
  const global = profile.global ?? {};
  // Default to the board's current values so the sliders match what a write
  // will send when the profile has not set them.
  const brightness = Number(global.brightness ?? base?.brightness ?? 180);
  const speed = Number(global.speed ?? base?.effectSpeed ?? 128);
  const effectId = resolveRgbMatrixEffect(global.effect ?? base?.effect, effects);
  const effectSelect = element("select", {
    attrs: {
      "aria-label": "RGB Matrix effect",
      "data-focus-id": "lighting-effect",
      "data-lighting-control": "effect",
    },
  });
  // Every mode the board's VIA definition exposes, in firmware-id order.
  effects.forEach(({ id, name }) => {
    effectSelect.append(element("option", { text: name, attrs: { value: String(id) } }));
  });
  effectSelect.value = String(effectId);
  effectSelect.addEventListener("change", () => {
    actions.updateLightingGlobal("effect", Number(effectSelect.value));
  });

  const brightnessInput = rangeInput("Brightness", "brightness", brightness);
  brightnessInput.addEventListener("input", () => {
    actions.updateLightingGlobal("brightness", Number(brightnessInput.value));
  });

  const speedInput = rangeInput("Speed", "speed", speed);
  speedInput.addEventListener("input", () => {
    actions.updateLightingGlobal("speed", Number(speedInput.value));
  });

  const boardColorInput = element("input", {
    attrs: {
      "aria-label": "Board colour",
      "data-lighting-control": "colour",
      "data-lighting-board-color": "true",
      type: "color",
    },
  }) as HTMLInputElement;
  boardColorInput.value = boardColor(profile, base) || DEFAULT_BOARD_COLOR;
  boardColorInput.addEventListener("change", () => {
    actions.updateLightingGlobal("color", boardColorInput.value);
  });

  return element("section", { className: "lighting-controls" }, [
    fieldControl("Effect", effectSelect),
    fieldControl("Board colour", boardColorInput),
    rangeField("Brightness", brightnessInput),
    rangeField("Speed", speedInput),
    element("p", {
      className: "hint",
      text: "Sets the whole board over VIA; it does not write per-key colours.",
    }),
  ]);
}

/** A slider with its live value, so a drag has a number to aim at. */
function resyncLightingButton(actions: RenderActions): HTMLElement {
  const resync = uiButton({
    className: "secondary-action compact",
    type: "button",
    text: "Resync",
    attrs: { "data-lighting-refresh": "true", title: "Re-read the board's lighting state" },
  });
  resync.addEventListener("click", actions.refreshLighting);
  return resync;
}

/** A slider with its live value, so a drag has a number to aim at. */
function rangeField(label: string, input: HTMLInputElement): HTMLElement {
  const value = element("output", { className: "range-value", text: input.value });
  input.addEventListener("input", () => {
    value.textContent = input.value;
  });
  return element("label", { className: "assignment-field" }, [
    element("span", { className: "range-head" }, [element("span", { text: label }), value]),
    input,
  ]);
}

export function testPanel(
  state: EditorState,
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
      definitionList([
        ["Layer", String(state.selectedLayerIndex)],
        ["Host", last ? `${last.code}` : ""],
        ["QMK", last?.qmk ?? ""],
        ["Matches", String(last?.matchedKeyIds.length ?? 0)],
      ]),
      element("p", {
        className: "hint",
        text: "Focus this panel and press a key to see what the host receives.",
      }),
    ],
  );
  captureArea.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      return;
    }
    event.preventDefault();
    actions.captureHostKey({ code: event.code, key: event.key });
  });

  return element("section", { className: "test-panel", attrs: { "data-context-section": "test" } }, [
    controlGroup("host-key-capture", "Host key test", [captureArea]),
    contextDisclosure("Captured events", "test-events", [
      testEventList(state.testEvents),
    ]),
    contextDisclosure("Post-flash smoke check", "smoke-checklist", [
      postFlashSmokeChecklist(),
    ]),
  ]);
}

function postFlashSmokeChecklist(): HTMLElement {
  const items = [
    "Keyboard types the expected characters on the base layer.",
    "Fn-layer keys and media keys respond.",
    "Every layer switch reports the expected behavior.",
    "No unexpected key repeat or chatter is observed.",
  ];
  return element("ul", { className: "smoke-checklist", attrs: { "data-smoke-checklist": "true" } }, [
    ...items.map((item) => element("li", { text: item })),
  ]);
}

export function testEventList(events: HostKeyCapture[]): HTMLElement {
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

  return list;
}

export function catalogPanel(state: EditorState, actions: RenderActions): HTMLElement {
  const searchInput = element("input", {
    attrs: {
      "aria-label": "Search catalog",
      "data-focus-id": "catalog-search",
      placeholder: "Search",
      value: "",
    },
  });
  const results = bundledKeyboards;
  const count = element("small", { text: String(results.length) });
  const list = element("div", { className: "catalog-list", attrs: { "data-catalog-results": String(results.length) } });
  results.forEach((keyboard) => {
    list.append(catalogRow(keyboard, state, actions));
  });
  // Filter in place: a state update would rebuild the dialog and steal focus
  // on every keystroke.
  searchInput.addEventListener("input", () => {
    const needle = searchInput.value.trim().toLowerCase();
    let visible = 0;
    list.querySelectorAll<HTMLElement>("[data-catalog-keyboard]").forEach((row) => {
      const match = !needle || row.textContent?.toLowerCase().includes(needle);
      row.hidden = !match;
      if (match) visible += 1;
    });
    count.textContent = String(visible);
    list.setAttribute("data-catalog-results", String(visible));
  });

  return element("section", { className: "tab-panel catalog-panel", attrs: { "data-panel": "catalog" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Keyboards" }),
      count,
    ]),
    searchInput,
    list,
  ]);
}

export function catalogRow(
  keyboard: KeyboardDefinition,
  state: EditorState,
  actions: RenderActions,
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
  button.addEventListener("click", () => actions.selectKeyboardFromCatalog(keyboard.id));

  const via = viaDefinitionFor(keyboard.qmkKeyboard);
  const viaButton = via
    ? uiButton({
        className: "secondary-action",
        text: "VIA definition",
        type: "button",
        attrs: { "data-via-definition-download": "true", "data-catalog-keyboard-id": keyboard.id },
      })
    : undefined;
  viaButton?.addEventListener("click", () => actions.downloadViaDefinition(keyboard.qmkKeyboard));

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
      ...(keyboard.bootloader ? ([["Bootloader", keyboard.bootloader]] as [string, string][]) : []),
      ...(keyboard.processor ? ([["Processor", keyboard.processor]] as [string, string][]) : []),
      ...(keyboard.qmkCommit
        ? ([["QMK commit", keyboard.qmkCommit.slice(0, 8)]] as [string, string][])
        : []),
    ]),
    element("div", { className: "catalog-row-actions" }, [
      ...(viaButton ? [viaButton] : []),
      button,
    ]),
  ]);
}

export function systemPanel(
  state: EditorState,
  issues: UiIssue[],
  qmkJson: unknown,
  reloadProbe: () => void,
  downloadSupportBundle: () => void,
  buildActions: BuildActions,
): HTMLElement {
  const layout = selectedLayout(state.keyboard, state.project);
  const buildPlan = createBuildPlan(
    state.project,
    validateProject(state.project, state.keyboard),
    state.qmkDetected,
  );
  const steps: Array<[EditorState["firmwareStep"], string, IconName]> = [
    ["build", "Build", "hammer"],
    ["flash", "Flash", "lightning"],
    ["verify", "Verify", "check-circle"],
  ];
  const rail = element("div", {
    className: "step-rail",
    attrs: { "aria-label": "Firmware steps", "data-firmware-steps": "true" },
  });
  steps.forEach(([step, label, glyph]) => {
    const selected = state.firmwareStep === step;
    const button = uiButton(
      {
        className: `step ${selected ? "active" : ""}`,
        type: "button",
        attrs: {
          "aria-pressed": String(selected),
          "data-firmware-step": step,
        },
      },
      [
        icon(selected ? "check-circle" : glyph, { size: 15 }),
        element("span", { text: label }),
      ],
    );
    button.addEventListener("click", () => buildActions.selectFirmwareStep(step));
    rail.append(button);
  });

  const panel =
    state.firmwareStep === "flash"
      ? flashStepPanel(buildPlan, state, buildActions)
      : state.firmwareStep === "verify"
        ? verifyStepPanel(buildActions)
        : buildStepPanel(buildPlan, layout.keys.length, state, buildActions);

  return element("section", {
    className: "tab-panel system-panel",
    attrs: { "data-panel": "system", "data-firmware-step-active": state.firmwareStep },
  }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Firmware" }),
    ]),
    rail,
    panel,
    firmwareDiagnostics(state, issues, qmkJson, reloadProbe, downloadSupportBundle),
  ]);
}

function firmwareDiagnostics(
  state: EditorState,
  issues: UiIssue[],
  qmkJson: unknown,
  reloadProbe: () => void,
  downloadSupportBundle: () => void,
): HTMLElement {
  const report = state.doctorReport;
  const commands = report?.snapshot.commands ?? [];
  const commandList = element("div", {
    className: "command-list",
    attrs: { "data-command-count": String(commands.length) },
  });
  commands.forEach((command) => commandList.append(commandRow(command)));
  if (commands.length === 0) {
    commandList.append(element("p", { className: "hint", text: "No command probes reported." }));
  }

  const findings = report?.findings ?? [];
  const findingList = element("ul", {
    className: "issues",
    attrs: { "data-finding-count": String(findings.length) },
  });
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
    findingList.append(element("li", { className: "hint", text: "No findings reported." }));
  }

  const refresh = uiButton({ className: "secondary-action", text: "Refresh", type: "button" });
  refresh.addEventListener("click", reloadProbe);

  return contextDisclosure("Diagnostics and support", "firmware-diagnostics", [
    element("div", { className: "system-grid" }, [
      element("section", { className: "system-card" }, [
        element("h3", { text: "Commands" }),
        commandList,
      ]),
      element("section", { className: "system-card" }, [
        element("h3", { text: "Device" }),
        definitionList(systemRows(state)),
        refresh,
      ]),
      element("section", { className: "system-card" }, [
        element("h3", { text: "Findings" }),
        findingList,
      ]),
    ]),
    supportDetails(issues, qmkJson, state, downloadSupportBundle),
  ]);
}

function buildStepPanel(
  plan: BuildPlan,
  keyCount: number,
  state: EditorState,
  actions: BuildActions,
): HTMLElement {
  const blockers = element("ul", {
    className: "issues",
    attrs: { "data-build-blockers": String(plan.blockers.length) },
  });
  plan.blockers.forEach((blocker) => {
    blockers.append(
      element("li", {}, [
        element("span", { className: "severity warning", text: "block" }),
        element("div", {}, [element("strong", { text: blockerLabel(blocker, state.doctorStatus) })]),
      ]),
    );
  });

  const buildButton = uiButton({
    className: "secondary-action",
    type: "button",
    text: state.buildStatus === "building" ? "Building..." : "Build locally",
    attrs: {
      "data-build-run": "true",
      title: state.buildRunnerAvailable
        ? "Run the command through the injected local runner"
        : "The browser cannot run builds; use the command above",
      ...(state.buildStatus === "building" || !state.buildRunnerAvailable
        ? { disabled: "" }
        : {}),
    },
  });
  buildButton.addEventListener("click", actions.runLocalBuild);

  const buildOutput = state.buildStep
    ? element("pre", {
        className: "build-output",
        attrs: { "data-build-status": state.buildStatus },
        text: buildStepLabel(state.buildStep),
      })
    : element("p", { className: "muted", text: "No build yet." });

  const artifacts = element("ul", {
    className: "artifact-list",
    attrs: { "data-artifact-count": String(state.artifacts.length) },
  });
  state.artifacts.forEach((artifact) => {
    const copy = uiButton(
      {
        className: "icon-action compact",
        type: "button",
        attrs: {
          "aria-label": "Copy artifact hash",
          "data-copy-artifact": artifact.id,
          title: "Copy artifact hash",
        },
      },
      [icon("copy", { size: 13 })],
    );
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(artifact.id);
    });
    artifacts.append(
      element("li", {}, [
        element("code", { text: artifact.id.slice(0, 12) }),
        element("small", { text: `${artifact.qmkKeyboard} · ${artifact.createdAt}` }),
        copy,
      ]),
    );
  });
  if (state.artifacts.length === 0) {
    artifacts.append(element("li", { className: "muted", text: "No artifacts yet." }));
  }

  return element("section", {
    className: "firmware-step build-step",
    attrs: {
      "data-firmware-step-panel": "build",
      "data-build-output": plan.output,
      "data-build-ready": String(plan.selectedReady),
    },
  }, [
    element("div", { className: "firmware-target-chips" }, [
      element("span", { className: "chip", text: plan.keyboardTarget }),
      element("span", { className: "chip", text: plan.keymapName }),
      element("span", { className: "chip", text: `${keyCount} keys` }),
      element("span", { className: "chip", text: plan.output.toUpperCase() }),
      element("span", {
        className: `chip ${plan.selectedReady ? "ready" : "blocked"}`,
        text: plan.selectedReady ? "Ready" : "Blocked",
      }),
    ]),
    element("code", {
      className: "command-preview",
      text: plan.localCommand.join(" "),
      attrs: { "data-build-command": plan.localCommand.join(" ") },
    }),
    blockers,
    element("div", { className: "build-actions" }, [buildButton, firmwareButton(actions.downloadFirmwareBundle)]),
    contextDisclosure("Build log", "build-log", [buildOutput], {
      open: state.buildLogOpen,
      onToggle: actions.setBuildLogOpen,
    }),
    element("h3", { className: "build-subheading", text: "Artifacts" }),
    artifacts,
  ]);
}

function flashStepPanel(
  plan: BuildPlan,
  state: EditorState,
  actions: BuildActions,
): HTMLElement {
  const detected = detectedKeyboard(state);
  const bundleName = firmwareBundleFileName(state.project);
  const command = [
    "qmkui-flash",
    "--bundle",
    bundleName,
    "--qmk-path",
    "<QMK checkout>",
    "--keyboard",
    plan.keyboardTarget,
    "--keymap",
    plan.keymapName,
    "--bootloader",
    state.keyboard.bootloader ?? "<from info.json>",
    "--confirm",
    plan.keyboardTarget,
  ].join(" ");

  const flashConfirm = element("label", { className: "flash-confirm" }, [
    element("input", {
      attrs: {
        "data-flash-confirm": "true",
        type: "checkbox",
        ...(state.flashConfirmed ? { checked: "" } : {}),
      },
    }),
    element("span", { text: "I confirm the flash target and device." }),
  ]);
  flashConfirm.querySelector<HTMLInputElement>("input")!.addEventListener("change", (event) => {
    actions.setFlashConfirmed((event.target as HTMLInputElement).checked);
  });

  const flashButton = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Preview flash",
    attrs: { "data-flash-dry-run": "true" },
  });
  flashButton.addEventListener("click", actions.runFlashDryRun);

  return element("section", {
    className: "firmware-step flash-step",
    attrs: { "data-firmware-step-panel": "flash" },
  }, [
    element("code", {
      className: "command-preview",
      text: command,
      attrs: { "data-flash-command": command },
    }),
    element("dl", { className: "flash-target-facts" }, [
      element("div", {}, [element("dt", { text: "Target" }), element("dd", { text: plan.keyboardTarget })]),
      element("div", {}, [element("dt", { text: "Bootloader" }), element("dd", { text: state.keyboard.bootloader ?? "unknown" })]),
      element("div", {}, [element("dt", { text: "Device" }), element("dd", { text: detected ? `${detected.device.vid}:${detected.device.pid}` : "not detected" })]),
      element("div", {}, [element("dt", { text: "Operator gate" }), element("dd", { text: "--confirm must repeat the target" })]),
    ]),
    element("div", { className: "flash-controls" }, [flashConfirm, flashButton]),
    element("div", {
      className: "flash-status",
      attrs: { "data-flash-status": flashVerdictLabel(state) },
    }, [
      ...(state.flashVerdict
        ? [
            element("p", {
              className: state.flashVerdict.pass ? "flash-pass" : "flash-block",
              text: state.flashVerdict.pass
                ? state.flashVerdict.reason ??
                  "Preview: confirmation and artifact match; bootloader is checked at flash time."
                : `Preview: ${state.flashVerdict.reason}`,
            }),
          ]
        : []),
      ...(state.flashRun
        ? [element("pre", { className: "build-output", text: state.flashRun.log.join("\n") })]
        : []),
    ]),
  ]);
}

function verifyStepPanel(actions: BuildActions): HTMLElement {
  const tester = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Open key tester",
    attrs: { "data-verify-tester": "true" },
  });
  tester.addEventListener("click", () => actions.selectView("device"));
  return element("section", {
    className: "firmware-step verify-step",
    attrs: { "data-firmware-step-panel": "verify" },
  }, [
    element("h3", { text: "Post-flash smoke check" }),
    postFlashSmokeChecklist(),
    element("div", { className: "build-actions" }, [tester]),
  ]);
}

function blockerLabel(code: string, doctorStatus: EditorState["doctorStatus"]): string {
  if (code === "command.qmk.missing") {
    return doctorStatus === "missing"
      ? "Local build status is unknown; no doctor report is loaded."
      : "The local doctor report did not find the qmk CLI.";
  }
  return (
    {
      "build.remote.unavailable": "Remote builds need a JSON-only project.",
      "build.remote.generatedC": "Remote builds cannot generate custom C.",
    }[code] ?? code
  );
}

function buildStepLabel(step: BuildStep): string {
  return step.status === "succeeded" || step.status === "failed"
    ? `${step.command}\n${step.output}`
    : `${step.command} (${step.status})`;
}

function flashVerdictLabel(state: EditorState): string {
  if (!state.flashVerdict) {
    return "idle";
  }
  return state.flashVerdict.pass ? "preview-ok" : "preview-blocked";
}

export function commandRow(command: CommandStatus): HTMLElement {
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

export function systemRows(state: EditorState): Array<[string, string]> {
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
        ? "Not checked"
        : qmkCommand?.path
          ? "Ready"
          : "qmk not found",
    ],
    ["Distro", state.doctorReport?.snapshot.distroId ?? ""],
    ...(state.doctorReport?.snapshot.protocol
      ? [[
          "Protocol gates",
          `${state.doctorReport.snapshot.protocol.viaReadCommands.length} VIA reads · ${state.doctorReport.snapshot.protocol.keychronReadCommands.length} Keychron reads · ${state.doctorReport.snapshot.protocol.viaWriteCommands.length} writes`,
        ] as [string, string]]
      : []),
  ];
}


export function detectedKeyboard(state: EditorState): DetectedKeyboard | undefined {
  return state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
}

export function modeLabel(mode: LightingProfile["mode"]): string {
  if (mode === "off") {
    return "Off";
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}


export function requirementLabel(requirement: CommandStatus["requiredFor"]): string {
  if (requirement === "localBuild") {
    return "Local builds";
  }
  if (requirement === "catalogSync") {
    return "Catalog sync";
  }
  return "Flashing";
}

export function layerTabs(state: EditorState, actions: RenderActions): HTMLElement {
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
      const nextIndex = nextInRing(layerIndexes, position, event.key);
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

export function layerTools(state: EditorState, actions: RenderActions): HTMLElement {
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
    deleteAttrs.title = deleteStateLabel(deleteState);
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
    ...(references.length === 0
      ? []
      : [element("p", {
          className: "hint",
          text: `${references.length} layer key${references.length === 1 ? "" : "s"} point${references.length === 1 ? "s" : ""} here.`,
        })]),
  ]);
}

export function deleteStateLabel(state: ReturnType<typeof canDeleteLayer>): string {
  if (state.deleted) {
    return "Ready";
  }
  if (state.reason === "base") {
    return "The base layer cannot be deleted.";
  }
  if (state.reason === "referenced") {
    return "Another layer still points to this one.";
  }
  if (state.reason === "notHighest") {
    return "Only the top layer can be deleted.";
  }
  return "This layer cannot be deleted.";
}

function nextInRing<T>(items: T[], position: number, key: string): T {
  if (key === "Home") {
    return items[0];
  }
  if (key === "End") {
    return items[items.length - 1];
  }

  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  return items[(position + direction + items.length) % items.length];
}

export function supportDetails(
  issues: UiIssue[],
  qmkJson: unknown,
  state: EditorState,
  downloadSupportBundle: () => void,
): HTMLElement {
  const detected = detectedKeyboard(state);
  return element("details", {
    className: "support-details",
    attrs: {
      "data-support-details": "true",
    },
  }, [
    element("summary", { text: "Support details" }),
    element("div", { className: "support-details-content" }, [
      element("section", {}, [element("h3", { text: "Validation" }), issueList(issues)]),
      element("section", {}, [
        element("h3", { text: "QMK JSON" }),
        element("pre", { text: JSON.stringify(qmkJson, null, 2) }),
      ]),
      element("section", {}, [
        element("h3", { text: "Environment" }),
        definitionList([
          [
            "Local build",
            state.doctorStatus === "missing"
              ? "Not checked"
              : state.qmkDetected
                ? "Ready"
                : "qmk not found",
          ],
          ["Keyboard", detected?.displayName ?? state.keyboard.displayName],
          ["Device", detected ? `${detected.device.vid}:${detected.device.pid}` : "Preset"],
        ]),
      ]),
      element("section", {}, [
        element("h3", { text: "Bundle" }),
        element("p", {
          className: "muted",
          text: "Downloads project identity, doctor findings, and macro metadata (actions redacted) for sharing.",
        }),
        element("div", {}, [
          downloadBundleButton(downloadSupportBundle),
        ]),
      ]),
    ]),
  ]);
}

function downloadBundleButton(downloadSupportBundle: () => void): HTMLElement {
  const button = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Download support bundle",
    attrs: { "data-download-support-bundle": "true" },
  });
  button.addEventListener("click", downloadSupportBundle);
  return button;
}

export function issueList(issues: UiIssue[]): HTMLElement {
  const list = element("ul", { className: "issues" });
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
