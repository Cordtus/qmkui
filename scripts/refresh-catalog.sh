#!/usr/bin/env bash
set -euo pipefail

# Regenerates a catalog JSON from a pinned QMK checkout.
#
# Required:
#   QMKUI_QMK_PATH  path to a QMK firmware checkout (e.g. Keychron/qmk_firmware)
#
# Optional:
#   QMKUI_QMK_COMMIT  commit hash to record as provenance on each board
#   QMKUI_CATALOG_OUT  output path (default target/qmkui-catalog-generated.json)

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
qmk_path="${QMKUI_QMK_PATH:?Set QMKUI_QMK_PATH to a QMK firmware checkout}"
out="${QMKUI_CATALOG_OUT:-$root_dir/target/qmkui-catalog-generated.json}"

args=(--qmk-path "$qmk_path" --out "$out")
if [[ -n "${QMKUI_QMK_COMMIT:-}" ]]; then
  args+=(--commit "$QMKUI_QMK_COMMIT")
fi

cargo run -p qmkui-catalog --bin ingest -- "${args[@]}"
