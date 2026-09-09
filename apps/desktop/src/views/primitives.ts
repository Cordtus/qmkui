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
