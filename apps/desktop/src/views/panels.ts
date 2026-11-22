import { EditorState, RenderActions, activeLightingProfile, bundledKeyboards, currentLayer, selectedLayout } from "../appState";
import { BuildPlan, createBuildPlan } from "../buildPlan";
import { BuildStep } from "../buildService";
import { CommandStatus, DetectedKeyboard, KeyboardDefinition, LightingProfile, LightingRuleTrigger, UiIssue, validateProject } from "../domain";
import { illuminationBase, type IlluminationBase } from "../illumination";
import { DEFAULT_BOARD_COLOR, boardColor, buildSelectedKeyContext, lightingForKey } from "../keyDetails";
import { HostKeyCapture } from "../keyTester";
import { canDeleteLayer, scanLayerReferences } from "../layerActions";
import { lightingSystemsForKeyboard, supportedLightingSystems } from "../lightingCapabilities";
import { ProjectSummary } from "../projectStorage";
import { colorPicker, contextDisclosure, controlGroup, definitionList, element, fieldControl, optionSelect, rangeInput, uiButton } from "./primitives";
import { keyLightingDetails, macroEditor, previewLightingColor } from "./workspace";
import { resolveRgbMatrixEffect, rgbMatrixEffectsFor, viaDefinitionFor, type ViaRgbMatrixEffect } from "../viaDefinition";
import { lockLabel } from "../lightingRules";

