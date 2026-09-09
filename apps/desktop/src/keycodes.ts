export type KeycodeCategory = {
  id: string;
  label: string;
  entries: KeycodeEntry[];
};

export type KeycodeEntry = {
  qmk: string;
  label: string;
  kind: string;
};

export const keycodeCategories: KeycodeCategory[] = [
  {
    id: "basic",
    label: "Basic",
    entries: [
      key("KC_ESC", "Esc"),
      key("KC_TAB", "Tab"),
      key("KC_SPC", "Space"),
      key("KC_ENT", "Enter"),
      key("KC_BSPC", "Backspace"),
      key("KC_DEL", "Del"),
      key("KC_GRV", "`"),
      key("KC_MINS", "-"),
      key("KC_EQL", "="),
      key("KC_LBRC", "["),
      key("KC_RBRC", "]"),
      key("KC_BSLS", "\\"),
      key("KC_SCLN", ";"),
      key("KC_QUOT", "'"),
      key("KC_COMM", ","),
      key("KC_DOT", "."),
      key("KC_SLSH", "/"),
    ],
  },
  {
    id: "letters",
    label: "Letters",
    entries: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => key(`KC_${letter}`, letter)),
  },
  {
    id: "numbers",
    label: "Numbers",
    entries: "1234567890".split("").map((number) => key(`KC_${number}`, number)),
  },
  {
    id: "function",
    label: "Function",
    entries: Array.from({ length: 24 }, (_, index) => {
      const label = `F${index + 1}`;
      return key(`KC_${label}`, label);
    }),
  },
  {
    id: "navigation",
    label: "Nav",
    entries: [
      key("KC_UP", "Up", "navigation"),
      key("KC_DOWN", "Down", "navigation"),
      key("KC_LEFT", "Left", "navigation"),
      key("KC_RGHT", "Right", "navigation"),
      key("KC_HOME", "Home", "navigation"),
      key("KC_END", "End", "navigation"),
      key("KC_PGUP", "PgUp", "navigation"),
      key("KC_PGDN", "PgDn", "navigation"),
      key("KC_INS", "Ins", "navigation"),
      key("KC_PSCR", "Print", "navigation"),
      key("KC_SYRQ", "SysRq", "navigation"),
      key("KC_PAUS", "Pause", "navigation"),
    ],
  },
  {
    id: "modifiers",
    label: "Mods",
    entries: [
      key("KC_LCTL", "Ctrl", "modifier"),
      key("KC_LSFT", "Shift", "modifier"),
      key("KC_LALT", "Alt", "modifier"),
      key("KC_LGUI", "Win", "modifier"),
      key("KC_LWIN", "Win", "modifier"),
      key("KC_RCTL", "Ctrl R", "modifier"),
      key("KC_RSFT", "Shift R", "modifier"),
      key("KC_RALT", "Alt R", "modifier"),
      key("KC_RGUI", "Win R", "modifier"),
      key("KC_RWIN", "Win R", "modifier"),
      key("KC_CAPS", "Caps", "modifier"),
      key("KC_APP", "Menu", "modifier"),
    ],
  },
  {
    id: "media",
    label: "Media",
    entries: [
      key("KC_MUTE", "Mute", "media"),
      key("KC_VOLU", "Vol+", "media"),
      key("KC_VOLD", "Vol-", "media"),
      key("KC_MPLY", "Play", "media"),
      key("KC_MPRV", "Prev", "media"),
      key("KC_MNXT", "Next", "media"),
      key("KC_BRID", "Bright-", "media"),
      key("KC_BRIU", "Bright+", "media"),
    ],
  },
  {
    id: "layers",
    label: "Layers",
    entries: [
      key("MO(1)", "Fn", "layer"),
      key("TG(1)", "Toggle 1", "layer"),
      key("TO(0)", "Layer 0", "layer"),
      key("TO(1)", "Layer 1", "layer"),
      key("DF(0)", "Default 0", "layer"),
      key("OSL(1)", "One-shot 1", "layer"),
      key("KC_TRNS", "Transparent", "transparent"),
      key("KC_NO", "None", "none"),
    ],
  },
  {
    id: "tapHold",
    label: "Tap-hold",
    entries: [
      key("LT(1, KC_SPC)", "Layer tap", "layerTap"),
      key("MT(MOD_LCTL, KC_ESC)", "Ctrl / Esc", "modTap"),
      key("MT(MOD_LSFT, KC_ENT)", "Shift / Enter", "modTap"),
      key("LCTL_T(KC_ESC)", "Ctrl / Esc", "modTap"),
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    entries: [
      key("RGB_TOG", "RGB", "lighting"),
      key("RGB_MOD", "Mode", "lighting"),
      key("RGB_HUI", "Hue+", "lighting"),
      key("RGB_HUD", "Hue-", "lighting"),
      key("RGB_SAI", "Sat+", "lighting"),
      key("RGB_SAD", "Sat-", "lighting"),
      key("RGB_VAI", "Bright+", "lighting"),
      key("RGB_VAD", "Bright-", "lighting"),
      key("RGB_SPI", "Speed+", "lighting"),
      key("RGB_SPD", "Speed-", "lighting"),
    ],
  },
  {
    id: "system",
    label: "System",
    entries: [key("QK_BOOT", "Boot", "bootloader")],
  },
];

