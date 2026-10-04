import { hexToHsv, hsvToHex, normalizeHex } from "../color";
import { Assignment, VisualKey } from "../domain";
import { formatKeycap } from "../keycodes";
export const KEY_LABEL_UNIT = 58;
export const KEY_LABEL_INSET = 6;

export function settingsGroup(id: string, label: string, children: Array<Node | string>): HTMLElement {
  return element("section", {
    className: "settings-group",
    attrs: { "data-settings-group": id },
  }, [
    element("h3", { className: "settings-group-title", text: label }),
    ...children,
  ]);
}

export function controlGroup(id: string, label: string, children: Array<Node | string>): HTMLElement {
  return element("section", {
    className: "control-group",
    attrs: { "data-control-group": id },
  }, [
    element("div", { className: "control-group-heading" }, [
      element("h3", { text: label, attrs: { "data-control-group-title": "true" } }),
    ]),
    element("div", { className: "control-group-body" }, children),
  ]);
}

export function parameterBlock(label: string, children: Array<Node | string>): HTMLElement {
  return element("section", { className: "parameter-block" }, [
    element("h4", { className: "parameter-block-title", text: label }),
    element("div", { className: "parameter-block-body" }, children),
  ]);
}

export function rangeInput(label: string, key: string, value: number): HTMLInputElement {
  return element("input", {
    attrs: {
      "aria-label": label,
      "data-focus-id": `lighting-${key}`,
      "data-lighting-control": key,
      max: "255",
      min: "0",
      type: "range",
      value: String(value),
    },
  });
}

export function optionSelect(
  label: string,
  field: string,
  options: Array<{ value: string; label: string }>,
  value: string,
): HTMLSelectElement {
  const select = element("select", {
    attrs: {
      "aria-label": label,
      "data-advanced-field": field,
      "data-focus-id": `advanced-${field}`,
    },
  });
  options.forEach((option) => {
    const node = element("option", { text: option.label, attrs: { value: option.value } });
    select.append(node);
  });
  select.value = value;
  return select;
}

export function textInput(label: string, focusId: string, value: string): HTMLInputElement {
  return element("input", {
    attrs: {
      "aria-label": label,
      "data-advanced-field": "tap-key",
      "data-focus-id": focusId,
      value,
    },
  });
}

export function fieldControl(label: string, control: HTMLElement): HTMLElement {
  return element("label", { className: "assignment-field" }, [
    element("span", { text: label }),
    control,
  ]);
}

export function colorSwatch(color: string): HTMLElement {
  const swatch = element("span", { className: "color-swatch" });
  swatch.style.background = color;
  return swatch;
}

export type ColorPickerOptions = {
  label: string;
  value: string;
  focusId: string;
  /** Live colour while dragging/typing; must not trigger a full re-render. */
  onPreview: (hex: string) => void;
  /** Final colour on release/blur/Enter; safe to re-render here. */
  onCommit: (hex: string) => void;
};

/**
 * Inline HSV picker: a saturation/brightness pad, a hue slider, and a hex
 * field. Dragging only calls `onPreview` so the element survives the gesture
 * (a re-render would drop pointer capture); the final value is committed once
 * the gesture ends.
 */