export type BuildActions = {
  runLocalBuild: () => void;
  setFlashConfirmed: (confirmed: boolean) => void;
  runFlashDryRun: () => void;
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
    actions.updateProjectJsonDraft(JSON.stringify(state.project, null, 2));
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

  const transfer = element("wa-details", {
    className: "project-transfer",
    attrs: {
      appearance: "outlined",
      summary: "Import or export",
      "data-project-section": "transfer",
    },
  }, [
    element("div", { className: "project-transfer-content" }, [
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
  const drawer = element("wa-drawer", {
    className: "project-details-drawer",
    attrs: {
      "data-project-details-drawer": "true",
      label: "Project details",
      placement: "end",
    },
  });
  if (state.projectDetailsOpen) {
    drawer.setAttribute("open", "");
    (drawer as HTMLElement & { open: boolean }).open = true;
  } else {
    drawer.hidden = true;
    (drawer as HTMLElement & { open: boolean }).open = false;
  }

  const close = uiButton({
    className: "secondary-action",
    text: "Close",
    attrs: { "data-project-details-action": "close", slot: "footer" },
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
  const lightingSystems = lightingSystemsForKeyboard(state.keyboard);
  const supportedSystems = supportedLightingSystems(state.keyboard);
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
      element("div", { className: "color-readout" }, [
        element("span", { text: "Hex" }),
        element("code", {
          text: selectedLighting.color || "unset",
          attrs: { "data-lighting-color-readout": "true" },
        }),
      ]),
    ]),
    controlGroup("lighting-mode", "Map lighting", [modeButtons]),
    ...(supportedSystems.some((system) => system.id === "rgbMatrix")
      ? [controlGroup("lighting-rules", "Key rules", [lightingRulesPanel(state, layout, actions)])]
      : []),
    controlGroup("lighting-write", "Board lighting", [
      supportedSystems.some((system) => system.id === "rgbMatrix")
        ? rgbMatrixControls(profile, actions, rgbMatrixEffectsFor(state.keyboard.qmkKeyboard), base)
        : element("p", { className: "hint", text: "No RGB-matrix controls on this keyboard." }),
    ]),
    controlGroup("firmware", "Firmware", [
      firmwareButton(actions),
      element("p", {
        className: "hint",
        text: "Buildable keymap, per-key colours and rules for QMK CLI or Toolbox.",
      }),
    ]),
    controlGroup("lighting-options", "Capabilities", [
      contextDisclosuresRow(lightingDisclosures(context, lightingSystems)),
    ]),
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
  const rules = state.project.lightingRules ?? [];
  const list = element("ul", { className: "rule-list", attrs: { "data-lighting-rules": String(rules.length) } });
  rules.forEach((rule) => {
    const target = layout.keys.find((key) => key.id === rule.targetKeyId);
    const remove = uiButton({
      className: "secondary-action compact",
      type: "button",
      text: "Remove",
      attrs: { "data-lighting-rule-remove": rule.id },
    });
    remove.addEventListener("click", () => actions.removeLightingRule(rule.id));
    const swatch = element("span", { className: "swatch", attrs: { "aria-hidden": "true" } });
    swatch.style.background = rule.color;
    list.append(
      element("li", { className: "rule-row", attrs: { "data-lighting-rule": rule.id } }, [
        swatch,
        element("div", {}, [
          element("strong", { text: ruleTriggerLabel(rule.trigger, layout) }),
          element("small", { text: target?.label ?? rule.targetKeyId }),
        ]),
        remove,
      ]),
    );
  });

  const trigger = element("select", {
    attrs: { "aria-label": "Rule trigger", "data-lighting-rule-trigger": "true" },
  }, [
    element("option", { text: "Caps Lock on", attrs: { value: "lock:capsLock" } }),
    element("option", { text: "Num Lock on", attrs: { value: "lock:numLock" } }),
    element("option", { text: "Scroll Lock on", attrs: { value: "lock:scrollLock" } }),
    element("option", { text: "Layer active", attrs: { value: "layer" } }),
    element("option", { text: "Key held", attrs: { value: "held" } }),
  ]);
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
  const syncRuleFields = () => {
    layerField.style.display = trigger.value === "layer" ? "" : "none";
    heldField.style.display = trigger.value === "held" ? "" : "none";
  };
  trigger.addEventListener("change", syncRuleFields);
  syncRuleFields();

  const target = layout.keys.find((key) => key.id === state.selectedKeyId);
  const add = uiButton({
    className: "secondary-action",
    type: "button",
    text: `Add rule for ${target?.label ?? "key"}`,
    attrs: { "data-lighting-rule-add": "true" },
  });
  add.addEventListener("click", () => {
    const value = trigger.value;
    if (value.startsWith("lock:")) {
      actions.addLightingRule({
        kind: "lock",
        lock: value.slice(5) as "capsLock" | "numLock" | "scrollLock",
      });
    } else if (value === "layer") {
      actions.addLightingRule({ kind: "layer", layerIndex: Number(layer.value) });
    } else {
      actions.addLightingRule({ kind: "held", keyId: held.value });
    }
  });

  return element("section", { className: "lighting-rules" }, [
    list,
    element("label", { className: "assignment-field" }, [
      element("span", { text: "Trigger" }),
      trigger,
    ]),
    element("div", { className: "rule-fields" }, [layerField, heldField]),
    element("div", { className: "rule-actions" }, [add]),
  ]);
}

function ruleTriggerLabel(trigger: LightingRuleTrigger, layout: KeyboardDefinition["layouts"][number]): string {
  if (trigger.kind === "lock") {
    return lockLabel(trigger.lock);
  }
  if (trigger.kind === "layer") {
    return `Layer ${trigger.layerIndex}`;
  }
  const key = layout.keys.find((candidate) => candidate.id === trigger.keyId);
  return `${key?.label ?? trigger.keyId} held`;
}

function lightingDisclosures(
  context: ReturnType<typeof buildSelectedKeyContext>,
  lightingSystems: ReturnType<typeof lightingSystemsForKeyboard>,
): Array<[string, string, Array<Node | string>]> {
  const entries: Array<[string, string, Array<Node | string>]> = [
    ["Lighting capabilities", "lighting-capabilities", [lightingCapabilityList(lightingSystems)]],
  ];
  if (context) {
    entries.push(["Selected key lighting", "selected-key-lighting", [keyLightingDetails(context)]]);
  }
  return entries;
}

function contextDisclosuresRow(
  entries: ReadonlyArray<readonly [string, string, Array<Node | string>]>,
): HTMLElement {
  return element(
    "div",
    { className: "context-disclosures" },
    entries.map(([summary, id, children]) => contextDisclosure(summary, id, children)),
  );
}

function firmwareButton(actions: RenderActions): HTMLElement {
  const download = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Download firmware",
    attrs: {
      "data-firmware-bundle": "true",
      title: "Download a zip with keymap.c, the lighting overlay and build instructions",
    },
  });
  download.addEventListener("click", actions.downloadFirmwareBundle);
  return download;
}

export function lightingCapabilityList(
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
      value: state.catalogSearch,
    },
  });
  searchInput.addEventListener("input", () => {
    actions.updateCatalogSearch(searchInput.value);
  });

  const results = filteredCatalog(state.catalogSearch);
  const list = element("div", { className: "catalog-list", attrs: { "data-catalog-results": String(results.length) } });
  results.forEach((keyboard) => {
    list.append(catalogRow(keyboard, state, actions));
  });

  return element("section", { className: "tab-panel catalog-panel", attrs: { "data-panel": "catalog" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Catalog" }),
      element("small", { text: String(bundledKeyboards.length) }),
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
    commandList.append(
      element("p", {
        className: "hint",
        text: "No command probes reported. Run the doctor on this machine to populate them.",
      }),
    );
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
    findingList.append(element("li", { className: "hint", text: "No findings reported." }));
  }

  const refresh = uiButton({ className: "secondary-action", text: "Refresh", type: "button" });
  refresh.addEventListener("click", reloadProbe);

  return element("section", { className: "tab-panel system-panel", attrs: { "data-panel": "system" } }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "System" }),
      element("small", { text: "Build readiness and diagnostics" }),
      refresh,
    ]),
    element("div", { className: "system-grid" }, [
      element("section", { className: "system-card" }, [
        element("h3", { text: "Commands" }),
        commandList,
      ]),
      element("section", { className: "system-card" }, [
        element("h3", { text: "Device" }),
        definitionList(systemRows(state)),
      ]),
      buildSection(buildPlan, layout.keys.length, state, buildActions),
      element("section", { className: "system-card" }, [
        element("h3", { text: "Findings" }),
        findingList,
      ]),
    ]),
    supportDetails(issues, qmkJson, state, downloadSupportBundle),
  ]);
}

