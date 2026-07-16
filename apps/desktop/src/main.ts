import "@awesome.me/webawesome/dist/styles/webawesome.css";
import "@awesome.me/webawesome";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/details/details.js";
import "@awesome.me/webawesome/dist/components/drawer/drawer.js";
import "./styles.css";
import { createApp } from "./ui";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("App root not found");
}

createApp(app);
