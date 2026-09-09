# Debian/RPM Packaging Notes

Status: planned; execution requires the Tauri release binary from
`apps/desktop/src-tauri` (build via `npm --prefix apps/desktop run tauri:build`).

## Dependencies shared by all Linux packages

- `qmk` (runtime, local builds)
- `hidapi` (native HID transport)
- WebKitGTK 4.1 + GTK3 (Tauri webview)
- udev rule from `packaging/udev/70-qmkui.rules` installed to
  `/usr/lib/udev/rules.d/`

## Debian (.deb)

- Binary: `/usr/bin/qmkui` (release binary)
- Desktop entry + icon + MIME from `packaging/arch/qmkui/`
- Depends: `qmk`, `libhidapi0`, `libwebkit2gtk-4.1-0`, `libgtk-3-0`
- Postinst runs `udevadm control --reload` after installing the udev rule.

## RPM

- Same file layout; package manager-specific udev reload hook.
- Depends on the equivalent Fedora/openSUSE WebKitGTK packages.

## Guarantees

- The GUI never runs as root.
- The udev rule grants only read-capable access to supported device
  interfaces; QMKUI emits only read commands on them.
- Packaging leaks are caught by `scripts/test-public-gui-packaging.sh` and the
  public-build audit (no local paths in artifacts).
