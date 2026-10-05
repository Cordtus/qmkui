# Debian/RPM Packaging Notes

QMKUI is a static browser app. It runs in any Chromium-based browser (WebHID)
served over HTTPS or localhost; there is no native GUI binary or webview.

## Dependencies

- A Chromium-based browser with WebHID (Chrome/Chromium/Edge).
- `qmk` (optional, runtime; the app plans a `qmk compile` command for you to run
  locally).
- The udev rule from `packaging/udev/70-qmkui.rules`, installed to
  `/usr/lib/udev/rules.d/`, so Chromium can open the keyboard's raw HID
  interfaces. Install it manually or ship it with your package; no other
  system libraries are required.

## Distribution

- The static build (`apps/desktop/dist/`, produced by
  `npm --prefix apps/desktop run build`) is the shippable artifact. It is
  deployed to GitHub Pages from `main`; any static host works.
- To serve it locally, use any static file server on localhost (WebHID needs a
  secure context, so `file://` is not reliable).
- There is no packaged desktop binary today; a thin launcher that serves the
  static site on localhost is a possible future addition.

## Guarantees

- The app never runs as root.
- The udev rule grants access to the supported device's raw HID interfaces;
  QMKUI only writes after explicit operator confirmation.
- Packaging leaks are caught by the public-build audit
  (`scripts/audit-public-build.sh`, no local paths in artifacts).
