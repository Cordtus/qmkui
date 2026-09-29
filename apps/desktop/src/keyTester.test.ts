import { describe, expect, it } from "vitest";
import { captureHostKey, qmkFromHostKey } from "./keyTester";
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
