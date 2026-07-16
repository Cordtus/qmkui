// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

vi.mock("./ui", () => ({
  createApp: vi.fn(),
}));

it("registers the WebAwesome custom elements required by the UI", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  for (const tagName of ["wa-button", "wa-details", "wa-drawer"]) {
    expect(customElements.get(tagName), `${tagName} should be registered`).toBeDefined();
  }
});
