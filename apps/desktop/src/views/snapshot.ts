import { EditorState, RenderActions, isKeychronV5MaxSnapshot, keyboardForSelection, safetyAssessment } from "../appState";
import { hsv255ToHex } from "../color";
import type { KeyboardDefinition } from "../domain";
import { GenericViaStandardState } from "../devices/genericViaReader";
import { KeychronV5MaxIdentityFacts, KeychronV5MaxLighting, KeychronV5MaxReadSnapshot } from "../devices/keychronV5MaxReader";
import { ViaKeymap, ViaMacros, ViaMacroStep } from "../devices/viaReadProtocol";
import { illuminationBase, type IlluminationBase } from "../illumination";
import { dimHex, inkFor } from "../color";
import { decodeHardwareKeycode, isSysRqKeycode } from "../keycodes";
import { keychronV5MaxKeyboard } from "../presets";
import { icon, type IconName } from "../icons";
import { contextDisclosure, definitionList, element, layoutBounds, uiButton } from "./primitives";

export function snapshotContent(state: EditorState, actions: RenderActions): HTMLElement {
  const snapshot = state.hardwareSnapshot!;
  if (!isKeychronV5MaxSnapshot(snapshot)) {
    return genericViaSnapshotContent(snapshot);
  }
  // Render the connected model's own layout, not a fixed preset: an unknown
  // model falls back to the current project's keyboard.
  const keyboard = keyboardForSelection(state.deviceSelection) ?? state.keyboard;

  return element("section", { className: "view-stack snapshot-grid", attrs: { "data-hardware-snapshot": "true", "data-source": "hardware" } }, [
    deviceStatusStrip(snapshot, keyboard, state, actions),
    snapshotKeymapField(
      snapshot.keymap,
      state.snapshotLayerIndex,
      actions.selectSnapshotLayer,
      state.snapshotSelectedKey,
      actions.selectSnapshotKey,
      keyboard,
      illuminationBase(snapshot),
    ),
    snapshotLightingField(snapshot.lighting, actions.refreshLighting),
    safetyPanel(state, actions),
    contextDisclosure("Device facts", "device-facts", [
      element("div", { className: "snapshot-group-fields" }, [
        snapshotField("Identity", snapshot.identity, identitySnapshotRows),
        capabilityField(snapshot),
        snapshotField("Macros", snapshot.macros, macrosSnapshotRows),
      ]),
    ]),
    snapshot.keymap.state === "available"
      ? deviceWriteControls(state, actions, {
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
          lightingSave: true,
        })
      : deviceWriteUnavailable(),
  ]);
}

function deviceWriteUnavailable(): HTMLElement {
  return element("section", {
    className: "device-write-controls blocked",
    attrs: {
      "data-device-write-controls": "true",
      "data-write-blocked": "true",
    },
  }, [
    element("h3", { text: "Device write" }),
    element("p", {
      text: "Device writes are disabled until the keymap read succeeds; re-read the device to select a verified target.",
    }),
  ]);
}

/** One-line identity strip; details stay available in Device facts. */
function deviceStatusStrip(
  snapshot: KeychronV5MaxReadSnapshot,
  keyboard: KeyboardDefinition,
  state: EditorState,
  actions: RenderActions,
): HTMLElement {
  const identity = snapshot.identity.state === "available" ? snapshot.identity.value : undefined;
  const usb = keyboard.usb;
  const tester = uiButton({
    className: "secondary-action compact",
    type: "button",
    text: state.keyTesterOpen ? "Hide key test" : "Test keys",
    attrs: {
      "aria-pressed": String(state.keyTesterOpen),
      "data-key-tester-toggle": "true",
      title: "Press keys on the board and see what the host receives",
    },
  });
  tester.addEventListener("click", actions.toggleKeyTester);
  return element("section", {
    className: "device-status-strip",
    attrs: { "data-device-status": "true" },
  }, [
    icon("usb", { size: 18, className: "device-status-icon" }),
    element("div", { className: "device-status-copy" }, [
      element("strong", { text: identity?.model ?? keyboard.displayName }),
      element("small", {
        text: [
          identity ? `Firmware ${identity.firmwareVersion}` : "Firmware unknown",
          identity
            ? `Protocol ${identity.protocolVersion.map((part) => `0x${part.toString(16).padStart(2, "0")}`).join(" ")}`
            : "Protocol unknown",
          usb ? `${usb.vid}:${usb.pid}` : "USB id unknown",
        ].join(" · "),
      }),
    ]),
    tester,
    element("span", { className: "status-chip ready", text: "Connected" }),
  ]);
}

/**
 * Recovery state for the exact project/device pair. The ledger is private and
 * local-only; the bundle is the operator's restore point before a write.
 */
