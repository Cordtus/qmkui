import {
  classifyKeychronV5MaxIdentity,
  keychronV5MaxReadDefinition,
  type HidIdentityMetadata,
  type KeychronV5MaxIdentityContract,
} from "./keychronV5MaxContract";
import {
  verifyKeychronV5MaxProtocolVersion,
  type KeychronV5MaxProtocolDevice,
  type KeychronV5MaxProtocolVersion,
} from "./keychronV5MaxProtocol";
import {
  readKeychronV5MaxSnapshot,
  type KeychronV5MaxReaderDevice,
  type KeychronV5MaxReaderOptions,
  type KeychronV5MaxReadSnapshot,
} from "./keychronV5MaxReader";
import {
  readGenericViaStandardState,
  type GenericViaReaderDevice,
  type GenericViaStandardState,
} from "./genericViaReader";
import { ViaReadProtocol } from "./viaReadProtocol";
import { ViaWriteProtocol } from "./viaWrite";
import { withOpen } from "./transport";

type BrowserHidDevice = BrowserKeyboardIdentity & Partial<KeychronV5MaxReaderDevice>;

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
  capabilities: {
    canRead: true;
    canWrite: false;
    canFlash: false;
  };
  verifyProtocolVersion: () => Promise<KeychronV5MaxProtocolVersion>;
  readSnapshot: () => Promise<KeychronV5MaxReadSnapshot>;
  writeKeycode?: (layer: number, row: number, col: number, keycode: number) => Promise<void>;
  saveEeprom?: () => Promise<void>;
};

export type GenericViaBrowserKeyboardSession = {
  readonly capabilities: {
    readonly canRead: boolean;
    readonly canWrite: false;
    readonly canFlash: false;
  };
  verifyProtocolVersion: () => Promise<{ version: number }>;
  readStandardState: () => Promise<GenericViaStandardState>;
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
      contract: { state: "unverified-via" };
      viaSession: GenericViaBrowserKeyboardSession;
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
  readSnapshot?: (device: KeychronV5MaxReaderDevice) => Promise<KeychronV5MaxReadSnapshot>;
  readStandardState?: (device: GenericViaReaderDevice, options: { protocolVersion: number }) => Promise<GenericViaStandardState>;
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
    const identity = deviceIdentity(device, true);
    return {
      device,
      identity,
      contract: classifyKeychronV5MaxIdentity(identity),
    };
  });
  const selected = classified.find(({ contract }) => contract.state === "partial")
    ?? classified.find(({ identity }) => isPossibleViaDevice(identity))
    ?? classified[0];

  if (selected.contract.state === "partial") {
    return {
      state: "selected",
      identity: selected.identity,
      contract: selected.contract,
      session: protocolSession(
        selected.device as KeychronV5MaxReaderDevice,
        dependencies.verifyProtocolVersion ?? verifyKeychronV5MaxProtocolVersion,
        dependencies.readSnapshot ?? readKeychronV5MaxSnapshot,
      ),
    };
  }

  if (isPossibleViaDevice(selected.identity)) {
    return {
      state: "selected",
      identity: deviceIdentity(selected.device),
      contract: { state: "unverified-via" },
      viaSession: genericViaSession(
        selected.device as GenericViaReaderDevice,
        dependencies.readStandardState ?? readGenericViaStandardState,
      ),
    };
  }

  return {
    state: "selected",
    identity: deviceIdentity(selected.device),
    contract: selected.contract,
  };
}

function protocolSession(
  device: KeychronV5MaxReaderDevice,
  verifyProtocolVersion: (device: KeychronV5MaxProtocolDevice) => Promise<KeychronV5MaxProtocolVersion>,
  readSnapshot: (
    device: KeychronV5MaxReaderDevice,
    options?: KeychronV5MaxReaderOptions,
  ) => Promise<KeychronV5MaxReadSnapshot>,
): BrowserKeyboardSession {
  return {
    capabilities: { canRead: true, canWrite: false, canFlash: false },
    verifyProtocolVersion: () => verifyProtocolVersion(device as KeychronV5MaxProtocolDevice),
    readSnapshot: () => readSnapshot(device, { keymap: keychronV5MaxReadDefinition.keymap }),
    writeKeycode: (layer, row, col, keycode) =>
      withOpen(device, () => new ViaWriteProtocol(device).setKeycode(layer, row, col, keycode)),
    saveEeprom: () => withOpen(device, () => new ViaWriteProtocol(device).saveEeprom()),
  };
}

function genericViaSession(
  device: GenericViaReaderDevice,
  readStandardState: (device: GenericViaReaderDevice, options: { protocolVersion: number }) => Promise<GenericViaStandardState>,
): GenericViaBrowserKeyboardSession {
  let verifiedProtocolVersion: number | undefined;
  return {
    get capabilities() {
      return { canRead: verifiedProtocolVersion !== undefined, canWrite: false as const, canFlash: false as const };
    },
    async verifyProtocolVersion() {
      return withOpen(device, async () => {
        verifiedProtocolVersion = await new ViaReadProtocol(device).getProtocolVersion();
        return { version: verifiedProtocolVersion };
      });
    },
    async readStandardState() {
      if (verifiedProtocolVersion === undefined) {
        throw new Error("Generic VIA protocol was not verified.");
      }
      return readStandardState(device, { protocolVersion: verifiedProtocolVersion });
    },
  };
}

function deviceIdentity(
  device: BrowserHidDevice,
  includeProductName = false,
): BrowserKeyboardIdentity {
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    ...(includeProductName && device.productName ? { productName: device.productName } : {}),
    collections: device.collections.map(({ usagePage, usage }) => ({ usagePage, usage })),
  };
}

function isPossibleViaDevice(identity: BrowserKeyboardIdentity): boolean {
  return identity.collections.some(({ usagePage, usage }) => usagePage === 0xff60 && usage === 0x0061);
}
