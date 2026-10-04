import {
  type ViaKeyboardModel,
  isKeychronVendor,
  viaModelFor,
} from "./keychronModels";

export type HidCollectionMetadata = {
  usagePage: number;
  usage: number;
};

export type HidIdentityMetadata = {
  vendorId: number;
  productId: number;
  collections: readonly HidCollectionMetadata[];
};

export type RawHidCollection = { usagePage: number; usage: number };

/**
 * How much of QMKUI can talk to a device, decided purely from its USB identity
 * and HID collections. `read` is true for any VIA-capable board (the vendor
 * usage page 0xff60/0x0061 collection); `model` is present only when the
 * bundled VIA definitions can supply a keymap matrix and name.
 */
export type ViaIdentityContract =
  | { state: "unsupported" }
  | {
      state: "via";
      /** The matched model, or undefined for an unrecognized VIA board. */
      model?: ViaKeyboardModel;
      capabilities: {
        protocolVersion: true;
        read: boolean;
        write: false;
        flash: false;
      };
    };

/** The VIA / QMK Raw HID interface collection every VIA keyboard exposes. */
const VIA_COLLECTION: RawHidCollection = { usagePage: 0xff60, usage: 0x0061 };

/**
 * Classify a HID device as a VIA keyboard. Recognition is USB-identity based
 * because VIA's protocol carries no model string: any device exposing the VIA
 * collection is readable, and the bundled model registry upgrades a known
 * VID/PID to a named board with a readable keymap.
 */
export function classifyViaIdentity(identity: HidIdentityMetadata): ViaIdentityContract {
  if (!identity.collections.some(isViaCollection)) {
    return { state: "unsupported" };
  }

  const model = viaModelFor(identity.vendorId, identity.productId);
  return {
    state: "via",
    ...(model ? { model } : {}),
    capabilities: {
      protocolVersion: true,
      // A keymap read needs verified matrix dimensions, which only a known
      // model provides; unknown VIA boards still expose printable glyphs,
      // matrix dimensions, etc.
      read: Boolean(model?.matrix),
      write: false,
      flash: false,
    },
  };
}

export function isKeychron(identity: HidIdentityMetadata): boolean {
  return isKeychronVendor(identity.vendorId);
}

function isViaCollection(collection: HidCollectionMetadata): boolean {
  return (
    collection.usagePage === VIA_COLLECTION.usagePage &&
    collection.usage === VIA_COLLECTION.usage
  );
}
