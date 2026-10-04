import viaV5Max from "../../../../fixtures/via/keychron_v5_max_ansi_encoder.json";

/**
 * A Keychron (or any VIA board) that QMKUI can drive over the standard VIA
 * protocol. `matrix` is required for the dynamic-keymap read; without it a board
 * is still readable but only exposes VIA standard state.
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

const viaModels: ViaKeyboardModel[] = [
  {
    vendorId: (viaV5Max as { vendorId: string }).vendorId.toLowerCase(),
    productId: (viaV5Max as { productId: string }).productId.toLowerCase(),
    displayName: (viaV5Max as { name: string }).name,
    qmkKeyboard: "keychron/v5_max/ansi_encoder",
    matrix: (viaV5Max as { matrix: { rows: number; cols: number } }).matrix,
  },
];

/**
 * Look up a known VIA model by USB identity. Identity is the only reliable
 * signal VIA exposes over HID — there is no model string on the wire — so this
 * is the registry that turns a VID/PID into a name and matrix.
 */
export function viaModelFor(
  vendorId: number,
  productId: number,
): ViaKeyboardModel | undefined {
  const vid = hexId(vendorId);
  const pid = hexId(productId);
  return viaModels.find((model) => model.vendorId === vid && model.productId === pid);
}

/** True for any USB device claiming Keychron's vendor id. */
export function isKeychronVendor(vendorId: number): boolean {
  return vendorId === KEYCHRON_VENDOR_ID;
}

function hexId(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}
