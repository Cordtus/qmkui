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
        read: false;
        write: false;
        flash: false;
      };
    };

const KEYCHRON_VENDOR_ID = 0x3434;
const V5_MAX_ANSI_KNOB_PRODUCT_ID = 0x0950;
const VENDOR_COLLECTION = { usagePage: 0xff60, usage: 0x0061 };

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
      read: false,
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
