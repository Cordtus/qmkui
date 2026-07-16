#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

source_dir="$work_dir/source"
package_root="$work_dir/package"
mkdir -p "$source_dir/packaging/arch" "$source_dir/target/release" "$package_root"

printf 'doctor test binary\n' >"$source_dir/target/release/qmkui-doctor"
chmod +x "$source_dir/target/release/qmkui-doctor"
printf '# README\n' >"$source_dir/README.md"
printf '# Contributing\n' >"$source_dir/CONTRIBUTING.md"
printf '# Arch packaging\n' >"$source_dir/packaging/arch/README.md"
printf 'MIT test license\n' >"$source_dir/LICENSE"
printf '# Third-party notices\npackaging contract sentinel\n' \
  >"$source_dir/THIRD_PARTY_NOTICES.md"

QMKUI_SOURCE_DIR="$source_dir"
source "$root_dir/packaging/arch/PKGBUILD"
pkgdir="$package_root"
package

expected_files="$work_dir/expected-files"
actual_files="$work_dir/actual-files"
printf '%s\n' \
  'usr/bin/qmkui-doctor' \
  'usr/share/doc/qmkui/CONTRIBUTING.md' \
  'usr/share/doc/qmkui/README.md' \
  'usr/share/doc/qmkui/THIRD_PARTY_NOTICES.md' \
  'usr/share/doc/qmkui/arch-packaging.md' \
  'usr/share/licenses/qmkui-doctor-local/LICENSE' \
  >"$expected_files"
find "$package_root" -type f -printf '%P\n' | LC_ALL=C sort >"$actual_files"

diff -u "$expected_files" "$actual_files"
cmp "$source_dir/target/release/qmkui-doctor" "$package_root/usr/bin/qmkui-doctor"
cmp \
  "$source_dir/THIRD_PARTY_NOTICES.md" \
  "$package_root/usr/share/doc/qmkui/THIRD_PARTY_NOTICES.md"
[[ -x "$package_root/usr/bin/qmkui-doctor" ]]

printf 'Public packaging contract tests passed.\n'
