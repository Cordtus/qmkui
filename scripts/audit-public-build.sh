#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )); then
  printf 'Usage: %s BUILD_DIRECTORY\n' "${0##*/}" >&2
  exit 2
fi

build_dir="$1"
while [[ "$build_dir" != "/" && "$build_dir" == */ ]]; do
  build_dir="${build_dir%/}"
done
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
canonical_notices="$root_dir/THIRD_PARTY_NOTICES.md"

if [[ ! -d "$build_dir" ]]; then
  printf 'Public build audit failed: directory does not exist: %s\n' "$build_dir" >&2
  exit 2
fi

if [[ ! -f "$build_dir/index.html" ]]; then
  printf 'Public build audit failed: missing index.html in %s\n' "$build_dir" >&2
  exit 2
fi

if [[ ! -d "$build_dir/assets" ]]; then
  printf 'Public build audit failed: missing assets directory in %s\n' "$build_dir" >&2
  exit 2
fi

if [[ ! -s "$build_dir/THIRD_PARTY_NOTICES.md" ]]; then
  printf 'Public build audit failed: missing or empty THIRD_PARTY_NOTICES.md in %s\n' \
    "$build_dir" >&2
  exit 1
fi

if [[ ! -f "$canonical_notices" ]]; then
  printf 'Public build audit failed: canonical THIRD_PARTY_NOTICES.md is missing.\n' >&2
  exit 2
fi

if ! cmp -s "$canonical_notices" "$build_dir/THIRD_PARTY_NOTICES.md"; then
  printf 'Public build audit failed: THIRD_PARTY_NOTICES.md does not match canonical source.\n' \
    >&2
  exit 1
fi

if ! command -v grep >/dev/null 2>&1; then
  printf 'Public build audit failed: grep is required.\n' >&2
  exit 2
fi

path_manifest="$(mktemp)"
trap 'rm -f "$path_manifest"' EXIT

if ! find "$build_dir" -mindepth 1 -print0 >"$path_manifest"; then
  printf 'Public build audit failed: could not traverse %s\n' "$build_dir" >&2
  exit 2
fi

while IFS= read -r -d '' artifact_path; do
  relative_path="${artifact_path#"$build_dir"/}"

  if [[ -L "$artifact_path" ]]; then
    printf 'Public build audit failed: symbolic link is not allowed: %s\n' \
      "$relative_path" >&2
    exit 1
  fi

  if [[ "$relative_path" == "_headers" ]]; then
    printf 'Public build audit failed: unsupported _headers file is not allowed.\n' >&2
    exit 1
  fi

  case "/$relative_path" in
    *'/home/'* | *'/Users/'* | *'doctor-readiness.local.json'* | \
      *'/sys/bus/usb/devices'* | *'nodev2'* | *'gh-runner-'*)
      printf 'Public build audit failed: private environment marker found in path: %s\n' \
        "$relative_path" >&2
      exit 1
      ;;
  esac
done <"$path_manifest"

leak_pattern='/home/|/Users/|doctor-readiness\.local\.json|/sys/bus/usb/devices|nodev2|gh-runner-'

if scan_output="$(
  grep -a -r -n -E -o -- "$leak_pattern" "$build_dir" 2>&1
)"; then
  scan_status=0
else
  scan_status="$?"
fi

case "$scan_status" in
  0)
    printf '%s\n' "$scan_output"
    printf 'Public build audit failed: private environment marker found in %s\n' \
      "$build_dir" >&2
    exit 1
    ;;
  1)
    ;;
  *)
    if [[ -n "$scan_output" ]]; then
      printf '%s\n' "$scan_output" >&2
    fi
    printf 'Public build audit failed: grep exited with status %s while scanning %s\n' \
      "$scan_status" "$build_dir" >&2
    exit "$scan_status"
    ;;
esac

required_csp="default-src 'self'; base-uri 'none'; connect-src 'self' data:; font-src 'self' data:; form-action 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
index_html="$(<"$build_dir/index.html")"

if [[ ! "$index_html" =~ \<meta[^\>]*http-equiv=\"Content-Security-Policy\"[^\>]*\> ]]; then
  printf 'Public build audit failed: index.html is missing Content-Security-Policy.\n' >&2
  exit 1
fi

csp_meta="${BASH_REMATCH[0]}"
if [[ "$csp_meta" != *"content=\"$required_csp\""* ]]; then
  printf 'Public build audit failed: index.html has an invalid Content-Security-Policy.\n' >&2
  exit 1
fi

if [[ "$index_html" =~ (src|href)=\"/assets/ ]]; then
  printf 'Public build audit failed: index.html contains a root-absolute /assets/ reference.\n' >&2
  exit 1
fi

if [[ ! "$index_html" =~ (src|href)=\"\./assets/ ]]; then
  printf 'Public build audit failed: index.html has no relative ./assets/ reference.\n' >&2
  exit 1
fi

printf 'Public build audit passed: %s\n' "$build_dir"