export function colorPicker(options: ColorPickerOptions): HTMLElement {
  let hsv = hexToHsv(options.value);

  const preview = element("span", { className: "color-picker-preview" });
  const cursor = element("span", { className: "color-picker-cursor" });
  const pad = element("div", {
    className: "color-picker-pad",
    attrs: {
      "aria-label": `${options.label} saturation and brightness`,
      "aria-valuemax": "100",
      "aria-valuemin": "0",
      "data-color-pad": "true",
      role: "slider",
      tabindex: "0",
    },
  }, [cursor]);
  const hue = element("input", {
    attrs: {
      "aria-label": `${options.label} hue`,
      "data-color-hue": "true",
      max: "360",
      min: "0",
      type: "range",
    },
  });
  const hexInput = element("input", {
    attrs: {
      "aria-label": `${options.label} hex value`,
      "data-color-hex": "true",
      "data-focus-id": options.focusId,
      spellcheck: "false",
      value: options.value,
    },
  });

  const paint = (): string => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    pad.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`;
    cursor.style.left = `${hsv.s * 100}%`;
    cursor.style.top = `${(1 - hsv.v) * 100}%`;
    preview.style.background = hex;
    pad.setAttribute("aria-valuetext", hex);
    hue.value = String(Math.round(hsv.h));
    if (document.activeElement !== hexInput) {
      hexInput.value = hex;
    }
    return hex;
  };
  const emitPreview = () => options.onPreview(paint());

  const setFromPointer = (event: PointerEvent) => {
    const rect = pad.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    hsv = {
      ...hsv,
      s: clamp01((event.clientX - rect.left) / rect.width),
      v: 1 - clamp01((event.clientY - rect.top) / rect.height),
    };
    emitPreview();
  };
  let dragging = false;
  pad.addEventListener("pointerdown", (event) => {
    dragging = true;
    pad.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (dragging) {
      setFromPointer(event);
    }
  });
  const endDrag = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    if (pad.hasPointerCapture(event.pointerId)) {
      pad.releasePointerCapture(event.pointerId);
    }
    // Commit on cancel too: the preview has already updated the board, so
    // reverting would silently discard the colour the operator just dragged to.
    options.onCommit(paint());
  };
  pad.addEventListener("pointerup", endDrag);
  pad.addEventListener("pointercancel", endDrag);
  pad.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowLeft") {
      hsv = { ...hsv, s: clamp01(hsv.s - step) };
    } else if (event.key === "ArrowRight") {
      hsv = { ...hsv, s: clamp01(hsv.s + step) };
    } else if (event.key === "ArrowUp") {
      hsv = { ...hsv, v: clamp01(hsv.v + step) };
    } else if (event.key === "ArrowDown") {
      hsv = { ...hsv, v: clamp01(hsv.v - step) };
    } else {
      return;
    }
    event.preventDefault();
    options.onCommit(paint());
  });

  hue.addEventListener("input", () => {
    hsv = { ...hsv, h: Number(hue.value) };
    emitPreview();
  });
  hue.addEventListener("change", () => options.onCommit(paint()));

  hexInput.addEventListener("input", () => {
    const normalized = normalizeHex(hexInput.value);
    if (!normalized) {
      return;
    }
    hsv = hexToHsv(normalized);
    emitPreview();
  });
  hexInput.addEventListener("change", () => {
    options.onCommit(normalizeHex(hexInput.value) ?? paint());
  });

  paint();

  return element("div", { className: "color-picker", attrs: { "data-color-picker": "true" } }, [
    pad,
    element("div", { className: "color-picker-controls" }, [
      hue,
      element("div", { className: "color-picker-readout" }, [preview, hexInput]),
    ]),
  ]);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function contextDisclosure(
  summary: string,
  id: string,
  children: Array<Node | string>,
): HTMLElement {
  return element("wa-details", {
    className: "context-disclosure",
    attrs: {
      "data-context-detail": id,
      appearance: "outlined",
      summary,
    },
  }, children);
}

export function definitionList(rows: Array<[string, string]>): HTMLElement {
  const list = element("dl");
  rows.forEach(([term, description]) => {
    list.append(definitionRow(term, description));
  });
  return list;
}

export function definitionRow(term: string, description: string): HTMLElement {
  return element("div", {}, [
    element("dt", { text: term }),
    element("dd", { text: description }),
  ]);
}

export function keycapLabel(
  assignment: Assignment | undefined,
  options: Parameters<typeof formatKeycap>[1] = {},
): string {
  return formatKeycap(assignment?.qmk, options);
}

export function layoutBounds(keys: VisualKey[]): { width: number; height: number } {
  return keys.reduce(
    (bounds, key) => ({
      width: Math.max(bounds.width, key.x + (key.w ?? 1)),
      height: Math.max(bounds.height, key.y + (key.h ?? 1)),
    }),
    { width: 0, height: 0 },
  );
}

type ElementOptions = {
  attrs?: Record<string, string>;
  className?: string;
  text?: string;
  type?: "button" | "reset" | "submit";
};

export function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementOptions,
  children?: Array<Node | string>,
): HTMLElementTagNameMap[K];
export function element(
  tagName: string,
  options?: ElementOptions,
  children?: Array<Node | string>,
): HTMLElement;
export function element(
  tagName: string,
  options: ElementOptions = {},
  children: Array<Node | string> = [],
): HTMLElement {
  const node = document.createElement(tagName);

  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.type !== undefined && node instanceof HTMLButtonElement) {
    node.type = options.type;
  }
  Object.entries(options.attrs ?? {}).forEach(([name, value]) => {
    node.setAttribute(name, value);
  });
  children.forEach((child) => node.append(child));

  return node;
}

export type UiButtonOptions = ElementOptions;

export function uiButton(options: UiButtonOptions = {}, children: Array<Node | string> = []): HTMLElement {
  const attrs = {
    ...(options.type ? { type: options.type } : {}),
    ...(options.attrs ?? {}),
  };
  const className = ["control-button", options.className].filter(Boolean).join(" ");
  const button = element(
    "wa-button",
    {
      ...options,
      className,
      attrs,
    },
    children,
  );
  if ("disabled" in attrs) {
    button.setAttribute("disabled", "");
    (button as HTMLElement & { disabled: boolean }).disabled = true;
  } else {
    (button as HTMLElement & { disabled: boolean }).disabled = false;
  }
  return button;
}
