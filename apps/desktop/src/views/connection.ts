import {
  DeviceSelectionState,
  EditorState,
  ProtocolVerificationState,
  RenderActions,
  browserReadSession,
  isBrowserReadSelection,
} from "../appState";
import { chooseBrowserKeyboard } from "../devices/browserKeyboardDiscovery";
import { element, uiButton } from "./primitives";
export function connectionScreen(state: EditorState, actions: RenderActions): HTMLElement {
  return element("main", { className: "connection-shell" }, [connectionContent(state, actions)]);
}

export function connectionContent(state: EditorState, actions: RenderActions): HTMLElement {
  return element("section", { className: "connection-embedded", attrs: { "data-connection-screen": "true" } }, [
    connectionPanel(state, actions),
  ]);
}

function connectionPanel(state: EditorState, actions: RenderActions): HTMLElement {
  const choosing = state.deviceSelection.state === "selecting";
  const recognized = isBrowserReadSelection(state.deviceSelection) ? state.deviceSelection : undefined;
  const session = recognized ? browserReadSession(recognized) : undefined;
  const canRead = Boolean(session?.capabilities.canRead);
  const connect = uiButton({
    className: "secondary-action",
    text: choosing ? "Choosing keyboard..." : "Connect keyboard",
    type: "button",
    attrs: {
      "data-device-action": "connect",
      ...(choosing ? { disabled: "" } : {}),
    },
  });
  connect.addEventListener("click", actions.chooseBrowserKeyboard);

  const read = canRead
    ? uiButton({
        className: "secondary-action",
        text: state.snapshotReadStatus === "reading" ? "Reading device..." : "Read device",
        type: "button",
        attrs: {
          "data-device-action": "read",
          ...(state.snapshotReadStatus === "reading" ? { disabled: "" } : {}),
        },
      })
    : undefined;
  read?.addEventListener("click", actions.readDevice);

  const verify = recognized
    ? uiButton({
        className: "secondary-action",
        text: state.protocolVerification.state === "verifying" ? "Verifying protocol..." : "Verify protocol",
        type: "button",
        attrs: {
          "data-device-action": "verify-protocol",
          ...(state.protocolVerification.state === "verifying" ? { disabled: "" } : {}),
        },
      })
    : undefined;
  verify?.addEventListener("click", actions.verifyKeychronV5MaxProtocol);

  const error = connectionError(state.deviceSelection, state.protocolVerification, state.snapshotReadStatus);

  return element("section", { className: "connection-panel" }, [
    element("div", { className: "connection-intro" }, [
      element("p", { className: "eyebrow", text: "QMKUI" }),
      element("h1", { text: "Connect a keyboard" }),
      element("p", {
        className: "connection-lede",
        text: "Read and edit VIA-compatible keyboards over WebHID. Connect one to begin.",
      }),
    ]),
    element("div", { className: "connection-actions" }, [connect, ...(verify ? [verify] : []), ...(read ? [read] : [])]),
    ...(error
      ? [element("p", { className: "connection-state", attrs: { "data-device-state": "true" }, text: error })]
      : []),
  ]);
}

export function connectionError(
  selection: DeviceSelectionState,
  protocolVerification: ProtocolVerificationState,
  readStatus: EditorState["snapshotReadStatus"],
): string {
  if (readStatus === "failed") {
    return "Device read failed.";
  }
  if (selection.state === "cancelled") {
    return "Selection cancelled.";
  }
  if (selection.state === "discovery-failed") {
    return "Device discovery failed.";
  }
  if (selection.state === "unavailable") {
    return "WebHID unavailable.";
  }
  if ("contract" in selection) {
    if (selection.contract.state === "unsupported") {
      return "Unsupported keyboard.";
    }
    if (selection.contract.state === "unverified-via") {
      if (protocolVerification.state === "failed") {
        return "Protocol verification failed.";
      }
      return "";
    }
    return protocolVerification.state === "failed" ? "Protocol verification failed." : "";
  }
  return "";
}
