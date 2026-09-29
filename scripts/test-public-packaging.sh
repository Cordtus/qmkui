#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/package-contract.sh
source "$root_dir/scripts/lib/package-contract.sh"

doctor_fixtures() {
  mkdir -p "$source_dir/packaging/arch" "$source_dir/target/release"
  printf 'doctor test binary\n' >"$source_dir/target/release/qmkui-doctor"
  chmod +x "$source_dir/target/release/qmkui-doctor"
  printf '# README\n' >"$source_dir/README.md"
  printf '# Contributing\n' >"$source_dir/CONTRIBUTING.md"
  printf '# Arch packaging\n' >"$source_dir/packaging/arch/README.md"
  printf 'MIT test license\n' >"$source_dir/LICENSE"
  printf '# Third-party notices\npackaging contract sentinel\n' \
    >"$source_dir/THIRD_PARTY_NOTICES.md"
}

package_contract_run \
  "$root_dir/packaging/arch/PKGBUILD" \
  doctor_fixtures \
  'usr/bin/qmkui-doctor
usr/share/doc/qmkui/CONTRIBUTING.md
usr/share/doc/qmkui/README.md
usr/share/doc/qmkui/THIRD_PARTY_NOTICES.md
usr/share/doc/qmkui/arch-packaging.md
usr/share/licenses/qmkui-doctor-local/LICENSE'

cmp "$source_dir/target/release/qmkui-doctor" "$package_root/usr/bin/qmkui-doctor"
cmp \
  "$source_dir/THIRD_PARTY_NOTICES.md" \
  "$package_root/usr/share/doc/qmkui/THIRD_PARTY_NOTICES.md"
[[ -x "$package_root/usr/bin/qmkui-doctor" ]]

printf 'Public packaging contract tests passed.\n'
