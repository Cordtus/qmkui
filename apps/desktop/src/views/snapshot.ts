import { EditorState, RenderActions, isKeychronV5MaxSnapshot } from "../appState";
import { GenericViaStandardState } from "../devices/genericViaReader";
import { KeychronV5MaxCapabilities, KeychronV5MaxIdentityFacts, KeychronV5MaxLighting, KeychronV5MaxReadSnapshot } from "../devices/keychronV5MaxReader";
import { ViaKeymap, ViaMacros, ViaMacroStep } from "../devices/viaReadProtocol";
import { decodeHardwareKeycode, isSysRqKeycode } from "../keycodes";
import { keychronV5MaxKeyboard } from "../presets";
import { definitionList, definitionRow, element, layoutBounds, uiButton } from "./primitives";

export function snapshotContent(state: EditorState, actions: RenderActions): HTMLElement {
  const snapshot = state.hardwareSnapshot!;
  if (!isKeychronV5MaxSnapshot(snapshot)) {
    return genericViaSnapshotContent(snapshot, state, actions);
  }
  const title = snapshot.identity.state === "available" ? snapshot.identity.value.model : "Keyboard";

  return element("section", { className: "snapshot-shell", attrs: { "data-hardware-snapshot": "true", "data-source": "hardware" } }, [
    snapshotHeader(title, state, actions),
    element("section", { className: "snapshot-grid" }, [
      snapshotKeymapField(
        snapshot.keymap,
        state.snapshotLayerIndex,
        actions.selectSnapshotLayer,
        state.snapshotSelectedKey,
        actions.selectSnapshotKey,
      ),
      snapshotField("Identity", snapshot.identity, identitySnapshotRows),
      snapshotField("Capabilities", snapshot.capabilities, capabilitySnapshotRows),
      snapshotLightingField(snapshot.lighting),
      snapshotField("Macros", snapshot.macros, macrosSnapshotRows),
    ]),
    deviceWriteControls(state, actions, {
      description: `Selected key ${state.snapshotSelectedKey} on layer ${state.snapshotLayerIndex}.`,
      controls: (confirmed) => {
        const keycodeInput = element("input", {
          attrs: {
            "aria-label": "Keycode (hex)",
            "data-write-keycode": "true",
            placeholder: "0046",
          },
        });
        const writeKey = uiButton({
          className: "secondary-action",
          type: "button",
          text: "Write key",
          attrs: { "data-device-write-key": "true" },
        });
        writeKey.addEventListener("click", () => {
          const value = Number.parseInt(keycodeInput.value.trim(), 16);
          if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
            actions.writeSnapshotKeycode(NaN, false);
            return;
          }
          actions.writeSnapshotKeycode(value, confirmed());
        });
        return [keycodeInput, writeKey];
      },
    }),
  ]);
}

/**
 * Shared header for both snapshot variants: device refresh plus "choose
 * another keyboard". Keeping one builder stops the two snapshot screens from
 * drifting apart.
 */
function snapshotHeader(
  title: string,
  state: EditorState,
  actions: RenderActions,
): HTMLElement {
  const refresh = uiButton({
    className: "secondary-action",
    text: state.snapshotReadStatus === "reading" ? "Refreshing device..." : "Refresh device",
    type: "button",
    attrs: {
      "data-device-action": "refresh",
      ...(state.snapshotReadStatus === "reading" ? { disabled: "" } : {}),
    },
  });
  refresh.addEventListener("click", actions.readDevice);
  const choose = uiButton({
    className: "secondary-action",
    text: "Choose another keyboard",
    type: "button",
    attrs: { "data-device-action": "connect" },
  });
  choose.addEventListener("click", actions.chooseBrowserKeyboard);

  return element("header", { className: "snapshot-header" }, [
    element("h1", { text: title }),
    element("div", { className: "snapshot-actions" }, [refresh, choose]),
  ]);
}

/**
 * The one gated device-write surface, shared by the project editor and the
 * hardware snapshot. Writes only happen after the operator ticks the
 * confirmation checkbox; "save to EEPROM" is a separate confirmed action. The
 * write allow-list in `qmkui-hid`/`viaWrite` gates every frame.
 */