export type KeycapFormatOptions = {
  compact?: boolean;
};

export function formatKeycap(
  qmk: string | undefined,
  options: KeycapFormatOptions = {},
): string {
  const keycode = qmk ?? "KC_NO";
  const mapped = options.compact ? compactKeycapLabels[keycode] ?? keycapLabels[keycode] : keycapLabels[keycode];
  if (mapped !== undefined) {
    return mapped;
  }

  const letter = /^KC_([A-Z])$/.exec(keycode);
  if (letter) {
    return letter[1];
  }

  const number = /^KC_([0-9])$/.exec(keycode);
  if (number) {
    return number[1];
  }

  const functionKey = /^KC_(F[0-9]{1,2})$/.exec(keycode);
  if (functionKey) {
    return functionKey[1];
  }

  const layerTap = /^(MO|TO|TG|DF|OSL|TT)\((\d+)\)$/.exec(keycode);
  if (layerTap) {
    return layerTap[1] === "MO" ? "Fn" : `L${layerTap[2]}`;
  }

  const layerTapKey = /^(LT|LM)\((\d+),\s*(.+)\)$/.exec(keycode);
  if (layerTapKey) {
    const tapLabel = formatKeycap(layerTapKey[3].trim(), options);
    return options.compact ? `L${layerTapKey[2]}/${tapLabel}` : `Layer ${layerTapKey[2]}/${tapLabel}`;
  }

  const modTapKey = /^MT\((MOD_[A-Z|_]+),\s*(.+)\)$/.exec(keycode);
  if (modTapKey) {
    return `${modMaskLabel(modTapKey[1])}/${formatKeycap(modTapKey[2].trim(), options)}`;
  }

  const modTapAlias = /^([LR](?:CTL|ALT|SFT|GUI))_T\((.+)\)$/.exec(keycode);
  if (modTapAlias) {
    return `${modifierLabel(modTapAlias[1])}/${formatKeycap(modTapAlias[2].trim(), options)}`;
  }

  const modified = /^([LR]?(?:CTL|ALT|SFT|GUI)|[CSAG])\((.+)\)$/.exec(keycode);
  if (modified) {
    return `${modifierLabel(modified[1])}+${formatKeycap(modified[2].trim(), options)}`;
  }

  if (keycode.startsWith("KC_")) {
    return titleKeyLabel(keycode.slice(3));
  }

  if (keycode.startsWith("RGB_")) {
    return titleKeyLabel(keycode.slice(4));
  }

  if (/^[A-Z0-9_]+\(.+\)$/.test(keycode)) {
    return "Custom";
  }

  return titleKeyLabel(keycode);
}

export function kindForKeycode(qmk: string): string {
  return keycodeCategories
    .flatMap((category) => category.entries)
    .find((entry) => entry.qmk === qmk)?.kind ?? inferKind(qmk);
}

function key(qmk: string, label: string, kind = "basic"): KeycodeEntry {
  return { qmk, label, kind };
}

