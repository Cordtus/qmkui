import {
  classifyKeychronV5MaxIdentity,
  type HidIdentityMetadata,
  type KeychronV5MaxIdentityContract,
} from "./keychronV5MaxContract";
import {
  verifyKeychronV5MaxProtocolVersion,
  type KeychronV5MaxProtocolDevice,
  type KeychronV5MaxProtocolVersion,
} from "./keychronV5MaxProtocol";

type BrowserHidDevice = BrowserKeyboardIdentity & Partial<KeychronV5MaxProtocolDevice>;

type BrowserHidRequestOptions = {
  filters: ReadonlyArray<Record<string, never>>;
};

type BrowserHid = {
  getDevices(): Promise<readonly BrowserHidDevice[]>;
  requestDevice(options: BrowserHidRequestOptions): Promise<readonly BrowserHidDevice[]>;
};

export type BrowserKeyboardNavigator = {
  hid?: BrowserHid;
};

export type BrowserKeyboardIdentity = HidIdentityMetadata & {
  productName?: string;
};

export type BrowserKeyboardSession = {
  verifyProtocolVersion: () => Promise<KeychronV5MaxProtocolVersion>;
};

export type BrowserKeyboardSelection =
  | { state: "unavailable" }
  | { state: "no-authorized-device" }
  | { state: "no-selection" }
  | {
      state: "selected";
      identity: BrowserKeyboardIdentity;
      contract: Extract<KeychronV5MaxIdentityContract, { state: "partial" }>;
      session: BrowserKeyboardSession;
    }
  | {
      state: "selected";
      identity: BrowserKeyboardIdentity;
      contract: Extract<KeychronV5MaxIdentityContract, { state: "unsupported" }>;
    };

export type BrowserKeyboardDiscoveryDependencies = {
  verifyProtocolVersion?: (
    device: KeychronV5MaxProtocolDevice,
  ) => Promise<KeychronV5MaxProtocolVersion>;
};

export async function discoverAuthorizedBrowserKeyboard(
  browser: BrowserKeyboardNavigator = navigator as BrowserKeyboardNavigator,
  dependencies: BrowserKeyboardDiscoveryDependencies = {},
): Promise<BrowserKeyboardSelection> {
  if (!browser.hid) {
    return { state: "unavailable" };
  }

  return classifySelection(
    await browser.hid.getDevices(),
    { state: "no-authorized-device" },
    dependencies,
  );
}

export async function chooseBrowserKeyboard(
  browser: BrowserKeyboardNavigator = navigator as BrowserKeyboardNavigator,
  dependencies: BrowserKeyboardDiscoveryDependencies = {},
): Promise<BrowserKeyboardSelection> {
  if (!browser.hid) {
    return { state: "unavailable" };
  }

  return classifySelection(
    await browser.hid.requestDevice({ filters: [] }),
    { state: "no-selection" },
    dependencies,
  );
}

function classifySelection(
  devices: readonly BrowserHidDevice[],
  empty: Extract<BrowserKeyboardSelection, { state: "no-authorized-device" | "no-selection" }>,
  dependencies: BrowserKeyboardDiscoveryDependencies,
): BrowserKeyboardSelection {
  if (devices.length === 0) {
    return empty;
  }

  const classified = devices.map((device) => {
    const identity = staticIdentity(device);
    return { device, identity, contract: classifyKeychronV5MaxIdentity(identity) };
  });
  const selected = classified.find(({ contract }) => contract.state === "partial") ?? classified[0];

  if (selected.contract.state === "partial") {
    return {
      state: "selected",
      identity: selected.identity,
      contract: selected.contract,
      session: protocolSession(
        selected.device as KeychronV5MaxProtocolDevice,
        dependencies.verifyProtocolVersion ?? verifyKeychronV5MaxProtocolVersion,
      ),
    };
  }

  return {
    state: "selected",
    identity: selected.identity,
    contract: selected.contract,
  };
}

function protocolSession(
  device: KeychronV5MaxProtocolDevice,
  verifyProtocolVersion: (device: KeychronV5MaxProtocolDevice) => Promise<KeychronV5MaxProtocolVersion>,
): BrowserKeyboardSession {
  return {
    verifyProtocolVersion: () => verifyProtocolVersion(device),
  };
}

function staticIdentity(device: BrowserHidDevice): BrowserKeyboardIdentity {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    ...(device.productName ? { productName: device.productName } : {}),
    collections: device.collections.map(({ usagePage, usage }) => ({ usagePage, usage })),
  };
}
