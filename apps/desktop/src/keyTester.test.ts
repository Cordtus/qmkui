import { describe, expect, it } from "vitest";
import { captureHostKey, classifyKeyEvents, qmkFromHostKey } from "./keyTester";
import { keychronV5MaxProject } from "./presets";

describe("host key tester", () => {
  it("maps common host codes to QMK keycodes", () => {
    expect(qmkFromHostKey({ code: "KeyA", key: "a" })).toBe("KC_A");
    expect(qmkFromHostKey({ code: "Digit5", key: "5" })).toBe("KC_5");
    expect(qmkFromHostKey({ code: "ArrowRight", key: "ArrowRight" })).toBe("KC_RGHT");
    expect(qmkFromHostKey({ code: "ControlLeft", key: "Control" })).toBe("KC_LCTL");
    expect(qmkFromHostKey({ code: "Numpad1", key: "1" })).toBe("KC_P1");
    expect(qmkFromHostKey({ code: "NumpadEnter", key: "Enter" })).toBe("KC_PENT");
  });

  it("matches a host key to assignments on the selected layer", () => {
    const capture = captureHostKey(keychronV5MaxProject, 2, { code: "KeyA", key: "a" });
    const expectedKey = keychronV5MaxProject.layers[2].assignments.find(
      (assignment) => assignment.qmk === "KC_A",
    );

    expect(capture.qmk).toBe("KC_A");
    expect(capture.matchedKeyIds).toContain(expectedKey?.visualKeyId);

    const numpad = captureHostKey(keychronV5MaxProject, 2, { code: "Numpad1", key: "1" });
    expect(numpad.qmk).toBe("KC_P1");
    expect(numpad.matchedKeyIds.length).toBeGreaterThan(0);
  });
});

describe("key event classification", () => {
  it("flags a key that chatters with rapid cycles", () => {
    const events = [
      { code: "KeyA", key: "a", kind: "down" as const, at: 0 },
      { code: "KeyA", key: "a", kind: "up" as const, at: 10 },
      { code: "KeyA", key: "a", kind: "down" as const, at: 20 },
      { code: "KeyA", key: "a", kind: "up" as const, at: 28 },
      { code: "KeyA", key: "a", kind: "down" as const, at: 35 },
      { code: "KeyA", key: "a", kind: "up" as const, at: 42 },
      { code: "KeyB", key: "b", kind: "down" as const, at: 50 },
      { code: "KeyB", key: "b", kind: "up" as const, at: 60 },
    ];
    const result = classifyKeyEvents(events);
    expect(result.chatter).toEqual(["KeyA"]);
    expect(result.held).toEqual([]);
  });

  it("flags a key that is held without release", () => {
    const events = [
      { code: "KeyA", key: "a", kind: "down" as const, at: 0 },
      { code: "KeyA", key: "a", kind: "up" as const, at: 2500 },
    ];
    const result = classifyKeyEvents(events);
    expect(result.chatter).toEqual([]);
    expect(result.held).toEqual(["KeyA"]);
  });

  it("leaves a healthy key unflagged", () => {
    const events = [
      { code: "KeyA", key: "a", kind: "down" as const, at: 0 },
      { code: "KeyA", key: "a", kind: "up" as const, at: 60 },
      { code: "KeyA", key: "a", kind: "down" as const, at: 200 },
      { code: "KeyA", key: "a", kind: "up" as const, at: 260 },
    ];
    expect(classifyKeyEvents(events)).toEqual({ chatter: [], held: [] });
  });
});
