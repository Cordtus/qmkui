import type { KeyboardDefinition } from "../domain";
import viaV5Max from "../../../../fixtures/via/keychron_v5_max_ansi_encoder.json";

/**
 * A VIA-capable keyboard QMKUI can name and (when a matrix is known) read the
 * dynamic keymap from.
 */
export type ViaKeyboardModel = {
  /** VID/PID as lowercase `0x`-prefixed hex, matching the VIA definition. */
  vendorId: string;
  productId: string;
  displayName: string;
  /** QMK keyboard path, e.g. `keychron/v5_max/ansi_encoder`. */
  qmkKeyboard: string;
  matrix?: { rows: number; cols: number };
};

/** Every Keychron board shares this USB vendor id. */
export const KEYCHRON_VENDOR_ID = 0x3434;

/**
 * The V5 Maximatrix lives in its VIA definition rather than the catalog
 * keyboard, so it is pinned here as the authoritative matrix source.
 */
const viaDefinitionMatrices: Record<string, { rows: number; cols: number }> = {
  "keychron/v5_max/ansi_encoder": (viaV5Max as { matrix: { rows: number; cols: number } }).matrix,
};

/**
 * Build the model registry from the bundled keyboard definitions. Any keyboard
 * with a USB id becomes identifiable; a known matrix (from the definition or the
 * VIA matrix table) upgrades it to a full keymap read. Adding a board to the
 * catalog is all it takes to support it here.
 */
export function buildViaModels(keyboards: readonly KeyboardDefinition[]): ViaKeyboardModel[] {
  return keyboards.flatMap((keyboard) => {
    const usb = keyboard.usb;
    if (!usb?.vid || !usb?.pid) {
      return [];
    }
    const matrix = keyboard.matrix ?? viaDefinitionMatrices[keyboard.qmkKeyboard];
    return [
      {
        vendorId: normalizeUsbId(usb.vid),
        productId: normalizeUsbId(usb.pid),
        displayName: keyboard.displayName,
        qmkKeyboard: keyboard.qmkKeyboard,
        ...(matrix ? { matrix } : {}),
      },
    ];
  });
}

/** Look up a model by USB identity in an already-built registry. */
export function findViaModel(
  models: readonly ViaKeyboardModel[],
  vendorId: number,
  productId: number,
): ViaKeyboardModel | undefined {
  const vid = hexId(vendorId);
  const pid = hexId(productId);
  return models.find((model) => model.vendorId === vid && model.productId === pid);
}

/** True for any USB device claiming Keychron's vendor id. */
export function isKeychronVendor(vendorId: number): boolean {
  return vendorId === KEYCHRON_VENDOR_ID;
}

function normalizeUsbId(value: string): string {
  const parsed = Number.parseInt(value.replace(/^0x/i, ""), 16);
  return Number.isNaN(parsed) ? value.toLowerCase() : hexId(parsed);
}

function hexId(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}
