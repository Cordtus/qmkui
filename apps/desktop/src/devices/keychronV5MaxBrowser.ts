import {
  classifyKeychronV5MaxIdentity,
  type HidIdentityMetadata,
  type KeychronV5MaxIdentityContract,
} from "./keychronV5MaxContract";

type BrowserHidDevice = HidIdentityMetadata;

type BrowserHidRequestOptions = {
  filters: ReadonlyArray<{
    vendorId: number;
    productId: number;
    usagePage: number;
    usage: number;
  }>;
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

  const devices = await browser.hid.requestDevice({
    filters: [{ vendorId: 0x3434, productId: 0x0950, usagePage: 0xff60, usage: 0x0061 }],
  });
  if (devices.length === 0) {
    return { state: "no-selection" };
  }

  const selected = devices
    .map((device) => {
      const identity = staticIdentity(device);
      return { identity, contract: classifyKeychronV5MaxIdentity(identity) };
    })
    .find(({ contract }) => contract.state === "partial");
  if (selected) {
    return { state: "selected", ...selected };
  }

  const identity = staticIdentity(devices[0]);
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
