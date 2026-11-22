import arrowFatLineUp from "@phosphor-icons/core/assets/regular/arrow-fat-line-up.svg?raw";
import arrowUUpLeft from "@phosphor-icons/core/assets/regular/arrow-u-up-left.svg?raw";
import arrowUUpRight from "@phosphor-icons/core/assets/regular/arrow-u-up-right.svg?raw";
import arrowsClockwise from "@phosphor-icons/core/assets/regular/arrows-clockwise.svg?raw";
import caretDown from "@phosphor-icons/core/assets/regular/caret-down.svg?raw";
import checkCircle from "@phosphor-icons/core/assets/regular/check-circle.svg?raw";
import copy from "@phosphor-icons/core/assets/regular/copy.svg?raw";
import cursorClick from "@phosphor-icons/core/assets/regular/cursor-click.svg?raw";
import dotsThree from "@phosphor-icons/core/assets/regular/dots-three.svg?raw";
import downloadSimple from "@phosphor-icons/core/assets/regular/download-simple.svg?raw";
import eye from "@phosphor-icons/core/assets/regular/eye.svg?raw";
import fileCode from "@phosphor-icons/core/assets/regular/file-code.svg?raw";
import floppyDisk from "@phosphor-icons/core/assets/regular/floppy-disk.svg?raw";
import hammer from "@phosphor-icons/core/assets/regular/hammer.svg?raw";
import keyboard from "@phosphor-icons/core/assets/regular/keyboard.svg?raw";
import key from "@phosphor-icons/core/assets/regular/key.svg?raw";
import lightbulb from "@phosphor-icons/core/assets/regular/lightbulb.svg?raw";
import lightning from "@phosphor-icons/core/assets/regular/lightning.svg?raw";
import lock from "@phosphor-icons/core/assets/regular/lock.svg?raw";
import magnifyingGlass from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import minus from "@phosphor-icons/core/assets/regular/minus.svg?raw";
import paintBrush from "@phosphor-icons/core/assets/regular/paint-brush.svg?raw";
import plug from "@phosphor-icons/core/assets/regular/plug.svg?raw";
import plus from "@phosphor-icons/core/assets/regular/plus.svg?raw";
import stack from "@phosphor-icons/core/assets/regular/stack.svg?raw";
import sun from "@phosphor-icons/core/assets/regular/sun.svg?raw";
import usb from "@phosphor-icons/core/assets/regular/usb.svg?raw";
import warning from "@phosphor-icons/core/assets/regular/warning.svg?raw";
import x from "@phosphor-icons/core/assets/regular/x.svg?raw";
import xCircle from "@phosphor-icons/core/assets/regular/x-circle.svg?raw";

/**
 * One icon family for the whole workbench. Library SVGs are imported raw so
 * they ship with the bundle: no CDN, no font, no CSP hole.
 */
export type IconName =
  | "arrow-fat-line-up"
  | "arrow-u-up-left"
  | "arrow-u-up-right"
  | "arrows-clockwise"
  | "caret-down"
  | "check-circle"
  | "copy"
  | "cursor-click"
  | "dots-three"
  | "download-simple"
  | "eye"
  | "file-code"
  | "floppy-disk"
  | "hammer"
  | "key"
  | "keyboard"
  | "lightbulb"
  | "lightning"
  | "lock"
  | "magnifying-glass"
  | "minus"
  | "paint-brush"
  | "plug"
  | "plus"
  | "stack"
  | "sun"
  | "usb"
  | "warning"
  | "x"
  | "x-circle";

const sources: Record<IconName, string> = {
  "arrow-fat-line-up": arrowFatLineUp,
  "arrow-u-up-left": arrowUUpLeft,
  "arrow-u-up-right": arrowUUpRight,
  "arrows-clockwise": arrowsClockwise,
  "caret-down": caretDown,
  "check-circle": checkCircle,
  copy,
  "cursor-click": cursorClick,
  "dots-three": dotsThree,
  "download-simple": downloadSimple,
  eye,
  "file-code": fileCode,
  "floppy-disk": floppyDisk,
  hammer,
  key,
  keyboard,
  lightbulb,
  lightning,
  lock,
  "magnifying-glass": magnifyingGlass,
  minus,
  "paint-brush": paintBrush,
  plug,
  plus,
  stack,
  sun,
  usb,
  warning,
  x,
  "x-circle": xCircle,
};

const cache = new Map<IconName, SVGElement>();

export type IconOptions = {
  size?: number;
  /** Accessible name. Omit for decorative icons. */
  label?: string;
  className?: string;
};

export function icon(name: IconName, options: IconOptions = {}): SVGSVGElement {
  let template = cache.get(name);
  if (!template) {
    const parsed = new DOMParser().parseFromString(sources[name], "image/svg+xml");
    template = document.importNode(parsed.documentElement, true) as unknown as SVGElement;
    cache.set(name, template);
  }
  const svg = template.cloneNode(true) as unknown as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("width", String(options.size ?? 16));
  svg.setAttribute("height", String(options.size ?? 16));
  svg.setAttribute("fill", "currentColor");
  svg.classList.add("icon");
  if (options.className) {
    svg.classList.add(...options.className.split(/\s+/).filter(Boolean));
  }
  if (options.label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", options.label);
    svg.removeAttribute("aria-hidden");
  } else {
    svg.setAttribute("aria-hidden", "true");
    svg.removeAttribute("role");
    svg.removeAttribute("aria-label");
  }
  return svg;
}
