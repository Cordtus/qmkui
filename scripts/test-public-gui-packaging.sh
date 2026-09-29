#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/package-contract.sh
source "$root_dir/scripts/lib/package-contract.sh"

gui_fixtures() {
  mkdir -p \
    "$source_dir/packaging/arch/qmkui" \
    "$source_dir/packaging/udev" \
    "$source_dir/target/release"
  printf 'qmkui test binary\n' >"$source_dir/target/release/qmkui"
  chmod +x "$source_dir/target/release/qmkui"
  printf '# README\n' >"$source_dir/README.md"
  printf '# Contributing\n' >"$source_dir/CONTRIBUTING.md"
  printf '# Third-party notices\npackaging contract sentinel\n' \
    >"$source_dir/THIRD_PARTY_NOTICES.md"
  printf 'MIT test license\n' >"$source_dir/LICENSE"
  printf '# GUI packaging\n' >"$source_dir/packaging/arch/qmkui/README.md"
  printf '[Desktop Entry]\nName=QMKUI\n' >"$source_dir/packaging/arch/qmkui/qmkui.desktop"
  printf '<?xml version="1.0"?>\n<mime-info/>\n' >"$source_dir/packaging/arch/qmkui/qmkui.xml"
  printf 'PNG placeholder\n' >"$source_dir/packaging/arch/qmkui/qmkui.png"
  printf 'SUBSYSTEM=="hidraw", GROUP="input"\n' >"$source_dir/packaging/udev/70-qmkui.rules"
}

package_contract_run \
  "$root_dir/packaging/arch/qmkui/PKGBUILD" \
  gui_fixtures \
  'usr/bin/qmkui
usr/share/applications/qmkui.desktop
usr/share/mime/packages/qmkui.xml
usr/share/icons/hicolor/256x256/apps/qmkui.png
usr/lib/udev/rules.d/70-qmkui.rules
usr/share/doc/qmkui/CONTRIBUTING.md
usr/share/doc/qmkui/README.md
usr/share/doc/qmkui/THIRD_PARTY_NOTICES.md
usr/share/doc/qmkui/gui-packaging.md
usr/share/licenses/qmkui/LICENSE'

cmp "$source_dir/target/release/qmkui" "$package_root/usr/bin/qmkui"
cmp "$source_dir/packaging/udev/70-qmkui.rules" \
  "$package_root/usr/lib/udev/rules.d/70-qmkui.rules"
cmp "$source_dir/THIRD_PARTY_NOTICES.md" \
  "$package_root/usr/share/doc/qmkui/THIRD_PARTY_NOTICES.md"
[[ -x "$package_root/usr/bin/qmkui" ]]

printf 'Public GUI packaging contract tests passed.\n'
