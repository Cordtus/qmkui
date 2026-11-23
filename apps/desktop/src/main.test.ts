// @vitest-environment jsdom
import { expect, it, vi } from "vitest";

const createApp = vi.fn();
vi.mock("./ui", () => ({ createApp }));

it("boots the app into the root element", async () => {
  document.body.innerHTML = '<div id="app"></div>';

  await import("./main");

  expect(createApp).toHaveBeenCalledOnce();
});
