#!/usr/bin/env bash
# Shared harness for the Arch packaging contract tests.
#
# package_contract_run <pkgbuild-path> <fixture-fn> <expected-files>
#
# The fixture function is called with $source_dir and $package_root pre-created
# and must populate $source_dir with the stub release binary and source inputs
# the PKGBUILD installs. Afterwards $source_dir/$package_root stay set so the
# caller can run its own cmp checks before the work dir is cleaned up on EXIT.
package_contract_run() {
  local pkgbuild="$1" fixture_fn="$2" expected_files="$3"

  work_dir="$(mktemp -d)"
  trap 'rm -rf "$work_dir"' EXIT

  source_dir="$work_dir/source"
  package_root="$work_dir/package"
  mkdir -p "$source_dir" "$package_root"

  "$fixture_fn"

  QMKUI_SOURCE_DIR="$source_dir"
  # shellcheck source=/dev/null
  source "$pkgbuild"
  pkgdir="$package_root"
  package

  printf '%s\n' "$expected_files" | LC_ALL=C sort >"$work_dir/expected-files"
  find "$package_root" -type f -printf '%P\n' | LC_ALL=C sort >"$work_dir/actual-files"
  diff -u "$work_dir/expected-files" "$work_dir/actual-files"
}
