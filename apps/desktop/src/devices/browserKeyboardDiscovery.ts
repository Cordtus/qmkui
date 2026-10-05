import {
  classifyViaIdentity,
  type HidIdentityMetadata,
  type ViaIdentityContract,
} from "./keychronV5MaxContract";
import { findViaModel, type ViaKeyboardModel } from "./keychronModels";
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
  /** Global VIA RGB-matrix state write (volatile until `saveEeprom`). */
  writeRgbMatrix?: (state: {
    brightness: number;
    effectSpeed: number;
    hue: number;
    saturation: number;
    /** Firmware effect id; omitted to leave the current effect untouched. */
    effect?: number;
  }) => Promise<void>;
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
      contract: Extract<ViaIdentityContract, { state: "via" }>;
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
      contract: Extract<ViaIdentityContract, { state: "unsupported" }>;
    };

export type BrowserKeyboardDiscoveryDependencies = {
  /** Known models used to identify a device by VID/PID. */
  models?: readonly ViaKeyboardModel[];
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

  const models = dependencies.models ?? [];
  const classified = devices.map((device) => {
    const identity = deviceIdentity(device, true);
    return { device, identity, contract: classifyViaIdentity(identity, models) };
  });
  const selected = classified.find(({ contract }) => contract.state === "via")
    ?? classified[0];
  const identity = deviceIdentity(selected.device, true);

  // Unrecognized VIA boards (no bundled model/matrix) still read standard state.
  if (selected.contract.state !== "via") {
    return { state: "selected", identity, contract: selected.contract };
  }

  const model = selected.contract.model ?? findViaModel(models, selected.identity.vendorId, selected.identity.productId);
  if (!model?.matrix) {
    return {
      state: "selected",
      identity,
      contract: { state: "unverified-via" },
      viaSession: genericViaSession(
        selected.device as GenericViaReaderDevice,
        dependencies.readStandardState ?? readGenericViaStandardState,
      ),
    };
  }

  return {
    state: "selected",
    identity,
    contract: selected.contract,
    session: protocolSession(
      selected.device as KeychronV5MaxReaderDevice,
      model,
      dependencies.verifyProtocolVersion ?? verifyKeychronV5MaxProtocolVersion,
      dependencies.readSnapshot ?? readKeychronV5MaxSnapshot,
    ),
  };
}

function protocolSession(
  device: KeychronV5MaxReaderDevice,
  model: ViaKeyboardModel,
  verifyProtocolVersion: (device: KeychronV5MaxProtocolDevice) => Promise<KeychronV5MaxProtocolVersion>,
  readSnapshot: (
    device: KeychronV5MaxReaderDevice,
    options?: KeychronV5MaxReaderOptions,
  ) => Promise<KeychronV5MaxReadSnapshot>,
): BrowserKeyboardSession {
  return {
    capabilities: { canRead: true, canWrite: false, canFlash: false },
    verifyProtocolVersion: () => verifyProtocolVersion(device as KeychronV5MaxProtocolDevice),
    readSnapshot: () => readSnapshot(device, { model }),
    writeKeycode: (layer, row, col, keycode) =>
      withOpen(device, () => new ViaWriteProtocol(device).setKeycode(layer, row, col, keycode)),
    writeRgbMatrix: ({ brightness, effect, effectSpeed, hue, saturation }) =>
      withOpen(device, async () => {
        const write = new ViaWriteProtocol(device);
        await write.setRgbMatrixBrightness(brightness);
        if (effect !== undefined) {
          await write.setRgbMatrixEffect(effect);
        }
        await write.setRgbMatrixEffectSpeed(effectSpeed);
        await write.setRgbMatrixColor(hue, saturation);
      }),
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


