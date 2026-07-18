export type UsbIdentity = {
  vendorId: number;
  productId: number;
};

export type KeyboardIdentityCatalogRecord = {
  id: string;
  displayName: string;
  qmkKeyboard: string;
  usb: UsbIdentity;
  layout: {
    macro: string;
    keyCount: number;
  };
  deviceSupport: "identityOnly" | "protocolVersion";
  upstream: {
    identity: QmkFirmwareSource;
    layout: QmkFirmwareSource;
  };
};

type QmkFirmwareSource = {
  repository: "Keychron/qmk_firmware";
  commit: "bc1bdeb85f39cccd5e503f4d8f472078a8c1472a";
  path: string;
  blob: string;
};

const KEYCHRON_VENDOR_ID = 0x3434;
const KEYCHRON_FIRMWARE_COMMIT = "bc1bdeb85f39cccd5e503f4d8f472078a8c1472a";

export const initialKeyboardCatalog: readonly KeyboardIdentityCatalogRecord[] = Object.freeze([
  keychronRecord({
    id: "keychron/q1_max/ansi_encoder",
    displayName: "Keychron Q1 Max ANSI Knob",
    productId: 0x0810,
    layout: { macro: "LAYOUT_ansi_82", keyCount: 82 },
    deviceSupport: "identityOnly",
    identitySource: {
      path: "keyboards/keychron/q1_max/ansi_encoder/keyboard.json",
      blob: "8e25783ff3fe8586c46758cbeb87f08d9595ce8a",
    },
  }),
  keychronRecord({
    id: "keychron/v1_max/ansi_encoder",
    displayName: "Keychron V1 Max ANSI Knob",
    productId: 0x0913,
    layout: { macro: "LAYOUT_ansi_82", keyCount: 82 },
    deviceSupport: "identityOnly",
    identitySource: {
      path: "keyboards/keychron/v1_max/ansi_encoder/keyboard.json",
      blob: "4dc6a51cd6fe8813708c1b15e03b9161ed65bdc6",
    },
  }),
  keychronRecord({
    id: "keychron/v5_max/ansi_encoder",
    displayName: "Keychron V5 Max ANSI Knob",
    productId: 0x0950,
    layout: { macro: "LAYOUT_ansi_98", keyCount: 98 },
    deviceSupport: "protocolVersion",
    identitySource: {
      path: "keyboards/keychron/v5_max/ansi_encoder/keyboard.json",
      blob: "f1327a439e8fbb987462b2020c58835cbe291462",
    },
  }),
  keychronRecord({
    id: "keychron/v6_max/ansi_encoder",
    displayName: "Keychron V6 Max ANSI Knob",
    productId: 0x0960,
    layout: { macro: "LAYOUT_ansi_109", keyCount: 109 },
    deviceSupport: "identityOnly",
    identitySource: {
      path: "keyboards/keychron/v6_max/ansi_encoder/keyboard.json",
      blob: "22da2817a3502a094c8955760263d626367c591f",
    },
  }),
  keychronRecord({
    id: "keychron/k8_pro/ansi/rgb",
    displayName: "Keychron K8 Pro ANSI RGB",
    productId: 0x0280,
    layout: { macro: "LAYOUT_tkl_ansi", keyCount: 87 },
    deviceSupport: "identityOnly",
    identitySource: {
      path: "keyboards/keychron/k8_pro/ansi/rgb/keyboard.json",
      blob: "11d5c5fcbfea0f9b87945b4a8c5ab6fb19f7f57a",
    },
    layoutSource: {
      path: "keyboards/keychron/k8_pro/info.json",
      blob: "420badc24df3e6a541b5d3ceb8ef4eb2699dbfa8",
    },
  }),
]);

export function findKeyboardByUsbIdentity(identity: UsbIdentity): KeyboardIdentityCatalogRecord | undefined {
  return initialKeyboardCatalog.find(
    (keyboard) =>
      keyboard.usb.vendorId === identity.vendorId && keyboard.usb.productId === identity.productId,
  );
}

function keychronRecord(
  input: Omit<KeyboardIdentityCatalogRecord, "qmkKeyboard" | "usb" | "upstream"> & {
    productId: number;
    identitySource: Pick<QmkFirmwareSource, "path" | "blob">;
    layoutSource?: Pick<QmkFirmwareSource, "path" | "blob">;
  },
): KeyboardIdentityCatalogRecord {
  const identity = keychronSource(input.identitySource);
  const layout = keychronSource(input.layoutSource ?? input.identitySource);

  return Object.freeze({
    id: input.id,
    displayName: input.displayName,
    qmkKeyboard: input.id,
    usb: Object.freeze({ vendorId: KEYCHRON_VENDOR_ID, productId: input.productId }),
    layout: Object.freeze(input.layout),
    deviceSupport: input.deviceSupport,
    upstream: Object.freeze({ identity, layout }),
  });
}

function keychronSource(source: Pick<QmkFirmwareSource, "path" | "blob">): QmkFirmwareSource {
  return Object.freeze({
    repository: "Keychron/qmk_firmware",
    commit: KEYCHRON_FIRMWARE_COMMIT,
    path: source.path,
    blob: source.blob,
  });
}
