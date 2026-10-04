import { AdvancedAssignment, LayerAssignmentAction, layerAssignmentActions, layerKeycode, layerTapKeycode, modTapKeycode, modTapModifiers, parseAdvancedAssignment, suggestedLayerTarget } from "../advancedAssignments";
import { EditorState, RenderActions, activeLightingProfile, currentLayer } from "../appState";
import { Assignment, KeyboardDefinition, VisualKey } from "../domain";
import { MacroRecord } from "../macros";
import { illuminationBase } from "../illumination";
import { KeyLayerDetail, KeyLightingDetail, KeyRelation, KeyShortcut, SelectedKeyContext, buildSelectedKeyContext, lightingForKey } from "../keyDetails";
import { KeycodeEntry, formatKeycap, keycodeCategories } from "../keycodes";
import { layerStrip } from "./panels";
import { KEY_LABEL_INSET, KEY_LABEL_UNIT, colorPicker, colorSwatch, contextDisclosure, controlGroup, definitionRow, element, fieldControl, keycapLabel, layoutBounds, optionSelect, parameterBlock, settingsGroup, textInput, uiButton } from "./primitives";
/** Board only, no side rail — used where the surrounding view owns the rail. */
export function keyboardBoard(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const canvas = element("div", {
    className: "keyboard-scroll keyboard-canvas",
    attrs: { "aria-label": "Keyboard layout", "data-keyboard-canvas": "true" },
  }, [
    board(state, layout, actions.selectKey),
  ]);
  const stage = element("section", {
    className: "keyboard-stage workbench-stage",
    attrs: { "data-keyboard-stage": "true" },
  }, [
    canvas,
    selectedKeyInfoPanel(state, layout),
  ]);
  stage.style.width = "100%";
  return stage;
}

export function keyboardWorkspace(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  return element("section", {
    className: "keyboard-workspace",
    attrs: { "data-keyboard-workspace": "true" },
  }, [
    keyboardBoard(state, layout, actions),
    workspaceControls(state, layout, actions),
  ]);
}

export function selectedKeyInfoPanel(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
): HTMLElement {
  const context = buildSelectedKeyContext(
    state.project,
    layout.keys,
    state.selectedLayerIndex,
    state.selectedKeyId,
    illuminationBase(state.hardwareSnapshot),
  );
  const fallbackKey = layout.keys[0];

  return element("aside", {
    className: "key-info-panel workbench-inspector",
    attrs: {
      "aria-label": "Selected key inspector",
      "data-key-info-panel": "true",
    },
  }, [
    element("div", { className: "panel-heading" }, [
      element("h2", { text: "Selected key" }),
      element("small", { text: context?.selectedAssignment?.label ?? fallbackKey.label ?? fallbackKey.id }),
    ]),
    controlGroup("key-context", "Key context", [
      context
        ? selectedKeySummary(context)
        : element("dl", {}, selectedKeyRows(fallbackKey, currentLayer(state))),
    ]),
    context ? selectedKeyDetails(context) : element("div"),
  ]);
}

/**
 * The keymap view's right rail: pick a layer, assign a keycode to the selected
 * key, and see what that key does on every layer. No tabs — the board is the
 * primary surface and this only ever talks about the selected key.
 */
export function workspaceControls(
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
    settingsGroup("assignment", "Assign keycode", [
      inspector(state, layout, actions),
    ]),
    settingsGroup("key", "Selected key", [
      selectedKeyInfoPanel(state, layout),
    ]),
  ]);
}

export function macroEditor(state: EditorState, actions: RenderActions): HTMLElement {
  const wrap = element("div", {
    className: "macro-editor",
    attrs: { "data-macro-editor": "true" },
  });
  const macros = state.project.macros ?? [];
  macros.forEach((macro) => {
    const macroRecord = macro as MacroRecord;
    const row = element("div", {
      className: "macro-row",
      attrs: { "data-macro": macro.id },
    }, [
      element("strong", { text: macro.name ?? macro.id }),
      element("small", { text: `export: ${macro.exportMode ?? "json"}` }),
      element("small", { text: macroRecord.actions ?? "" }),
    ]);
    const remove = uiButton({
      className: "secondary-action",
      text: "Remove",
      type: "button",
      attrs: { "data-macro-remove": "true" },
    });
    remove.addEventListener("click", () => actions.removeMacro(macro.id));
    row.append(remove);
    wrap.append(row);
  });
  const nameInput = textInput("Macro name", "macro-name", "");
  const actionsInput = textInput("Actions", "macro-actions", "");
  const add = uiButton({
    className: "secondary-action",
    text: "Add macro",
    type: "button",
    attrs: { "data-macro-add": "true" },
  });
  add.addEventListener("click", () => {
    actions.addMacro(nameInput.value, actionsInput.value);
  });
  wrap.append(nameInput, actionsInput, add);
  return wrap;
}

