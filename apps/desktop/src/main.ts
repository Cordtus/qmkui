import "./styles.css";
import { createApp } from "./ui";

async function bootstrap(): Promise<void> {
  // Dev-only fake device: open the app with `?demo` to exercise the UI (and the
  // gated write path) without hardware. Excluded from production builds.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")) {
    const { installMockKeychronDevice } = await import("./dev/mockKeychronDevice");
    installMockKeychronDevice();
  }

  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("App root not found");
  }

  createApp(app);
}

void bootstrap();
