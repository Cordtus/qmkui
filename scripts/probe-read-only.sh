#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_file="$root_dir/apps/desktop/.local/doctor-readiness.local.json"

mkdir -p "$(dirname "$out_file")"
tmp_file="$(mktemp "$out_file.tmp.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

cd "$root_dir"
cargo run -p qmkui-doctor >"$tmp_file"
mv "$tmp_file" "$out_file"
trap - EXIT

printf 'Wrote read-only probe report: %s\n' "$out_file"