export function historyControls(state: EditorState, actions: RenderActions): HTMLElement {
  const undo = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Undo",
    attrs: {
      "data-editor-undo": "true",
      ...(state.commandHistory.canUndo() ? {} : { disabled: "" }),
    },
  });
  undo.addEventListener("click", actions.undo);
  const redo = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Redo",
    attrs: {
      "data-editor-redo": "true",
      ...(state.commandHistory.canRedo() ? {} : { disabled: "" }),
    },
  });
  redo.addEventListener("click", actions.redo);
  return element("div", { className: "history-controls" }, [undo, redo]);
}

export function board(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  selectKey: (keyId: string, additive?: boolean) => void,
): HTMLElement {
  const selectedLayer = currentLayer(state);
  const profile = activeLightingProfile(state.project);
  const base = illuminationBase(state.hardwareSnapshot);
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
  panel.style.aspectRatio = `${bounds.width} / ${bounds.height}`;

  layout.keys.forEach((key) => {
    const assignment = selectedLayer?.assignments.find((item) => item.visualKeyId === key.id);
    const selected = state.selectedKeyIds.includes(key.id);
    const keyButton = keyboardKey({
      assignment,
      key,
      lighting: lightingForKey(profile, key.id, base),
      selected,
      selectedLayer,
      bounds,
    });
    keyButton.addEventListener("click", (event) => {
      selectKey(key.id, event.ctrlKey || event.metaKey || event.shiftKey);
    });
    panel.append(keyButton);
  });

  panel.addEventListener("keydown", (event) => {
    const direction = keyboardDirection(event.key);
    if (!direction) {
      return;
    }
    const next = neighborKey(layout.keys, state.selectedKeyId, direction);
    if (!next) {
      return;
    }
    event.preventDefault();
    selectKey(next);
    panel.querySelector<HTMLElement>(`[data-key="${next}"]`)?.focus();
  });

  return panel;
}

function keyboardDirection(key: string): "left" | "right" | "up" | "down" | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

function neighborKey(
  keys: readonly VisualKey[],
  currentId: string,
  direction: "left" | "right" | "up" | "down",
): string | null {
  const current = keys.find((key) => key.id === currentId);
  if (!current) {
    return null;
  }
  const candidates = keys.filter((key) => key.id !== currentId);
  if (direction === "left" || direction === "right") {
    const row = candidates.filter((key) => Math.abs(key.y - current.y) < 0.75);
    const targets =
      direction === "left"
        ? row.filter((key) => key.x < current.x).sort((a, b) => b.x - a.x)
        : row.filter((key) => key.x > current.x).sort((a, b) => a.x - b.x);
    return targets[0]?.id ?? null;
  }
  const currentCenter = current.x + (current.w ?? 1) / 2;
  const column = candidates.filter(
    (key) => Math.abs(key.x + (key.w ?? 1) / 2 - currentCenter) < 0.75,
  );
  const targets =
    direction === "up"
      ? column.filter((key) => key.y < current.y).sort((a, b) => b.y - a.y)
      : column.filter((key) => key.y > current.y).sort((a, b) => a.y - b.y);
  return targets[0]?.id ?? null;
}

