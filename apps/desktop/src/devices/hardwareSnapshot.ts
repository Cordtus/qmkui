export type ValueState<Value> =
  | { readonly state: "available"; readonly value: Value }
  | { readonly state: "unavailable"; readonly reason: string }
  | { readonly state: "unverified"; readonly reason: string };

export function available<Value>(value: Value): ValueState<Value> {
  return { state: "available", value };
}

export function unavailable(reason: string): ValueState<never> {
  return { state: "unavailable", reason };
}

export function unverified(reason: string): ValueState<never> {
  return { state: "unverified", reason };
}
