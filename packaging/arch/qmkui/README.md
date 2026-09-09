# Arch/Garuda GUI packaging

`packaging/arch/qmkui/PKGBUILD` builds the native QMKUI desktop app. The
Tauri binary is produced by the `qmkui` crate (added in the rollout plan's P3a
phase) and depends on the system `qmk` package for local builds, plus the
`hidapi` and WebKitGTK libraries the shell needs.

The package installs the desktop file, icon, a MIME association for
`*.qmkui.json` project files, and the read-only HID udev rule from
`packaging/udev/70-qmkui.rules`.

`scripts/test-public-gui-packaging.sh` exercises the packaging contract with a
stubbed release binary, mirroring the Doctor packaging test.
