# Arch/Garuda Doctor package

This local PKGBUILD installs `qmkui-doctor` and the public project docs. It does
not package the browser app or provide a native QMKUI application.

The package depends on Arch's `qmk` package so Doctor can report the complete
local software environment. Installing it does not enable QMKUI to compile,
flash, enter bootloader mode, or write to a keyboard.

Build from the repository root:

```bash
repo_root="$PWD"
cd packaging/arch
QMKUI_SOURCE_DIR="$repo_root" makepkg --syncdeps --cleanbuild
```

Run the installed Doctor without probing hardware:

```bash
qmkui-doctor --no-hardware-probe
```

Running `qmkui-doctor` without the flag performs the documented read-only Linux
USB metadata probe. It does not open HID or serial endpoints and must not be
used as a flashing workflow.
