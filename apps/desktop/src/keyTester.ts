import type { Project } from "./domain";

export type HostKeyInput = {
  code: string;
  key: string;
};

export type HostKeyCapture = {
  code: string;
  key: string;
  qmk: string;
  matchedKeyIds: string[];
};

export function captureHostKey(
  project: Project,
  layerIndex: number,
  input: HostKeyInput,
): HostKeyCapture {
  const qmk = qmkFromHostKey(input) ?? "KC_NO";
  const layer =
    project.layers.find((item) => item.index === layerIndex) ?? project.layers[0];
  const matchedKeyIds =
    layer?.assignments
      .filter((assignment) => assignment.qmk === qmk)
      .map((assignment) => assignment.visualKeyId) ?? [];

  return {
    code: input.code,
    key: input.key,
    qmk,
    matchedKeyIds,
  };
}

export function qmkFromHostKey(input: HostKeyInput): string | undefined {
  const direct = hostCodeMap[input.code];
  if (direct) {
    return direct;
  }

  if (/^Key[A-Z]$/.test(input.code)) {
    return `KC_${input.code.slice(3)}`;
  }
  if (/^Digit[0-9]$/.test(input.code)) {
    return `KC_${input.code.slice(5)}`;
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(input.code)) {
    return `KC_${input.code}`;
  }
  if (/^Numpad[0-9]$/.test(input.code)) {
    return `KC_P${input.code.slice(6)}`;
  }
  return undefined;
}

const hostCodeMap: Record<string, string> = {
  AltLeft: "KC_LALT",
  AltRight: "KC_RALT",
  ArrowDown: "KC_DOWN",
  ArrowLeft: "KC_LEFT",
  ArrowRight: "KC_RGHT",
  ArrowUp: "KC_UP",
  Backquote: "KC_GRV",
  Backslash: "KC_BSLS",
  Backspace: "KC_BSPC",
  BracketLeft: "KC_LBRC",
  BracketRight: "KC_RBRC",
  CapsLock: "KC_CAPS",
  Comma: "KC_COMM",
  ControlLeft: "KC_LCTL",
  ControlRight: "KC_RCTL",
  Delete: "KC_DEL",
  End: "KC_END",
  Enter: "KC_ENT",
  Equal: "KC_EQL",
  Escape: "KC_ESC",
  Home: "KC_HOME",
  Insert: "KC_INS",
  Minus: "KC_MINS",
  MetaLeft: "KC_LGUI",
  MetaRight: "KC_RGUI",
  NumpadAdd: "KC_PPLS",
  NumpadDecimal: "KC_PDOT",
  NumpadDivide: "KC_PSLS",
  NumpadEnter: "KC_PENT",
  NumpadMultiply: "KC_PAST",
  NumpadSubtract: "KC_PMNS",
  PageDown: "KC_PGDN",
  PageUp: "KC_PGUP",
  Period: "KC_DOT",
  Quote: "KC_QUOT",
  Semicolon: "KC_SCLN",
  ShiftLeft: "KC_LSFT",
  ShiftRight: "KC_RSFT",
  Slash: "KC_SLSH",
  Space: "KC_SPC",
  Tab: "KC_TAB",
};