export function buildSection(plan: BuildPlan, keyCount: number, state: EditorState, actions: BuildActions): HTMLElement {
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

  const buildButton = uiButton({
    className: "secondary-action",
    type: "button",
    text: state.buildStatus === "building" ? "Building..." : "Build locally",
    attrs: { "data-build-run": "true", ...(state.buildStatus === "building" ? { disabled: "" } : {}) },
  });
  buildButton.addEventListener("click", actions.runLocalBuild);

  const buildOutput = state.buildStep
    ? element("pre", { className: "build-output", attrs: { "data-build-status": state.buildStatus }, text: buildStepLabel(state.buildStep) })
    : element("p", { className: "muted", text: "No build has run this session." });

  const artifacts = element("ul", { className: "artifact-list", attrs: { "data-artifact-count": String(state.artifacts.length) } });
  state.artifacts.forEach((artifact) => {
    artifacts.append(
      element("li", {}, [
        element("code", { text: artifact.id.slice(0, 12) }),
        element("small", { text: `${artifact.qmkKeyboard} · ${artifact.createdAt}` }),
      ]),
    );
  });
  if (state.artifacts.length === 0) {
    artifacts.append(element("li", { className: "muted", text: "No artifacts yet." }));
  }

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
    text: "Dry-run flash",
    attrs: { "data-flash-dry-run": "true" },
  });
  flashButton.addEventListener("click", actions.runFlashDryRun);

  const flashStatus = element("div", { className: "flash-status", attrs: { "data-flash-status": flashVerdictLabel(state) } }, [
    ...(state.flashVerdict
      ? [element("p", { className: state.flashVerdict.pass ? "flash-pass" : "flash-block", text: state.flashVerdict.pass ? "Policy: pass" : `Policy: ${state.flashVerdict.reason}` })]
      : []),
    ...(state.flashRun ? [element("pre", { className: "build-output", text: state.flashRun.log.join("\n") })] : []),
  ]);

  return element(
    "section",
    {
      className: "system-card system-build",
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
      ]),
      element("code", {
        className: "command-preview",
        text: plan.localCommand.join(" "),
        attrs: { "data-build-command": plan.localCommand.join(" ") },
      }),
      blockers,
      element("div", { className: "build-actions" }, [buildButton]),
      buildOutput,
      element("h3", { className: "build-subheading", text: "Artifacts" }),
      artifacts,
      element("h3", { className: "build-subheading", text: "Flash (dry run)" }),
      element("div", { className: "flash-controls" }, [flashConfirm, flashButton]),
      flashStatus,
    ],
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
  return state.flashVerdict.pass ? "pass" : "blocked";
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
        ? "Unavailable"
        : qmkCommand?.path
          ? "Ready"
          : "Missing qmk",
    ],
    ["Distro", state.doctorReport?.snapshot.distroId ?? ""],
  ];
}

export function filteredCatalog(query: string): KeyboardDefinition[] {
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

export function detectedKeyboard(state: EditorState): DetectedKeyboard | undefined {
  return state.doctorReport?.snapshot.hardwareProbe.detectedKeyboards?.[0];
}

export function modeLabel(mode: LightingProfile["mode"]): string {
  if (mode === "off") {
    return "Off";
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export function supportLabel(support: string): string {
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
    element("p", {
      className: "hint",
      text: `${layer.assignments.length} keys · ${references.length} layer key${references.length === 1 ? "" : "s"} point here${deleteState.deleted ? "" : ` · ${deleteStateLabel(deleteState)}`}`,
    }),
  ]);
}

export function deleteStateLabel(state: ReturnType<typeof canDeleteLayer>): string {
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
  return element("wa-details", {
    className: "support-details",
    attrs: {
      appearance: "outlined",
      summary: "Support details",
      "data-support-details": "true",
    },
  }, [
    element("div", { className: "support-details-content" }, [
      element("section", {}, [element("h3", { text: "Validation" }), issueList(issues)]),
      element("section", {}, [
        element("h3", { text: "QMK JSON" }),
        element("pre", { text: JSON.stringify(qmkJson, null, 2) }),
      ]),
      element("section", {}, [
        element("h3", { text: "Environment" }),
        definitionList([
          ["Local build", state.qmkDetected ? "Ready" : "Missing qmk"],
          ["Keyboard", detected?.displayName ?? state.keyboard.displayName],
          ["Device", detected ? `${detected.device.vid}:${detected.device.pid}` : "Preset"],
        ]),
      ]),
      element("section", {}, [
        element("h3", { text: "Bundle" }),
        element("p", {
          className: "muted",
          text: "Downloads project identity, doctor findings, and macro actions for sharing.",
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