export function inspector(
  state: EditorState,
  layout: KeyboardDefinition["layouts"][number],
  actions: RenderActions,
): HTMLElement {
  const base = illuminationBase(state.hardwareSnapshot);
  const context = buildSelectedKeyContext(
    state.project,
    layout.keys,
    state.selectedLayerIndex,
    state.selectedKeyId,
    base,
  );
  const key = context?.key ?? layout.keys[0];
  const layer = currentLayer(state);
  const assignment = layer?.assignments.find((item) => item.visualKeyId === key.id);
  const color =
    context?.lighting.color ?? lightingForKey(activeLightingProfile(state.project), key.id, base).color;

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

  const picker = colorPicker({
    label: "Selected keys colour",
    value: color,
    focusId: "selected-lighting-color",
    onPreview: previewLightingColor,
    onCommit: actions.updateSelectedLighting,
  });

  return element("section", { className: "inspector", attrs: { "data-context-section": "assignment" } }, [
    controlGroup("key-assignment", "Key assignment", [
      element("div", { className: "selected-command-row" }, [
        fieldControl("QMK keycode", keycodeInput),
      ]),
      fieldControl("Selected keys colour", picker),
    ]),
    controlGroup("assignment-tools", "Assignment tools", [
      element("div", { className: "context-disclosures" }, [
        contextDisclosure("Assignment tools", "assignment-tools", [
          assignmentEditor(state, assignment, actions),
        ]),
        contextDisclosure("Keycode palette", "keycode-palette", [
          keycodePalette(state, actions),
        ]),
      ]),
    ]),
  ]);
}

export function assignmentEditor(
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
    [assignmentHeader(), ...assignmentFields(state, parsed, actions)],
  );
}

export function assignmentTemplates(state: EditorState, actions: RenderActions): HTMLElement {
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
    [assignmentHeader(), grid],
  );
}

export function assignmentHeader(): HTMLElement {
  return element("div", { className: "assignment-header" }, [
    element("h3", { text: "Assignment" }),
  ]);
}

