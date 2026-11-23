import { EditorState, RenderActions, isKeychronV5MaxSnapshot, keyboardForSelection, safetyAssessment } from "../appState";
import type { KeyboardDefinition } from "../domain";
import { GenericViaStandardState } from "../devices/genericViaReader";
import { KeychronV5MaxIdentityFacts, KeychronV5MaxReadSnapshot } from "../devices/keychronV5MaxReader";
import { ViaMacros, ViaMacroStep } from "../devices/viaReadProtocol";
import { decodeHardwareKeycode } from "../keycodes";
import { icon, type IconName } from "../icons";
import { contextDisclosure, definitionList, element, uiButton } from "./primitives";

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
    safetyPanel(state, actions),
    contextDisclosure("Device facts", "device-facts", [
      element("div", { className: "snapshot-group-fields" }, [
        snapshotField("Identity", snapshot.identity, identitySnapshotRows),
        capabilityField(snapshot),
        snapshotField("Macros", snapshot.macros, macrosSnapshotRows),
      ]),
    ], { open: true }),
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
      "data-focus-id": "key-tester-toggle",
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
    backupRequired: "Required",
    backupRecorded: "Recorded",
    declined: "Declined",
  }[assessment.state];
  const actionsRow = element("div", { className: "safety-actions" });
  if (assessment.state === "backupRequired" || assessment.state === "backupRecorded") {
    const download = uiButton({
      className: "secondary-action",
      type: "button",
      text:
        assessment.state === "backupRecorded"
          ? "Download bundle again"
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
      text: `${ledger.events.length} local event${ledger.events.length === 1 ? "" : "s"} · ledger ${state.safetyLedgerStorage.availability()}`,
    }),
    ...(actionsRow.childElementCount > 0 ? [actionsRow] : []),
  ]);
}

/**
 * The one gated device-write surface, attached to the Keymap board. Writes only
 * happen after the operator ticks the confirmation checkbox. Keycode writes
 * persist to EEPROM immediately;
 * "save lighting to EEPROM" is a separate confirmed action (channel-3 save).
 * The write allow-list in `qmkui-hid`/`viaWrite` gates every frame.
 */
export function deviceWriteControls(
  state: EditorState,
  actions: RenderActions,
  options: {
    description: string;
    controls: (confirmed: () => boolean) => HTMLElement[];
  },
): HTMLElement {
  const confirmInput = element("input", {
    attrs: { "data-write-confirm": "true", type: "checkbox" },
  });
  const confirmed = () => confirmInput.checked;
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
  const save = uiButton(
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
  );
  save.addEventListener("click", () => actions.saveLightingToDevice(confirmed()));

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
        save,
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
