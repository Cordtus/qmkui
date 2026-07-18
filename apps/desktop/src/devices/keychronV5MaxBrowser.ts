import {
  classifyKeychronV5MaxIdentity,
  type HidIdentityMetadata,
  type KeychronV5MaxIdentityContract,
} from "./keychronV5MaxContract";

type BrowserHidDevice = HidIdentityMetadata;

type BrowserHidRequestOptions = {
  filters: ReadonlyArray<{ vendorId: number; productId: number }>;
};

type BrowserHid = {
  requestDevice(options: BrowserHidRequestOptions): Promise<readonly BrowserHidDevice[]>;
};

export type KeychronV5MaxBrowserNavigator = {
  hid?: BrowserHid;
};

export type KeychronV5MaxBrowserSelection =
  | { state: "unavailable" }
  | { state: "no-selection" }
  | {
      state: "selected";
      identity: HidIdentityMetadata;
      contract: KeychronV5MaxIdentityContract;
    };

export async function selectKeychronV5MaxBrowserDevice(
  browser: KeychronV5MaxBrowserNavigator = navigator as KeychronV5MaxBrowserNavigator,
): Promise<KeychronV5MaxBrowserSelection> {
  if (!browser.hid) {
    return { state: "unavailable" };
  }

  const [device] = await browser.hid.requestDevice({
    filters: [{ vendorId: 0x3434, productId: 0x0950 }],
  });
  if (!device) {
    return { state: "no-selection" };
  }

  const identity = staticIdentity(device);
  return {
    state: "selected",
    identity,
    contract: classifyKeychronV5MaxIdentity(identity),
  };
}

function staticIdentity(device: BrowserHidDevice): HidIdentityMetadata {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    collections: device.collections.map(({ usagePage, usage }) => ({ usagePage, usage })),
  };
}
