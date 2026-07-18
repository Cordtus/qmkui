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

type BrowserHidDevice = HidIdentityMetadata & Partial<KeychronV5MaxProtocolDevice>;

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

export type KeychronV5MaxBrowserSession = {
  verifyProtocolVersion: () => Promise<KeychronV5MaxProtocolVersion>;
};

export type KeychronV5MaxBrowserDependencies = {
  verifyProtocolVersion?: (
    device: KeychronV5MaxProtocolDevice,
  ) => Promise<KeychronV5MaxProtocolVersion>;
};

export type KeychronV5MaxBrowserSelection =
  | { state: "unavailable" }
  | { state: "no-selection" }
  | {
      state: "selected";
      identity: HidIdentityMetadata;
      contract: Extract<KeychronV5MaxIdentityContract, { state: "partial" }>;
      session: KeychronV5MaxBrowserSession;
    }
  | {
      state: "selected";
      identity: HidIdentityMetadata;
      contract: Extract<KeychronV5MaxIdentityContract, { state: "unsupported" }>;
    };

export async function selectKeychronV5MaxBrowserDevice(
  browser: KeychronV5MaxBrowserNavigator = navigator as KeychronV5MaxBrowserNavigator,
  dependencies: KeychronV5MaxBrowserDependencies = {},
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
      return { device, identity, contract: classifyKeychronV5MaxIdentity(identity) };
    })
    .find(({ contract }) => contract.state === "partial");
  if (selected && selected.contract.state === "partial") {
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

  const identity = staticIdentity(devices[0]);
  const contract = classifyKeychronV5MaxIdentity(identity);
  if (contract.state === "partial") {
    return {
      state: "selected",
      identity,
      contract,
      session: protocolSession(
        devices[0] as KeychronV5MaxProtocolDevice,
        dependencies.verifyProtocolVersion ?? verifyKeychronV5MaxProtocolVersion,
      ),
    };
  }
  return {
    state: "selected",
    identity,
    contract,
  };
}

function protocolSession(
  device: KeychronV5MaxProtocolDevice,
  verifyProtocolVersion: (device: KeychronV5MaxProtocolDevice) => Promise<KeychronV5MaxProtocolVersion>,
): KeychronV5MaxBrowserSession {
  return {
    verifyProtocolVersion: () => verifyProtocolVersion(device),
  };
}

function staticIdentity(device: BrowserHidDevice): HidIdentityMetadata {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    collections: device.collections.map(({ usagePage, usage }) => ({ usagePage, usage })),
  };
}
