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
  KC_QUOT: "'",
  KC_RALT: "Alt",
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
