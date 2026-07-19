export type HidCollectionMetadata = {
  usagePage: number;
  usage: number;
};

export type HidIdentityMetadata = {
  vendorId: number;
  productId: number;
  collections: readonly HidCollectionMetadata[];
};

export type KeychronV5MaxIdentityContract =
  | { state: "unsupported" }
  | {
      state: "partial";
      capabilities: {
        protocolVersion: true;
        read: boolean;
        write: false;
        flash: false;
      };
    };

const KEYCHRON_VENDOR_ID = 0x3434;
const V5_MAX_ANSI_KNOB_PRODUCT_ID = 0x0950;
const VENDOR_COLLECTION = { usagePage: 0xff60, usage: 0x0061 };

/**
 * Verified from the bundled V5 Max ANSI Knob definition. These dimensions are
 * required by VIA's dynamic-keymap protocol; they are not inferred from an
 * attached HID device or filled from a default keymap.
 */
export const keychronV5MaxReadDefinition = Object.freeze({
  keymap: Object.freeze({ layerCount: 4, rows: 6, columns: 19 }),
});

export function classifyKeychronV5MaxIdentity(
  identity: HidIdentityMetadata,
): KeychronV5MaxIdentityContract {
  if (
    identity.vendorId !== KEYCHRON_VENDOR_ID ||
    identity.productId !== V5_MAX_ANSI_KNOB_PRODUCT_ID ||
    !identity.collections.some(isVendorCollection)
  ) {
    return { state: "unsupported" };
  }

  return {
    state: "partial",
    capabilities: {
      protocolVersion: true,
      read: true,
      write: false,
      flash: false,
    },
  };
}

function isVendorCollection(collection: HidCollectionMetadata): boolean {
  return (
    collection.usagePage === VENDOR_COLLECTION.usagePage &&
    collection.usage === VENDOR_COLLECTION.usage
  );
}
