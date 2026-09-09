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

export type KeyEventKind = "down" | "up";

export type KeyEvent = {
  code: string;
  key: string;
  kind: KeyEventKind;
  at: number;
};

export type KeyClassification = {
  chatter: string[];
  held: string[];
};

const CHATTER_CYCLE_MS = 30;
const CHATTER_CYCLES_REQUIRED = 3;
const HELD_MS = 2_000;

/**
 * Classifies a stream of host key events. A key is flagged as chattering when
 * it completes several very short down/up cycles in sequence, and as held when
 * a down event is never released within the window.
 */
export function classifyKeyEvents(events: readonly KeyEvent[]): KeyClassification {
  const byCode = new Map<string, KeyEvent[]>();
  for (const event of events) {
    const list = byCode.get(event.code) ?? [];
    list.push(event);
    byCode.set(event.code, list);
  }

  const chatter: string[] = [];
  const held: string[] = [];
  for (const [code, sequence] of byCode) {
    let cycleCount = 0;
    let index = 0;
    while (index + 1 < sequence.length) {
      const down = sequence[index]!;
      const up = sequence[index + 1]!;
      if (down.kind === "down" && up.kind === "up") {
        if (up.at - down.at >= HELD_MS && !held.includes(code)) {
          held.push(code);
        }
        cycleCount = up.at - down.at <= CHATTER_CYCLE_MS ? cycleCount + 1 : 0;
        if (cycleCount >= CHATTER_CYCLES_REQUIRED && !chatter.includes(code)) {
          chatter.push(code);
        }
        index += 2;
      } else {
        index += 1;
      }
    }
    const last = sequence[sequence.length - 1];
    if (last?.kind === "down" && !held.includes(code)) {
      held.push(code);
    }
  }

  return { chatter, held };
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
