import type { FeatureCapabilities, LightingProfile, Project } from "../domain";

export type ValueState<Value> =
  | { readonly state: "available"; readonly value: Value }
  | { readonly state: "unavailable"; readonly reason: string }
  | { readonly state: "unverified"; readonly reason: string };

export type HardwareIdentity = {
  modelId: string;
  displayName: string;
  firmwareVersion: string;
};

export type HardwareLayout = {
  keyboardId: string;
  rows: number;
  columns: number;
  keyMapping: Record<string, { row: number; column: number }>;
};

export type DefaultConfigurationBaseline = {
  source: string;
  keymapLayers: Project["layers"];
  lighting: LightingProfile[];
};

export type HardwareSnapshotInput = {
  hardware: {
    identity: ValueState<HardwareIdentity>;
    layout: ValueState<HardwareLayout>;
    capabilities: ValueState<FeatureCapabilities>;
  };
  configuration: {
    keymapLayers: ValueState<Project["layers"]>;
    lighting: ValueState<LightingProfile[]>;
  };
  readAt: string;
  defaultBaseline?: ValueState<DefaultConfigurationBaseline>;
};

export type HardwareSnapshot = ReadonlyDeep<HardwareSnapshotInput>;

export type ReadonlyDeep<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly ReadonlyDeep<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: ReadonlyDeep<Value[Key]> }
      : Value;

export function available<Value>(value: Value): ValueState<Value> {
  return { state: "available", value };
}

export function unavailable(reason: string): ValueState<never> {
  return { state: "unavailable", reason };
}

export function unverified(reason: string): ValueState<never> {
  return { state: "unverified", reason };
}

export function createHardwareSnapshot(input: HardwareSnapshotInput): HardwareSnapshot {
  return cloneAndFreeze(input);
}

function cloneAndFreeze<Value>(value: Value, ancestors = new WeakSet<object>()): ReadonlyDeep<Value> {
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("Hardware snapshots can only contain plain data.");
  }

  if (value === null || typeof value !== "object") {
    return value as ReadonlyDeep<Value>;
  }

  if (ancestors.has(value)) {
    throw new TypeError("Hardware snapshots cannot contain circular data.");
  }
  ancestors.add(value);

  const copy = Array.isArray(value)
    ? cloneArray(value, ancestors)
    : clonePlainObject(value, ancestors);

  ancestors.delete(value);
  return Object.freeze(copy) as ReadonlyDeep<Value>;
}

function clonePlainObject(value: object, ancestors: WeakSet<object>): Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Hardware snapshots can only contain plain data.");
  }

  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = plainDataDescriptor(value, key);
    Object.defineProperty(copy, key, {
      configurable: false,
      enumerable: true,
      value: cloneAndFreeze(descriptor.value, ancestors),
      writable: false,
    });
  }
  return copy;
}

function cloneArray(value: unknown[], ancestors: WeakSet<object>): unknown[] {
  const copy: unknown[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") {
      continue;
    }
    if (!isArrayIndex(key, value.length)) {
      throw new TypeError("Hardware snapshots can only contain plain data.");
    }

    const descriptor = plainDataDescriptor(value, key);
    Object.defineProperty(copy, key, {
      configurable: false,
      enumerable: true,
      value: cloneAndFreeze(descriptor.value, ancestors),
      writable: false,
    });
  }
  copy.length = value.length;
  return copy;
}

function plainDataDescriptor(value: object, key: PropertyKey): PropertyDescriptor & { value: unknown } {
  if (typeof key === "symbol") {
    throw new TypeError("Hardware snapshots can only contain plain data.");
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    throw new TypeError("Hardware snapshots can only contain plain data.");
  }
  return { ...descriptor, value: descriptor.value };
}

function isArrayIndex(key: PropertyKey, length: number): key is string {
  if (typeof key !== "string") {
    return false;
  }

  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