export function assignmentFields(
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

export function layerAssignmentFields(
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

export function layerTapAssignmentFields(
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

export function modTapAssignmentFields(
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

export function layerSelect(state: EditorState, selectedLayerIndex: number): HTMLSelectElement {
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

export function selectedKeySummary(context: SelectedKeyContext): HTMLElement {
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

export function selectedKeyDetails(context: SelectedKeyContext): HTMLElement {
  return element("div", { className: "key-details" }, [
    keyLayerList(context.layers),
    keyLightingDetails(context),
    keyRelationList(context.relations, context.shortcuts),
  ]);
}

export function keyLayerList(layers: KeyLayerDetail[]): HTMLElement {
  const list = element("div", {
    className: "layer-functions",
    attrs: { "data-key-detail-section": "layers" },
  });
  layers.forEach((detail) => {
    list.append(keyLayerRow(detail));
  });

  return controlGroup("key-functions", "Layer functions", [
    list,
  ]);
}

export function keyLayerRow(detail: KeyLayerDetail): HTMLElement {
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

export function keyLightingDetails(context: SelectedKeyContext): HTMLElement {
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

  return controlGroup("key-lighting", "Lighting", [
    parameterBlock("Current profile", [
      element("dl", { attrs: { "data-selected-lighting": context.key.id } }, [
        definitionRow("Profile", lighting.profileName),
        definitionRow("Mode", lighting.mode),
        definitionRow("Configured color", lighting.color),
        definitionRow("Map display", lighting.mode === "off" ? "Off" : "Illuminated"),
      ]),
    ]),
    parameterBlock("Effects / conditions", [conditionList]),
  ]);
}

export function keyRelationList(relations: KeyRelation[], shortcuts: KeyShortcut[]): HTMLElement {
  const list = element("div", {
    className: "relation-list",
    attrs: { "data-key-detail-section": "relations" },
  });
  relations.forEach((relation) => {
    list.append(relationRow(relation));
  });

  return controlGroup("key-relations", "Relations", [
    list,
  ]);
}

export function relationRow(relation: KeyRelation): HTMLElement {
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

export function keycodePalette(state: EditorState, actions: RenderActions): HTMLElement {
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

  return element("section", { className: "keycode-browser" }, [
    element("h3", { text: "Keycodes" }),
    searchInput,
    tabs,
    grid,
  ]);
}

export function visibleKeycodes(state: EditorState): KeycodeEntry[] {
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

export function keycodeButton(
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

export function selectedKeyRows(
  key: VisualKey,
  layer: ReturnType<typeof currentLayer>,
): HTMLElement[] {
  const rows = [definitionRow("Key", key.label ?? key.id), definitionRow("Layer", layer?.name ?? "")];
  if (key.matrix) {
    rows.push(definitionRow("Matrix", `${key.matrix.row}, ${key.matrix.col}`));
  }
  return rows;
}

export function keyAriaLabel(
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

export function keyboardKey({
  assignment,
  key,
  lighting,
  selected,
  selectedLayer,
  bounds,
}: {
  assignment: Assignment | undefined;
  key: VisualKey;
  lighting: KeyLightingDetail;
  selected: boolean;
  selectedLayer: ReturnType<typeof currentLayer>;
  bounds: ReturnType<typeof layoutBounds>;
}): HTMLElement {
  const effectNames = lighting.conditions.map((condition) => condition.name);
  const effectSummary = effectNames.join(", ");
  const lightingSummary = [
    `Configured color ${lighting.color}`,
    lighting.mode === "off" ? "lighting off" : `${lighting.mode} lighting active`,
    effectSummary ? `effects: ${effectSummary}` : "no effects",
  ].join("; ");
  // Mirror the profile's actual lighting state: the key tint carries the
  // configured color scaled by RGB Matrix brightness, and a key only reads as
  // lit when the mode is on and brightness is above zero.
  const lit = lighting.mode !== "off" && lighting.brightness > 0;
  const keyButton = element("qmk-key", {
    className: `key ${selected ? "selected" : ""}`,
    attrs: {
      "aria-label": `${keyAriaLabel(selectedLayer, key, assignment)}. ${lightingSummary}.`,
      "aria-pressed": String(selected),
      "data-key": key.id,
      "data-lighting-active": String(lit),
      "data-lighting-brightness": String(lighting.brightness),
      "data-lighting-color": lighting.color,
      "data-lighting-effects": effectSummary,
      "data-lighting-mode": lighting.mode,
      role: "button",
      tabindex: "0",
      title: lightingSummary,
    },
  });
  keyButton.style.left = `${(key.x / bounds.width) * 100}%`;
  keyButton.style.top = `${(key.y / bounds.height) * 100}%`;
  keyButton.style.width = `calc(${((key.w ?? 1) / bounds.width) * 100}% - var(--key-gap))`;
  keyButton.style.height = `calc(${((key.h ?? 1) / bounds.height) * 100}% - var(--key-gap))`;
  if (lighting.color) {
    keyButton.style.setProperty("--key-light", dimHex(lighting.color, lighting.brightness / 255));
  }
  const label = keycapLabel(assignment, { compact: true });
  keyButton.style.setProperty("--key-label-size", keyLabelSize(label, key));
  keyButton.append(element("strong", { text: label }));
  if (lighting.conditions.length > 0) {
    keyButton.append(
      element("span", {
        className: "key-lighting-effect",
        text: lighting.conditions.length > 1 ? `FX ${lighting.conditions.length}` : "FX",
        attrs: {
          "aria-hidden": "true",
          "data-key-lighting-effect": lighting.conditions[0].id,
          title: effectSummary,
        },
      }),
    );
  }
  keyButton.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    keyButton.click();
  });
  return keyButton;
}

/**
 * Repaint the selected keys and colour readouts while the picker is being
 * dragged. Deliberately touches the DOM directly instead of re-rendering, so
 * the picker keeps pointer capture and the gesture is not interrupted.
 */
export function previewLightingColor(color: string): void {
  document.querySelectorAll<HTMLElement>("[data-key].selected").forEach((key) => {
    // Only lit keys carry the tint, matching the committed render.
    if (key.dataset.lightingActive !== "true") {
      return;
    }
    const brightness = Number(key.dataset.lightingBrightness);
    key.style.setProperty("--key-light", dimHex(color, brightness / 255));
    key.setAttribute("data-lighting-color", color);
  });
  document.querySelectorAll<HTMLElement>("[data-lighting-color-readout]").forEach((node) => {
    node.textContent = color;
  });
}

/**
 * Scale a hex color toward the board's dark base by `factor` (0 = base, 1 =
 * unchanged), so the keymap mirrors the profile's brightness.
 */
export function dimHex(hex: string, factor: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return hex;
  }
  const clamped = Math.max(0, Math.min(1, factor));
  const value = Number.parseInt(match[1], 16);
  const base = 0x182631;
  const channel = (shift: number) => {
    const source = (value >> shift) & 0xff;
    const target = (base >> shift) & 0xff;
    return Math.round(target + (source - target) * clamped);
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
}

export function keyLabelSize(label: string, key: VisualKey): string {
  if (!label) {
    return "12px";
  }
  const availableWidth = Math.max(1, (key.w ?? 1) * KEY_LABEL_UNIT - KEY_LABEL_INSET - 12);
  const widthPerCharacter = label.length <= 3 ? 0.78 : 0.7;
  const size = Math.min(12, Math.max(7, Math.floor(availableWidth / (label.length * widthPerCharacter))));
  return `${size}px`;
}