export function deviceWriteControls(
  state: EditorState,
  actions: RenderActions,
  options: { description: string; controls: (confirmed: () => boolean) => HTMLElement[] },
): HTMLElement {
  const confirmInput = element("input", {
    attrs: { "data-write-confirm": "true", type: "checkbox" },
  });
  const confirmed = () => confirmInput.checked;
  const confirm = element("label", { className: "write-confirm" }, [
    confirmInput,
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
  enable.addEventListener("click", () => actions.enableDeviceWrites(confirmed()));
  const save = uiButton({
    className: "secondary-action",
    type: "button",
    text: "Save to EEPROM",
    attrs: { "data-device-save-eeprom": "true" },
  });
  save.addEventListener("click", () => actions.saveEepromToDevice(confirmed()));

  return element("section", {
    className: "device-write-controls",
    attrs: { "data-device-write-controls": "true" },
  }, [
    element("h3", { text: "Device write" }),
    element("p", { text: options.description }),
    confirm,
    element("div", { className: "device-write-actions" }, [
      enable,
      ...options.controls(confirmed),
      save,
    ]),
    ...(state.deviceWriteStatus
      ? [
          element("p", {
            className: "device-write-status",
            text: state.deviceWriteStatus,
            attrs: { "data-write-status": "true" },
          }),
        ]
      : []),
  ]);
}

export function genericViaSnapshotContent(
  snapshot: GenericViaStandardState,
  state: EditorState,
  actions: RenderActions,
): HTMLElement {
  return element("section", { className: "snapshot-shell", attrs: { "data-hardware-snapshot": "true", "data-source": "hardware" } }, [
    snapshotHeader("VIA", state, actions),
    element("section", { className: "snapshot-grid" }, [
      snapshotGroup("Device", [
        snapshotField("Identity", snapshot.identity, () => []),
      ]),
      snapshotGroup("Protocol", [
        genericValueField("Protocol version", snapshot.protocolVersion, (version) => `0x${version.toString(16).padStart(4, "0")}`),
        genericValueField("Uptime", snapshot.uptime),
        genericValueField("Layout options", snapshot.layoutOptions),
        genericValueField("Firmware version", snapshot.firmwareVersion),
        genericValueField("Keycodes version", snapshot.keycodesVersion),
        genericValueField("Layer count", snapshot.layerCount),
      ]),
      snapshotGroup("Keymap", [
        snapshotField("Keymap", snapshot.keymap, () => []),
        snapshotField("Switch matrix", snapshot.switchMatrix, () => []),
      ]),
      snapshotGroup("Lighting", [
        genericValueField("Backlight effect", snapshot.lighting.backlightEffect),
        genericValueField("Backlight brightness", snapshot.lighting.backlightBrightness),
        genericValueField("RGB light effect", snapshot.lighting.rgblightEffect),
        genericValueField("RGB light hue", snapshot.lighting.rgblightHue),
        genericValueField("RGB light saturation", snapshot.lighting.rgblightSaturation),
        genericValueField("RGB light value", snapshot.lighting.rgblightValue),
        genericValueField("RGB matrix effect", snapshot.lighting.rgbMatrixEffect),
        genericValueField("RGB matrix hue", snapshot.lighting.rgbMatrixHue),
        genericValueField("RGB matrix saturation", snapshot.lighting.rgbMatrixSaturation),
        genericValueField("RGB matrix value", snapshot.lighting.rgbMatrixValue),
        genericValueField("LED matrix effect", snapshot.lighting.ledMatrixEffect),
        genericValueField("LED matrix brightness", snapshot.lighting.ledMatrixBrightness),
      ]),
    ]),
  ]);
}

export function genericValueField(
  label: string,
  field: { state: "available" | "unavailable" | "unverified"; value?: number; reason?: string },
  format: (value: number) => string = String,
): HTMLElement {
  return snapshotField(label, field, (value) => [["", format(value)]]);
}

export function snapshotField(
  label: string,
  field: { state: "available" | "unavailable" | "unverified"; value?: unknown; reason?: string },
  rows: (value: any) => Array<[string, string]>,
): HTMLElement {
  const available = field.state === "available";
  return element("section", {
    className: `snapshot-field ${field.state}`,
    attrs: { "data-snapshot-field": label.toLowerCase().replaceAll(" ", "-"), "data-snapshot-state": field.state },
  }, [
    element("h2", { text: label }),
    available
      ? definitionList(rows(field.value))
      : element("p", { className: "snapshot-reason", text: field.reason ?? "Unavailable" }),
  ]);
}

export function snapshotGroup(title: string, children: HTMLElement[]): HTMLElement {
  return element("section", {
    className: "snapshot-group",
    attrs: { "data-snapshot-group": title.toLowerCase().replaceAll(" ", "-") },
  }, [
    element("h3", { className: "snapshot-group-title", text: title }),
    element("div", { className: "snapshot-group-fields" }, children),
  ]);
}

export function identitySnapshotRows(value: KeychronV5MaxIdentityFacts): Array<[string, string]> {
  return [
    ["Model", value.model],
    ["Firmware", value.firmwareVersion],
    ["Protocol", value.protocolVersion.map((part) => `0x${part.toString(16).padStart(2, "0")}`).join(" ")],
    ["Default layer", String(value.defaultLayer)],
  ];
}

export function capabilitySnapshotRows(value: KeychronV5MaxCapabilities): Array<[string, string]> {
  return [["Feature bitmap", value.featureBitmap.map((part) => `0x${part.toString(16).padStart(2, "0")}`).join(" ")]];
}

export function keymapSnapshotRows(value: ViaKeymap): Array<[string, string]> {
  const firstKeycode = value.keycodes[0]?.[0]?.[0];
  return [
    ["Layers", String(value.layerCount)],
    ...(firstKeycode === undefined ? [] : [["First", `0x${firstKeycode.toString(16).padStart(4, "0")}`] as [string, string]]),
  ];
}

export function snapshotKeymapField(
  field: KeychronV5MaxReadSnapshot["keymap"],
  selectedLayerIndex: number,
  selectLayer: (layerIndex: number) => void,
  selectedKey: string,
  selectKey: (matrixKey: string) => void,
): HTMLElement {
  if (field.state !== "available") {
    return snapshotField("Keymap", field, keymapSnapshotRows);
  }

  const layers = field.value.keycodes;
  const selectedLayer = layers[selectedLayerIndex] ?? layers[0] ?? [];
  const layout = keychronV5MaxKeyboard.layouts[0];
  const matrixKeys = layout.keys.filter((key) => key.matrix);
  const selectedMatrix = matrixKeys.some((key) => matrixKeyId(key.matrix!) === selectedKey)
    ? selectedKey
    : matrixKeyId(matrixKeys[0]!.matrix!);
  const board = element("div", {
    className: "hardware-keymap-board",
    attrs: { "data-hardware-keymap-board": "true" },
  });
  const bounds = layoutBounds(layout.keys);
  layout.keys.forEach((key) => {
    if (!key.matrix) {
      return;
    }
    const matrix = key.matrix;
    const keycode = selectedLayer[matrix.row]?.[matrix.col];
    const matrixId = matrixKeyId(matrix);
    const hardwareKey = element("button", {
      className: "hardware-keymap-key",
      type: "button",
      attrs: {
        "data-hardware-key": matrixId,
        "data-keycode-source": "hardware",
        "aria-pressed": String(matrixId === selectedMatrix),
        ...(keycode === undefined ? {} : { title: formatHardwareKeycode(keycode) }),
      },
      text: keycode === undefined ? "Unavailable" : compactHardwareKeycode(keycode),
    });
    hardwareKey.addEventListener("click", () => selectKey(matrixId));
    hardwareKey.style.left = `${(key.x / bounds.width) * 100}%`;
    hardwareKey.style.top = `${(key.y / bounds.height) * 100}%`;
    hardwareKey.style.width = `${((key.w ?? 1) / bounds.width) * 100}%`;
    hardwareKey.style.height = `${((key.h ?? 1) / bounds.height) * 100}%`;
    board.append(hardwareKey);
  });

  const layerTabs = element("div", {
    className: "hardware-layer-tabs",
    attrs: { "data-hardware-layer-tabs": "true" },
  });
  layers.forEach((_layer, layerIndex) => {
    const tab = uiButton({
      className: "hardware-layer-tab",
      text: `Layer ${layerIndex}`,
      type: "button",
      attrs: {
        "data-hardware-layer": String(layerIndex),
        "aria-pressed": String(layerIndex === selectedLayerIndex),
      },
    });
    tab.addEventListener("click", () => selectLayer(layerIndex));
    layerTabs.append(tab);
  });

  return element("section", {
    className: "snapshot-field hardware-keymap available",
    attrs: { "data-snapshot-field": "keymap", "data-snapshot-state": "available", "data-hardware-keymap": "true" },
  }, [
    element("div", { className: "hardware-keymap-heading" }, [
      element("div", {}, [
        element("h2", { text: "Keymap" }),
        hardwareSysRqSummary(layers),
      ]),
      layerTabs,
    ]),
    board,
    snapshotKeyRoles(layers, selectedMatrix),
  ]);
}

export function matrixKeyId(matrix: { row: number; col: number }): string {
  return `${matrix.row}:${matrix.col}`;
}

export function formatHardwareKeycode(keycode: number): string {
  return `0x${keycode.toString(16).padStart(4, "0")}`;
}

export function compactHardwareKeycode(keycode: number): string {
  const label = decodeHardwareKeycode(keycode);
  return label === "None" || label === "Transparent" ? "·" : label;
}

export function hardwareSysRqSummary(layers: number[][][]): HTMLElement {
  const mapped = new Set<string>();
  layers.forEach((layer) =>
    layer.forEach((row, rowIndex) =>
      row.forEach((code, columnIndex) => {
        if (isSysRqKeycode(code)) {
          mapped.add(`${rowIndex}:${columnIndex}`);
        }
      }),
    ),
  );
  if (mapped.size === 0) {
    return element("p", {
      className: "hardware-sysrq-summary",
      text: "No key maps to Print/SysRq on any layer.",
    });
  }
  return element("p", {
    className: "hardware-sysrq-summary sysrq-found",
    text: `Print/SysRq is mapped on ${mapped.size} key(s); Alt + the key + a letter runs Magic SysRq.`,
  });
}

export function snapshotKeyRoles(layers: number[][][], matrixKey: string): HTMLElement {
  const [row, column] = matrixKey.split(":").map(Number);
  const roleNodes = layers
    .map((layer, layerIndex) => {
      const code = layer[row]?.[column];
      if (code === undefined) {
        return null;
      }
      return element("li", {
        className: `hardware-key-role${isSysRqKeycode(code) ? " sysrq" : ""}`,
        attrs: { "data-hardware-key-role": String(layerIndex) },
      }, [
        element("span", { className: "hardware-key-role-layer", text: `Layer ${layerIndex}` }),
        element("span", { className: "hardware-key-role-label", text: decodeHardwareKeycode(code) }),
        element("span", { className: "hardware-key-role-hex", text: formatHardwareKeycode(code) }),
        ...(isSysRqKeycode(code)
          ? [element("span", { className: "hardware-key-role-tag", text: "SysRq" })]
          : []),
      ]);
    })
    .filter((node): node is HTMLLIElement => node !== null);
  const sysRqHere = roleNodes.some((node) => node.classList.contains("sysrq"));
  return element("section", {
    className: "hardware-key-roles",
    attrs: { "data-hardware-key-roles": matrixKey },
  }, [
    element("h3", { text: `Key roles · ${matrixKey}` }),
    roleNodes.length === 0
      ? element("p", { text: "No keycodes reported for this position." })
      : element("ul", { className: "hardware-key-role-list" }, roleNodes),
    element("p", {
      className: "hardware-key-role-note",
      text: sysRqHere
        ? "Hold Alt + this key + a command letter for Linux Magic SysRq."
        : "This key sends no Print/SysRq on any layer.",
    }),
  ]);
}

export function lightingSnapshotRows(value: KeychronV5MaxLighting): Array<[string, string]> {
  return [
    ["Brightness", String(value.brightness)],
    ["Effect", String(value.effect)],
    ["Effect speed", String(value.effectSpeed)],
    ["Hue", String(value.hue)],
    ["Saturation", String(value.saturation)],
  ];
}

/**
 * The V5 Max exposes only global VIA RGB-matrix state (channel 3), so this is a
 * value list — there is no per-LED colour map to render as swatches.
 */
export function snapshotLightingField(field: KeychronV5MaxReadSnapshot["lighting"]): HTMLElement {
  if (field.state !== "available") {
    return snapshotField("Lighting", field, lightingSnapshotRows);
  }
  const swatch = element("span", {
    className: "lighting-swatch",
    attrs: {
      "data-hue": String(field.value.hue),
      "data-saturation": String(field.value.saturation),
      "data-value": String(field.value.brightness),
    },
  });
  swatch.style.backgroundColor = hsvToCss(field.value.hue, field.value.saturation, field.value.brightness);
  return element("section", {
    className: "snapshot-field lighting available",
    attrs: { "data-snapshot-field": "lighting", "data-snapshot-state": "available" },
  }, [
    element("h2", { text: "Lighting" }),
    element("div", { className: "lighting-swatches", attrs: { "data-lighting-swatches": "true" } }, [swatch]),
    definitionList(lightingSnapshotRows(field.value)),
  ]);
}

function hsvToCss(hue: number, saturation: number, value: number): string {
  return `hsl(${Math.round((hue / 255) * 360)} ${Math.round((saturation / 255) * 100)}% ${Math.round((value / 255) * 100)}%)`;
}

export function macrosSnapshotRows(value: ViaMacros): Array<[string, string]> {
  if (value.count === 0) {
    return [["Macros", "None configured"]];
  }
  return [
    ["Count", String(value.count)],
    ...value.macros.map((steps, index) => [
      `Macro ${index + 1}`,
      steps.map(formatMacroStep).join(""),
    ] as [string, string]),
  ];
}

function formatMacroStep(step: ViaMacroStep): string {
  if (step.kind === "char") {
    return step.char;
  }
  const label = decodeHardwareKeycode(step.keycode);
  return step.kind === "tap" ? `{${label}}` : step.kind === "down" ? `{+${label}}` : `{-${label}}`;
}