function inferKind(qmk: string): string {
  if (qmk === "KC_TRNS") {
    return "transparent";
  }
  if (qmk === "KC_NO") {
    return "none";
  }
  if (qmk.startsWith("LT(")) {
    return "layerTap";
  }
  if (qmk.startsWith("MT(") || /^[LR](?:CTL|SFT|ALT|GUI)_T\(/.test(qmk)) {
    return "modTap";
  }
  if (/^(MO|TO|TG|DF|OSL|TT|LM)\(/.test(qmk)) {
    return "layer";
  }
  if (/^KC_[LR](?:CTL|SFT|ALT|GUI|WIN)$/.test(qmk)) {
    return "modifier";
  }
  if (qmk.startsWith("RGB_")) {
    return "lighting";
  }
  if (qmk.startsWith("KC_M") || qmk === "KC_VOLU" || qmk === "KC_VOLD") {
    return "media";
  }
  if (qmk === "QK_BOOT") {
    return "bootloader";
  }
  return "basic";
}

const keycapLabels: Record<string, string> = {
  KC_APP: "Menu",
  KC_BRIU: "Bright+",
  KC_BRID: "Bright-",
  KC_BSLS: "\\",
  KC_BSPC: "Backspace",
  KC_CAPS: "Caps",
  KC_FILE: "Files",
  KC_COMM: ",",
  KC_DEL: "Del",
  KC_DOT: ".",
  KC_DOWN: "↓",
  KC_END: "End",
  KC_ENT: "Enter",
  KC_EQL: "=",
  KC_ESC: "Esc",
  KC_EXPL: "Files",
  KC_GRV: "`",
  KC_HOME: "Home",
  KC_INS: "Ins",
  KC_LALT: "Alt",
  KC_LBRC: "[",
  KC_LCMMD: "Cmd",
  KC_LCTL: "Ctrl",
  KC_LEFT: "←",
  KC_LGUI: "Win",
  KC_LWIN: "Win",
  KC_LNPAD: "Launch",
  KC_LOPTN: "Opt",
  KC_LSFT: "Shift",
  KC_MCTRL: "Mission",
  KC_MINS: "-",
  KC_MNXT: "Next",
  KC_MPLY: "Play",
  KC_MPRV: "Prev",
  KC_MUTE: "Mute",
  KC_NO: "",
  KC_NUM: "Num",
  KC_P0: "0",
  KC_P1: "1",
  KC_P2: "2",
  KC_P3: "3",
  KC_P4: "4",
  KC_P5: "5",
  KC_P6: "6",
  KC_P7: "7",
  KC_P8: "8",
  KC_P9: "9",
  KC_PAST: "*",
  KC_PAUS: "Pause",
  KC_PDOT: ".",
  KC_PENT: "Enter",
  KC_PGDN: "PgDn",
  KC_PGUP: "PgUp",
  KC_PMNS: "-",
  KC_PPLS: "+",
  KC_PSCR: "Prt",
  KC_PSLS: "/",
  KC_QUOT: "'",  KC_RALT: "Alt",
  KC_RBRC: "]",
  KC_RCMMD: "Cmd",
  KC_RCTL: "Ctrl",
  KC_RGHT: "→",
  KC_RGUI: "Win",
  KC_RWIN: "Win",
  KC_RSFT: "Shift",
  KC_SCLN: ";",
  KC_SLSH: "/",
  KC_SPC: "Space",
  KC_SYRQ: "SysRq",
  KC_TAB: "Tab",
  KC_TASK: "Task",
  KC_TRNS: "",
  KC_UP: "↑",
  KC_VOLD: "Vol-",
  KC_VOLU: "Vol+",
  QK_BOOT: "Boot",
  RGB_HUI: "Hue+",
  RGB_HUD: "Hue-",
  RGB_MOD: "Mode",
  RGB_RMOD: "Mode-",
  RGB_SAI: "Sat+",
  RGB_SAD: "Sat-",
  RGB_SPD: "Speed-",
  RGB_SPI: "Speed+",
  RGB_TOG: "RGB",
  RGB_VAD: "Bright-",
  RGB_VAI: "Bright+",
  BAT_LVL: "Battery",
  BT_HST1: "BT1",
  BT_HST2: "BT2",
  BT_HST3: "BT3",
  NK_TOGG: "NKRO",
  P2P4G: "2.4G",
};

const compactKeycapLabels: Record<string, string> = {
  KC_BRID: "Br-",
  KC_BRIU: "Br+",
  KC_BSPC: "⟵",
  KC_CAPS: "Caps",
  KC_ENT: "Enter",
  KC_MCTRL: "Missn",
  KC_LNPAD: "Launch",
  KC_MPLY: "Play",
  KC_MPRV: "Prev",
  KC_MNXT: "Next",
  KC_PGDN: "PgDn",
  KC_PGUP: "PgUp",
  KC_PSCR: "Prt",
  KC_RSFT: "Shift",
  KC_LSFT: "Shift",
  KC_SPC: "Spc",
  RGB_RMOD: "Mode-",
  RGB_SPD: "Spd-",
  RGB_SPI: "Spd+",
  RGB_VAD: "Val-",
  RGB_VAI: "Val+",
};

function titleKeyLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function modMaskLabel(mask: string): string {
  return mask
    .split("|")
    .map((part) => modifierLabel(part.replace(/^MOD_/, "")))
    .join("+");
}

function modifierLabel(value: string): string {
  const labels: Record<string, string> = {
    A: "Alt",
    C: "Ctrl",
    G: "Win",
    LALT: "Alt",
    LCTL: "Ctrl",
    LGUI: "Win",
    LSFT: "Shift",
    RALT: "Alt",
    RCTL: "Ctrl",
    RGUI: "Win",
    RSFT: "Shift",
    S: "Shift",
  };
  return labels[value] ?? titleKeyLabel(value);
}

/**
 * QMK keycode values as stored by VIA in the dynamic keymap. Sourced from the
 * firmware's `quantum/keycodes.h` (QMK_KEYCODES_VERSION 0.0.7) at the catalog
 * commit; the Keychron V5 Max ships this scheme (KC_TRNS is 0x0001, not the
 * legacy 0x8000).
 */
export function decodeHardwareKeycode(code: number): string {
  const basic = hardwareKeycodeLabels[code];
  if (basic !== undefined) {
    return basic;
  }
  if (code >= 0x0100 && code <= 0x1fff) {
    const base = code & 0xff;
    return `${decodeModMask((code >> 8) & 0x1f)}+${decodeHardwareKeycode(base)}`;
  }
  if (code >= 0x2000 && code <= 0x3fff) {
    const base = code & 0xff;
    return `${decodeModMask((code >> 8) & 0x1f)}/${decodeHardwareKeycode(base)}`;
  }
  if (code >= 0x4000 && code <= 0x4fff) {
    const base = code & 0xff;
    return `L${(code >> 8) & 0x0f}/${decodeHardwareKeycode(base)}`;
  }
  if (code >= 0x5000 && code <= 0x51ff) {
    return `L${(code >> 8) & 0x0f}/${decodeModMask(code & 0xff)}`;
  }
  if (code >= 0x5200 && code <= 0x521f) {
    return `TO(${code - 0x5200})`;
  }
  if (code >= 0x5220 && code <= 0x523f) {
    return "Fn";
  }
  if (code >= 0x5240 && code <= 0x525f) {
    return `DF(${code - 0x5240})`;
  }
  if (code >= 0x5260 && code <= 0x527f) {
    return `TG(${code - 0x5260})`;
  }
  if (code >= 0x5280 && code <= 0x529f) {
    return `OSL(${code - 0x5280})`;
  }
  if (code >= 0x52a0 && code <= 0x52bf) {
    return `OSM(${code - 0x52a0})`;
  }
  if (code >= 0x52c0 && code <= 0x52df) {
    return `TT(${code - 0x52c0})`;
  }
  if (code >= 0x7000 && code <= 0x70ff) {
    return hardwareMagicLabels[code] ?? hexKeycode(code);
  }
  if (code === 0x7c00) {
    return "Boot";
  }
  if (code >= 0x7780 && code <= 0x77bf) {
    return hardwareOutputLabels[code] ?? hexKeycode(code);
  }
  if (code >= 0x7800 && code <= 0x78ff) {
    return hardwareLightingLabels[code] ?? hexKeycode(code);
  }
  return hexKeycode(code);
}

/**
 * True when a hardware keycode reaches the host as Print Screen, which is the
 * key Linux treats as SysRq (`KEY_SYSRQ`) for Alt+SysRq+command.
 */
export function isSysRqKeycode(code: number): boolean {
  return code === 0x0046;
}

function hexKeycode(code: number): string {
  return `0x${code.toString(16).padStart(4, "0")}`;
}

function decodeModMask(mask: number): string {
  const parts: string[] = [];
  if (mask & 0x01) parts.push("Ctrl");
  if (mask & 0x02) parts.push("Shift");
  if (mask & 0x04) parts.push("Alt");
  if (mask & 0x08) parts.push("Win");
  if (mask & 0x10) parts.push("Ctrl R");
  if (mask & 0x20) parts.push("Shift R");
  if (mask & 0x40) parts.push("Alt R");
  if (mask & 0x80) parts.push("Win R");
  return parts.length > 0 ? parts.join("+") : "Mod";
}

const hardwareKeycodeLabels: Record<number, string> = {
  0x0000: "None",
  0x0001: "Transparent",
  0x0004: "A",
  0x0005: "B",
  0x0006: "C",
  0x0007: "D",
  0x0008: "E",
  0x0009: "F",
  0x000a: "G",
  0x000b: "H",
  0x000c: "I",
  0x000d: "J",
  0x000e: "K",
  0x000f: "L",
  0x0010: "M",
  0x0011: "N",
  0x0012: "O",
  0x0013: "P",
  0x0014: "Q",
  0x0015: "R",
  0x0016: "S",
  0x0017: "T",
  0x0018: "U",
  0x0019: "V",
  0x001a: "W",
  0x001b: "X",
  0x001c: "Y",
  0x001d: "Z",
  0x001e: "1",
  0x001f: "2",
  0x0020: "3",
  0x0021: "4",
  0x0022: "5",
  0x0023: "6",
  0x0024: "7",
  0x0025: "8",
  0x0026: "9",
  0x0027: "0",
  0x0028: "Enter",
  0x0029: "Esc",
  0x002a: "Backspace",
  0x002b: "Tab",
  0x002c: "Space",
  0x002d: "-",
  0x002e: "=",
  0x002f: "[",
  0x0030: "]",
  0x0031: "\\",
  0x0033: ";",
  0x0034: "'",
  0x0035: "`",
  0x0036: ",",
  0x0037: ".",
  0x0038: "/",
  0x0039: "Caps",
  0x003a: "F1",
  0x003b: "F2",
  0x003c: "F3",
  0x003d: "F4",
  0x003e: "F5",
  0x003f: "F6",
  0x0040: "F7",
  0x0041: "F8",
  0x0042: "F9",
  0x0043: "F10",
  0x0044: "F11",
  0x0045: "F12",
  0x0046: "Print",
  0x0047: "Scroll",
  0x0048: "Pause",
  0x0049: "Ins",
  0x004a: "Home",
  0x004b: "PgUp",
  0x004c: "Del",
  0x004d: "End",
  0x004e: "PgDn",
  0x004f: "Right",
  0x0050: "Left",
  0x0051: "Down",
  0x0052: "Up",
  0x0053: "Num",
  0x0054: "Num/",
  0x0055: "Num*",
  0x0056: "Num-",
  0x0057: "Num+",
  0x0058: "NumEnter",
  0x0059: "Num1",
  0x005a: "Num2",
  0x005b: "Num3",
  0x005c: "Num4",
  0x005d: "Num5",
  0x005e: "Num6",
  0x005f: "Num7",
  0x0060: "Num8",
  0x0061: "Num9",
  0x0062: "Num0",
  0x0063: "Num.",
  0x0064: "NonUS\\",
  0x0065: "Menu",
  0x0066: "Power",
  0x0067: "Num=",
  0x0068: "F13",
  0x0069: "F14",
  0x006a: "F15",
  0x006b: "F16",
  0x006c: "F17",
  0x006d: "F18",
  0x006e: "F19",
  0x006f: "F20",
  0x0070: "F21",
  0x0071: "F22",
  0x0072: "F23",
  0x0073: "F24",
  0x0074: "Execute",
  0x0075: "Help",
  0x0076: "Menu",
  0x0077: "Select",
  0x0078: "Stop",
  0x0079: "Again",
  0x007a: "Undo",
  0x007b: "Cut",
  0x007c: "Copy",
  0x007d: "Paste",
  0x007e: "Find",
  0x007f: "Mute",
  0x0080: "Vol+",
  0x0081: "Vol-",
  0x0085: "Num,",
  0x0099: "Erase",
  0x009a: "SysRq",
  0x009b: "Cancel",
  0x009c: "Clear",
  0x009d: "Prior",
  0x009e: "Return",
  0x009f: "Separator",
  0x00a0: "Out",
  0x00a1: "Oper",
  0x00a2: "ClearAgain",
  0x00a3: "CRSel",
  0x00a4: "ExSel",
  0x00a5: "Power",
  0x00a6: "Sleep",
  0x00a7: "Wake",
  0x00a8: "Mute",
  0x00a9: "Vol+",
  0x00aa: "Vol-",
  0x00ab: "Next",
  0x00ac: "Prev",
  0x00ad: "Stop",
  0x00ae: "Play",
  0x00af: "Select",
  0x00b0: "Eject",
  0x00b1: "Mail",
  0x00b2: "Calculator",
  0x00b3: "MyComputer",
  0x00b4: "Search",
  0x00b5: "Home",
  0x00b6: "Back",
  0x00b7: "Forward",
  0x00b8: "Stop",
  0x00b9: "Refresh",
  0x00ba: "Favorites",
  0x00bb: "FF",
  0x00bc: "Rewind",
  0x00bd: "Bright+",
  0x00be: "Bright-",
  0x00bf: "ControlPanel",
  0x00c0: "Assistant",
  0x00c1: "Mission",
  0x00c2: "Launchpad",
  0x00cd: "Mouse Up",
  0x00ce: "Mouse Down",
  0x00cf: "Mouse Left",
  0x00d0: "Mouse Right",
  0x00d1: "Mouse1",
  0x00d2: "Mouse2",
  0x00d3: "Mouse3",
  0x00d4: "Mouse4",
  0x00d5: "Mouse5",
  0x00d9: "Wheel Up",
  0x00da: "Wheel Down",
  0x00db: "Wheel Left",
  0x00dc: "Wheel Right",
  0x00e0: "Ctrl",
  0x00e1: "Shift",
  0x00e2: "Alt",
  0x00e3: "Win",
  0x00e4: "Ctrl R",
  0x00e5: "Shift R",
  0x00e6: "Alt R",
  0x00e7: "Win R",
};

const hardwareMagicLabels: Record<number, string> = {
  0x7013: "NKRO",
};

const hardwareOutputLabels: Record<number, string> = {
  0x7780: "Output Auto",
  0x7781: "Output Next",
  0x7782: "Output Prev",
  0x7783: "Output None",
  0x7784: "USB",
  0x7785: "2.4G",
  0x7786: "BT",
  0x7793: "BT1",
  0x7794: "BT2",
  0x7795: "BT3",
  0x7796: "BT4",
  0x7797: "BT5",
};

const hardwareLightingLabels: Record<number, string> = {
  0x7800: "BL On",
  0x7801: "BL Off",
  0x7802: "BL Toggle",
  0x7803: "BL Down",
  0x7804: "BL Up",
  0x7805: "BL Step",
  0x7820: "RGB",
  0x7821: "Mode",
  0x7822: "Mode-",
  0x7823: "Hue+",
  0x7824: "Hue-",
  0x7825: "Sat+",
  0x7826: "Sat-",
  0x7827: "Bright+",
  0x7828: "Bright-",
  0x7829: "Speed+",
  0x782a: "Speed-",
  0x782b: "Mode 1",
  0x782c: "Mode 2",
  0x782d: "Mode 3",
  0x782e: "Mode 4",
  0x782f: "Mode 5",
  0x7830: "Mode 6",
  0x7831: "Mode 7",
  0x7832: "Mode 8",
  0x7833: "Mode 9",
  0x7834: "Mode 10",
};

/**
 * QMK keycode name to numeric value, for writing a project keymap to a device
 * via the VIA dynamic-keymap protocol. Covers the standard HID keycodes,
 * modifiers, media/brightness keys, transparent/none, and the common layer
 * and mod-tap wrappers. Returns undefined for anything not safely mappable.
 */
export function keycodeValue(qmk: string): number | undefined {
  const trimmed = qmk.trim();
  if (trimmed === "_______" || trimmed === "KC_TRANSPARENT" || trimmed === "KC_TRNS") {
    return 0x0001;
  }
  if (trimmed === "XXXXXXX" || trimmed === "KC_NO") {
    return 0x0000;
  }
  const singleArg = /^(MO|TO|TG|DF|OSL|TT|OSM)\((\d+)\)$/.exec(trimmed);
  if (singleArg) {
    const base: Record<string, number> = {
      MO: 0x5220,
      TO: 0x5200,
      DF: 0x5240,
      TG: 0x5260,
      OSL: 0x5280,
      TT: 0x52c0,
      OSM: 0x52a0,
    };
    const layer = Number(singleArg[2]);
    if (layer > 0xff) {
      return undefined;
    }
    return base[singleArg[1]!]! + layer;
  }
  const layerTap = /^LT\((\d+),\s*(.+)\)$/.exec(trimmed);
  if (layerTap) {
    const layer = Number(layerTap[1]);
    const tap = keycodeValue(layerTap[2]!);
    if (layer > 0xff || tap === undefined) {
      return undefined;
    }
    return 0x4000 | (layer << 8) | tap;
  }
  const modTapAlias = /^([LR](?:CTL|SFT|ALT|GUI))_T\((.+)\)$/.exec(trimmed);
  if (modTapAlias) {
    const mod = MOD_NAME_TO_MASK[modTapAlias[1]!];
    const tap = keycodeValue(modTapAlias[2]!);
    if (mod === undefined || tap === undefined) {
      return undefined;
    }
    return 0x2000 | (mod << 8) | tap;
  }
  const modTap = /^MT\((MOD_[A-Z_|]+),\s*(.+)\)$/.exec(trimmed);
  if (modTap) {
    const mod = modMaskValue(modTap[1]!);
    const tap = keycodeValue(modTap[2]!);
    if (mod === undefined || tap === undefined) {
      return undefined;
    }
    return 0x2000 | (mod << 8) | tap;
  }
  return KEYCODE_VALUE_MAP[trimmed];
}

const MOD_NAME_TO_MASK: Record<string, number> = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
  RCTL: 0x10,
  RSFT: 0x20,
  RALT: 0x40,
  RGUI: 0x80,
};

function modMaskValue(mask: string): number | undefined {
  let value = 0;
  for (const part of mask.split("|")) {
    const mod = MOD_NAME_TO_MASK[part.replace(/^MOD_/, "")];
    if (mod === undefined) {
      return undefined;
    }
    value |= mod;
  }
  return value;
}

const KEYCODE_VALUE_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let index = 0; index < letters.length; index += 1) {
    map[`KC_${letters[index]}`] = 0x04 + index;
  }
  const digits = "1234567890";
  for (let index = 0; index < digits.length; index += 1) {
    map[`KC_${digits[index]}`] = 0x1e + index;
  }
  for (let index = 0; index < 12; index += 1) {
    map[`KC_F${index + 1}`] = 0x3a + index;
  }
  for (let index = 0; index < 12; index += 1) {
    map[`KC_F${index + 13}`] = 0x68 + index;
  }
  const named: Array<[string, number]> = [
    ["KC_ENTER", 0x28], ["KC_ESC", 0x29], ["KC_ESCAPE", 0x29], ["KC_BACKSPACE", 0x2a],
    ["KC_BSPC", 0x2a], ["KC_TAB", 0x2b], ["KC_SPACE", 0x2c], ["KC_SPC", 0x2c],
    ["KC_MINUS", 0x2d], ["KC_MINS", 0x2d], ["KC_EQUAL", 0x2e], ["KC_EQL", 0x2e],
    ["KC_LEFT_BRACKET", 0x2f], ["KC_LBRC", 0x2f], ["KC_RIGHT_BRACKET", 0x30], ["KC_RBRC", 0x30],
    ["KC_BACKSLASH", 0x31], ["KC_BSLS", 0x31], ["KC_SEMICOLON", 0x33], ["KC_SCLN", 0x33],
    ["KC_QUOTE", 0x34], ["KC_QUOT", 0x34], ["KC_GRAVE", 0x35], ["KC_GRV", 0x35],
    ["KC_COMMA", 0x36], ["KC_COMM", 0x36], ["KC_DOT", 0x37], ["KC_SLASH", 0x38], ["KC_SLSH", 0x38],
    ["KC_CAPS", 0x39], ["KC_CAPS_LOCK", 0x39], ["KC_PRINT_SCREEN", 0x46], ["KC_PSCR", 0x46],
    ["KC_SCROLL_LOCK", 0x47], ["KC_PAUSE", 0x48], ["KC_INSERT", 0x49], ["KC_INS", 0x49],
    ["KC_HOME", 0x4a], ["KC_PAGE_UP", 0x4b], ["KC_PGUP", 0x4b], ["KC_DELETE", 0x4c], ["KC_DEL", 0x4c],
    ["KC_END", 0x4d], ["KC_PAGE_DOWN", 0x4e], ["KC_PGDN", 0x4e], ["KC_RIGHT", 0x4f], ["KC_RGHT", 0x4f],
    ["KC_LEFT", 0x50], ["KC_DOWN", 0x51], ["KC_UP", 0x52], ["KC_NUM", 0x53], ["KC_NUM_LOCK", 0x53],
    ["KC_KP_SLASH", 0x54], ["KC_PSLS", 0x54], ["KC_KP_ASTERISK", 0x55], ["KC_PAST", 0x55],
    ["KC_KP_MINUS", 0x56], ["KC_PMNS", 0x56], ["KC_KP_PLUS", 0x57], ["KC_PPLS", 0x57],
    ["KC_KP_ENTER", 0x58], ["KC_PENT", 0x58], ["KC_KP_1", 0x59], ["KC_P1", 0x59],
    ["KC_KP_2", 0x5a], ["KC_P2", 0x5a], ["KC_KP_3", 0x5b], ["KC_P3", 0x5b],
    ["KC_KP_4", 0x5c], ["KC_P4", 0x5c], ["KC_KP_5", 0x5d], ["KC_P5", 0x5d],
    ["KC_KP_6", 0x5e], ["KC_P6", 0x5e], ["KC_KP_7", 0x5f], ["KC_P7", 0x5f],
    ["KC_KP_8", 0x60], ["KC_P8", 0x60], ["KC_KP_9", 0x61], ["KC_P9", 0x61],
    ["KC_KP_0", 0x62], ["KC_P0", 0x62], ["KC_KP_DOT", 0x63], ["KC_PDOT", 0x63],
    ["KC_APPLICATION", 0x65], ["KC_APP", 0x65], ["KC_LEFT_CTRL", 0xe0], ["KC_LCTL", 0xe0],
    ["KC_LEFT_SHIFT", 0xe1], ["KC_LSFT", 0xe1], ["KC_LEFT_ALT", 0xe2], ["KC_LALT", 0xe2],
    ["KC_LEFT_GUI", 0xe3], ["KC_LGUI", 0xe3], ["KC_LWIN", 0xe3], ["KC_LCMD", 0xe3],
    ["KC_RIGHT_CTRL", 0xe4], ["KC_RCTL", 0xe4], ["KC_RIGHT_SHIFT", 0xe5], ["KC_RSFT", 0xe5],
    ["KC_RIGHT_ALT", 0xe6], ["KC_RALT", 0xe6], ["KC_RIGHT_GUI", 0xe7], ["KC_RGUI", 0xe7],
    ["KC_RWIN", 0xe7], ["KC_RCMD", 0xe7], ["KC_AUDIO_MUTE", 0xa8], ["KC_MUTE", 0xa8],
    ["KC_AUDIO_VOL_UP", 0xa9], ["KC_VOLU", 0xa9], ["KC_AUDIO_VOL_DOWN", 0xaa], ["KC_VOLD", 0xaa],
    ["KC_MEDIA_NEXT_TRACK", 0xab], ["KC_MNXT", 0xab], ["KC_MEDIA_PREV_TRACK", 0xac], ["KC_MPRV", 0xac],
    ["KC_MEDIA_STOP", 0xad], ["KC_MEDIA_PLAY_PAUSE", 0xae], ["KC_MPLY", 0xae],
    ["KC_MEDIA_SELECT", 0xaf], ["KC_MEDIA_EJECT", 0xb0], ["KC_BRIGHTNESS_UP", 0xbd], ["KC_BRIU", 0xbd],
    ["KC_BRIGHTNESS_DOWN", 0xbe], ["KC_BRID", 0xbe],
  ];
  for (const [name, value] of named) {
    map[name] = value;
  }
  return map;
})();
