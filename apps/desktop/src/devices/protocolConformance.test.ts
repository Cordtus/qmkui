import { describe, expect, it } from "vitest";
import viaCommands from "../../../../fixtures/protocol/via-commands.json";
import v5Identity from "../../../../fixtures/protocol/v5-identity.json";
import v5Keymap from "../../../../fixtures/protocol/v5-keymap.json";
import v5Lighting from "../../../../fixtures/protocol/v5-lighting.json";
import readOnlyCommands from "../../../../fixtures/protocol/read-only-commands.json";
import {
  ViaReadProtocol,
  type ViaReadTransport,
} from "./viaReadProtocol";

/**
 * Replays the shared protocol fixture corpus through the real readers. These
 * vectors are the conformance contract for the future Rust `qmkui-hid` crate;
 * a vector that fails here is a corpus bug, not an implementation bug.
 */
describe("protocol fixture corpus conformance", () => {
  it("replays the standard VIA read vectors through ViaReadProtocol", async () => {
    const protocolVersion = viaCommands[0]!;
    const layerCount = viaCommands[1]!;
    const keycode = viaCommands[2]!;
    const customValue = viaCommands[3]!;

    expect(
      await new ViaReadProtocol(transportFor(protocolVersion.request, protocolVersion.response)).getProtocolVersion(),
    ).toBe(protocolVersion.decoded.protocolVersion);
    expect(
      await new ViaReadProtocol(transportFor(layerCount.request, layerCount.response)).getLayerCount(),
    ).toBe(layerCount.decoded.layerCount);
    expect(
      await new ViaReadProtocol(transportFor(keycode.request, keycode.response)).getKeycode(0, 0, 0),
    ).toBe(keycode.decoded.keycode);

    const custom = await new ViaReadProtocol(
      transportFor(customValue.request, customValue.response),
    ).getCustomValue({ channel: 2, valueId: 1 });
    expect(Array.from(custom.bytes)).toEqual(customValue.decoded.bytes);
    expect(custom.verification).toBe("verified");
  });

  it("keeps every fixture vector on a documented read command", () => {
    const keychronRead = new Set(Object.values(readOnlyCommands.keychronReadCommands));
    const viaRead = new Set(Object.values(readOnlyCommands.viaReadCommands));
    for (const vector of v5Identity) {
      expect(keychronRead.has(vector.request[0])).toBe(true);
    }
    for (const vector of v5Keymap) {
      expect(viaRead.has(vector.request[0])).toBe(true);
    }
    // V5 lighting is standard VIA custom-get-value on the RGB-matrix channel.
    for (const vector of v5Lighting) {
      expect(viaRead.has(vector.request[0])).toBe(true);
      expect(vector.request[1]).toBe(0x03);
    }
  });

  it("replays the V5 lighting vectors through ViaReadProtocol.getCustomValue", async () => {
    for (const vector of v5Lighting) {
      const value = await new ViaReadProtocol(
        transportFor(vector.request, vector.response),
      ).getCustomValue({ channel: 3, valueId: vector.request[2] as 1 | 2 | 3 | 4 });
      const width = vector.name === "rgbMatrixColor" ? 2 : 1;
      expect(Array.from(value.bytes.slice(0, width))).toEqual(
        Array.from(vector.response.slice(3, 3 + width)),
      );
    }
  });

  it("keeps Keychron decoded fields consistent with the response offsets", () => {
    const identity = Object.fromEntries(v5Identity.map((vector) => [vector.name, vector]));
    const protocol = identity.protocol!;
    const capabilities = identity.capabilities!;
    const defaultLayer = identity.defaultLayer!;
    const keycode = v5Keymap[0]!;
    const [brightness, effect, effectSpeed, color] = v5Lighting;

    expect(protocol.decoded.protocolVersion).toEqual([
      protocol.response[1],
      protocol.response[2],
      protocol.response[3],
    ]);
    expect(capabilities.decoded.featureBitmap).toEqual([capabilities.response[1], capabilities.response[2]]);
    expect(defaultLayer.decoded.defaultLayer).toBe(defaultLayer.response[1]);
    expect(keycode.decoded.keycode).toBe((keycode.response[4]! << 8) | keycode.response[5]!);
    expect(brightness!.decoded.brightness).toBe(brightness!.response[3]);
    expect(effect!.decoded.effect).toBe(effect!.response[3]);
    expect(effectSpeed!.decoded.effectSpeed).toBe(effectSpeed!.response[3]);
    expect(color!.decoded.hue).toBe(color!.response[3]);
    expect(color!.decoded.saturation).toBe(color!.response[4]);
  });
});

function transportFor(request: readonly number[], response: readonly number[]): ViaReadTransport {
  const listeners = new Set<(event: { reportId: number; data: Uint8Array }) => void>();
  return {
    sendReport: async (_reportId: number, data: BufferSource) => {
      const sent = Array.from(new Uint8Array(data as ArrayBuffer));
      for (let index = 0; index < request.length; index += 1) {
        if (sent[index] !== request[index]) {
          throw new Error(`Unexpected request byte at ${index}`);
        }
      }
      listeners.forEach((listener) => listener({ reportId: 0, data: new Uint8Array(response) }));
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
}