export function safetyPanel(state: EditorState, actions: RenderActions): HTMLElement {
  const assessment = safetyAssessment(state);
  const ledger = state.safetyLedgerStorage.load();
  const latest = [...ledger.events]
    .reverse()
    .find(
      (event) =>
        event.projectRevision === assessment.projectRevision &&
        event.deviceRevision === assessment.deviceRevision,
    );
  const label = {
    blocked: "Blocked",
    backupRequired: "Backup required",
    backupRecorded: "Backup recorded",
    declined: "Backup declined",
  }[assessment.state];
  const actionsRow = element("div", { className: "safety-actions" });
  if (assessment.state === "backupRequired" || assessment.state === "backupRecorded") {
    const download = uiButton({
      className: "secondary-action",
      type: "button",
      text:
        assessment.state === "backupRecorded"
          ? "Download recovery bundle again"
          : "Download recovery bundle",
      attrs: { "data-recovery-download": "true" },
    });
    download.addEventListener("click", actions.downloadRecoveryBundle);
    actionsRow.append(download);
    if (assessment.state === "backupRequired") {
      const decline = uiButton({
        className: "secondary-action",
        type: "button",
        text: "Decline backup",
        attrs: { "data-recovery-decline": "true" },
      });
      decline.addEventListener("click", actions.declineRecovery);
      actionsRow.append(decline);
    }
  }
  if (latest) {
    const audit = uiButton({
      className: "secondary-action",
      type: "button",
      text: "Download audit receipt",
      attrs: { "data-safety-audit": "true" },
    });
    audit.addEventListener("click", actions.downloadSafetyAudit);
    actionsRow.append(audit);
  }

  return element("section", {
    className: `safety-panel ${assessment.state}`,
    attrs: {
      "data-safety-panel": "true",
      "data-safety-state": assessment.state,
    },
  }, [
    element("div", { className: "safety-heading" }, [
      icon("lock", { size: 15 }),
      element("strong", { text: "Recovery" }),
      element("span", { className: "status-chip", text: label }),
    ]),
    element("p", { text: assessment.reason }),
    element("small", {
      text: "Advisory: this panel does not gate device writes; the write confirmation remains the gate.",
    }),
    element("small", {
      text: `${ledger.events.length} local event${ledger.events.length === 1 ? "" : "s"} · ledger ${state.safetyLedgerStorage.availability()}`,
    }),
    ...(actionsRow.childElementCount > 0 ? [actionsRow] : []),
  ]);
}

/**
 * The one gated device-write surface, shared by the project editor and the
 * hardware snapshot. Writes only happen after the operator ticks the
 * confirmation checkbox. Keycode writes persist to EEPROM immediately;
 * "save lighting to EEPROM" is a separate confirmed action (channel-3 save).
 * The write allow-list in `qmkui-hid`/`viaWrite` gates every frame.
 */
