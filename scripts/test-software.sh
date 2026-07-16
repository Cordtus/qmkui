#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$root_dir"

cargo fmt --all -- --check
cargo test --workspace
cargo build --workspace

npm --prefix apps/desktop ci
npm --prefix apps/desktop test
npm --prefix apps/desktop run build
scripts/test-public-packaging.sh

doctor_output="${QMKUI_DOCTOR_OUTPUT:-$root_dir/target/qmkui-doctor-readiness.json}"
mkdir -p "$(dirname "$doctor_output")"
doctor_tmp="$(mktemp "${doctor_output}.tmp.XXXXXX")"
trap 'rm -f "$doctor_tmp"' EXIT

cargo run -p qmkui-doctor -- --no-hardware-probe >"$doctor_tmp"
mv "$doctor_tmp" "$doctor_output"
trap - EXIT

printf 'Software checks passed. Doctor output: %s\n' "$doctor_output"