export function deviceWriteControls(
  state: EditorState,
  actions: RenderActions,
  options: {
    description: string;
    controls: (confirmed: () => boolean) => HTMLElement[];
    /** Show the channel-3 "save lighting to EEPROM" action. Default true. */
    lightingSave?: boolean;
    /** Short explanation shown under the write actions. */
    note?: string;
    /** One-row strip for the board footer. */
    compact?: boolean;
  },
): HTMLElement {
  const confirmInput = element("input", {
    attrs: { "data-write-confirm": "true", type: "checkbox" },
  });
  const confirmed = () => confirmInput.checked;
  const confirm = element("label", { className: "write-confirm" }, [
    confirmInput,
    element("span", { text: "I understand this writes to the connected device." }),
  ]);
  const enable = uiButton(
    {
      className: "secondary-action",
      type: "button",
      attrs: {
        "data-device-write-enable": "true",
        title: state.deviceWriteEnabled
          ? "Device writes are enabled for this session"
          : "Enable device writes for this session",
        ...(state.deviceWriteEnabled ? { disabled: "" } : {}),
      },
    },
    [
      icon(state.deviceWriteEnabled ? "check-circle" : "lock", { size: 15 }),
      element("span", { text: state.deviceWriteEnabled ? "Writes on" : "Enable writes" }),
    ],
  );
  enable.addEventListener("click", () => actions.enableDeviceWrites(confirmed()));
  const save = options.compact
    ? uiButton(
        {
          className: "icon-action",
          type: "button",
          attrs: {
            "aria-label": "Persist lighting",
            "data-device-save-lighting": "true",
            title: "Store the current RGB state in the keyboard EEPROM so it survives power cycles",
          },
        },
        [icon("floppy-disk", { size: 17 })],
      )
    : uiButton(
        {
          className: "secondary-action",
          type: "button",
          attrs: {
            "data-device-save-lighting": "true",
            title: "Store the current RGB state in the keyboard EEPROM so it survives power cycles",
          },
        },
        [icon("floppy-disk", { size: 15 }), element("span", { text: "Persist lighting" })],
      );
  save.addEventListener("click", () => actions.saveLightingToDevice(confirmed()));

  if (options.compact) {
    return element("section", {
      className: "device-write-controls compact",
      attrs: {
        "data-device-write-controls": "true",
        title: options.description,
      },
    }, [
      element("div", { className: "write-bar" }, [
        element("label", { className: "write-confirm compact" }, [
          confirmInput,
          element("span", { text: "Confirm writes" }),
        ]),
        enable,
        element("div", { className: "write-bar-actions" }, [
          ...options.controls(confirmed),
          ...(options.lightingSave === false ? [] : [save]),
        ]),
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
      ...(options.lightingSave === false ? [] : [save]),
    ]),
    ...(options.note ? [element("p", { className: "hint", text: options.note })] : []),
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
): HTMLElement {
  return element("section", { className: "view-stack snapshot-grid", attrs: { "data-hardware-snapshot": "true", "data-source": "hardware" } }, [
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
      genericValueField("Backlight brightness", snapshot.lighting.backlightBrightness),
      genericValueField("Backlight effect", snapshot.lighting.backlightEffect),
      genericValueField("RGB light brightness", snapshot.lighting.rgblightBrightness),
      genericValueField("RGB light effect", snapshot.lighting.rgblightEffect),
      genericValueField("RGB light effect speed", snapshot.lighting.rgblightEffectSpeed),
      genericValueField("RGB light hue", snapshot.lighting.rgblightHue),
      genericValueField("RGB light saturation", snapshot.lighting.rgblightSaturation),
      genericValueField("RGB matrix brightness", snapshot.lighting.rgbMatrixBrightness),
      genericValueField("RGB matrix effect", snapshot.lighting.rgbMatrixEffect),
      genericValueField("RGB matrix effect speed", snapshot.lighting.rgbMatrixEffectSpeed),
      genericValueField("RGB matrix hue", snapshot.lighting.rgbMatrixHue),
      genericValueField("RGB matrix saturation", snapshot.lighting.rgbMatrixSaturation),
      genericValueField("LED matrix brightness", snapshot.lighting.ledMatrixBrightness),
      genericValueField("LED matrix effect", snapshot.lighting.ledMatrixEffect),
      genericValueField("LED matrix effect speed", snapshot.lighting.ledMatrixEffectSpeed),
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

export function snapshotField<Value>(
  label: string,
  field: { state: "available" | "unavailable" | "unverified"; value?: Value; reason?: string },
  rows: (value: Value) => Array<[string, string]>,
): HTMLElement {
  const available = field.state === "available";
  return element("section", {
    className: `snapshot-field ${field.state}`,
    attrs: { "data-snapshot-field": label.toLowerCase().replaceAll(" ", "-"), "data-snapshot-state": field.state },
  }, [
    element("h2", { text: label }),
    available
      ? definitionList(rows(field.value as Value))
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
  keyboard: KeyboardDefinition = keychronV5MaxKeyboard,
  base: IlluminationBase | null = null,
): HTMLElement {
  if (field.state !== "available") {
    return snapshotField("Keymap", field, keymapSnapshotRows);
  }

  const layers = field.value.keycodes;
  const selectedLayer = layers[selectedLayerIndex] ?? layers[0] ?? [];
  const layout = keyboard.layouts[0];
  const matrixKeys = layout.keys.filter((key) => key.matrix);
  const selectedMatrix = matrixKeys.some((key) => matrixKeyId(key.matrix!) === selectedKey)
    ? selectedKey
    : matrixKeyId(matrixKeys[0]!.matrix!);
  const board = element("div", {
    className: "hardware-keymap-board",
    attrs: { "data-hardware-keymap-board": "true" },
  });
  const bounds = layoutBounds(layout.keys);
  board.style.aspectRatio = `${bounds.width} / ${bounds.height}`;
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
      text: keycode === undefined ? "" : compactHardwareKeycode(keycode),
    });
    hardwareKey.addEventListener("click", () => selectKey(matrixId));
    hardwareKey.style.left = `${(key.x / bounds.width) * 100}%`;
    hardwareKey.style.top = `${(key.y / bounds.height) * 100}%`;
    hardwareKey.style.width = `calc(${((key.w ?? 1) / bounds.width) * 100}% - var(--key-gap))`;
    hardwareKey.style.height = `calc(${((key.h ?? 1) / bounds.height) * 100}% - var(--key-gap))`;
    if (base) {
      const lit = dimHex(base.color, base.brightness / 255);
      hardwareKey.style.setProperty("--key-light", lit);
      hardwareKey.style.setProperty("--key-ink", inkFor(lit));
      hardwareKey.setAttribute("data-lighting-active", "true");
    }
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

function readOnlyColorWheel(lighting: KeychronV5MaxLighting): HTMLElement {
  const wheel = element("div", {
    className: "color-wheel readonly",
    attrs: {
      "aria-hidden": "true",
      "data-device-lighting-wheel": hsv255ToHex(
        lighting.hue,
        lighting.saturation,
        lighting.brightness,
      ),
    },
  });
  const cursor = element("span", { className: "color-wheel-cursor" });
  const radians = (lighting.hue / 255) * Math.PI * 2;
  const radius = (lighting.saturation / 255) * 50;
  cursor.style.left = `${50 + radius * Math.sin(radians)}%`;
  cursor.style.top = `${50 - radius * Math.cos(radians)}%`;
  wheel.append(
    element("span", { className: "color-wheel-disc", attrs: { "aria-hidden": "true" } }),
    cursor,
  );
  return wheel;
}

function capabilityField(snapshot: KeychronV5MaxReadSnapshot): HTMLElement {
  const chips: Array<[string, IconName, boolean]> = [
    ["Identity", "usb", snapshot.identity.state === "available"],
    ["Keymap", "keyboard", snapshot.keymap.state === "available"],
    ["Lighting", "lightbulb", snapshot.lighting.state === "available"],
    ["Macros", "file-code", snapshot.macros.state === "available"],
  ];
  const bitmap =
    snapshot.capabilities.state === "available"
      ? snapshot.capabilities.value.featureBitmap
          .map((part) => `0x${part.toString(16).padStart(2, "0")}`)
          .join(" ")
      : undefined;
  return element("section", {
    className: `snapshot-field capabilities ${snapshot.capabilities.state}`,
    attrs: {
      "data-snapshot-field": "capabilities",
      "data-snapshot-state": snapshot.capabilities.state,
    },
  }, [
    element("h2", { text: "Capabilities" }),
    element("div", { className: "capability-chips" }, [
      ...chips.map(([label, glyph, available]) =>
        element("span", {
          className: `chip ${available ? "ready" : "blocked"}`,
          attrs: {
            title: available ? `${label} is available` : `${label} is unavailable`,
          },
        }, [icon(glyph, { size: 13 }), element("span", { text: label })]),
      ),
    ]),
    bitmap
      ? element("small", {
          className: "capability-bitmap",
          text: `Feature bitmap ${bitmap}`,
        })
      : element("p", {
          className: "snapshot-reason",
          text:
            ("reason" in snapshot.capabilities && snapshot.capabilities.reason) ||
            "Capabilities unavailable",
        }),
  ]);
}

/**
 * The V5 Max exposes only global VIA RGB-matrix state (channel 3), so this is a
 * read-only wheel plus values — there is no per-LED colour map.
 */
export function snapshotLightingField(
  field: KeychronV5MaxReadSnapshot["lighting"],
  onResync: () => void,
): HTMLElement {
  if (field.state !== "available") {
    return snapshotField("Lighting", field, lightingSnapshotRows);
  }
  const resync = uiButton({
    className: "secondary-action compact",
    type: "button",
    text: "Resync",
    attrs: { "data-device-lighting-refresh": "true", title: "Re-read the board's lighting state" },
  });
  resync.addEventListener("click", onResync);
  const swatch = element("span", {
    className: "lighting-swatch",
    attrs: {
      "data-hue": String(field.value.hue),
      "data-saturation": String(field.value.saturation),
      "data-value": String(field.value.brightness),
    },
  });
  // Same conversion the keymap uses, so the swatch and the keys never disagree.
  const color = hsv255ToHex(field.value.hue, field.value.saturation, field.value.brightness);
  swatch.style.backgroundColor = color;
  return element("section", {
    className: "snapshot-field lighting available",
    attrs: { "data-snapshot-field": "lighting", "data-snapshot-state": "available" },
  }, [
    element("div", { className: "snapshot-field-heading" }, [
      element("h2", { text: "Lighting" }),
      resync,
    ]),
    element("div", { className: "lighting-mirror" }, [
      readOnlyColorWheel(field.value),
      element("div", { className: "lighting-mirror-facts" }, [
        element("div", { className: "lighting-swatches", attrs: { "data-lighting-swatches": "true" } }, [swatch]),
        definitionList(lightingSnapshotRows(field.value)),
      ]),
    ]),
  ]);
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
