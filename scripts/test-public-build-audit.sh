#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
auditor="$root_dir/scripts/audit-public-build.sh"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

create_artifact() {
  local artifact_dir="$1"

  mkdir -p "$artifact_dir/assets"
  cat >"$artifact_dir/index.html" <<'EOF'
<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; connect-src 'self' data:; font-src 'self' data:; form-action 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'">
<link rel="stylesheet" href="./assets/app.css">
<script type="module" src="./assets/app.js"></script>
EOF
  printf 'body { color: black; }\n' >"$artifact_dir/assets/app.css"
  printf 'console.log("public build");\n' >"$artifact_dir/assets/app.js"
  cp "$root_dir/THIRD_PARTY_NOTICES.md" "$artifact_dir/THIRD_PARTY_NOTICES.md"
}

[[ -x "$auditor" ]] || fail "public build auditor is missing or not executable: $auditor"

safe_artifact="$work_dir/safe"
create_artifact "$safe_artifact"
safe_output="$($auditor "$safe_artifact" 2>&1)" ||
  fail "safe artifact was rejected: $safe_output"

leak_cases=(
  'linux-home-path|/home/'
  'macos-home-path|/Users/'
  'doctor-report|doctor-readiness.local.json'
  'sysfs-path|/sys/bus/usb/devices'
  'host-name|nodev2'
  'runner-name|gh-runner-'
)

failures=0

assert_rejected() {
  local artifact_dir="$1"
  local expected_marker="$2"
  local expected_status=1
  local audit_output
  local audit_status

  if audit_output="$($auditor "$artifact_dir" 2>&1)"; then
    printf 'FAIL: artifact containing %s was accepted\n' "$expected_marker" >&2
    failures="$((failures + 1))"
    return
  else
    audit_status="$?"
  fi

  if [[ "$audit_status" != "$expected_status" ]]; then
    printf 'FAIL: rejection for %s exited %s instead of %s: %s\n' \
      "$expected_marker" "$audit_status" "$expected_status" "$audit_output" >&2
    failures="$((failures + 1))"
  fi

  if ! grep -Fq -- "$expected_marker" <<<"$audit_output"; then
    printf 'FAIL: rejection for %s did not identify the marker: %s\n' \
      "$expected_marker" "$audit_output" >&2
    failures="$((failures + 1))"
  fi
}

assert_operational_error() {
  local artifact_dir="$1"
  local fake_bin_dir="$2"
  local expected_diagnostic="$3"
  local audit_output
  local audit_status

  if audit_output="$(PATH="$fake_bin_dir:$PATH" "$auditor" "$artifact_dir" 2>&1)"; then
    printf 'FAIL: rg operational error was accepted\n' >&2
    failures="$((failures + 1))"
    return
  else
    audit_status="$?"
  fi

  if [[ "$audit_status" != 2 ]]; then
    printf 'FAIL: rg operational error exited %s instead of 2: %s\n' \
      "$audit_status" "$audit_output" >&2
    failures="$((failures + 1))"
  fi

  if ! grep -Fxq -- "$expected_diagnostic" <<<"$audit_output"; then
    printf 'FAIL: rg operational error omitted diagnostic %s: %s\n' \
      "$expected_diagnostic" "$audit_output" >&2
    failures="$((failures + 1))"
  fi
}

missing_notice_artifact="$work_dir/reject-missing-notice"
create_artifact "$missing_notice_artifact"
rm "$missing_notice_artifact/THIRD_PARTY_NOTICES.md"
assert_rejected "$missing_notice_artifact" 'THIRD_PARTY_NOTICES.md'

empty_notice_artifact="$work_dir/reject-empty-notice"
create_artifact "$empty_notice_artifact"
: >"$empty_notice_artifact/THIRD_PARTY_NOTICES.md"
empty_notice_diagnostic="$(
  printf 'Public build audit failed: missing or empty THIRD_PARTY_NOTICES.md in %s' \
    "$empty_notice_artifact"
)"
if empty_notice_output="$($auditor "$empty_notice_artifact" 2>&1)"; then
  fail "artifact with an empty THIRD_PARTY_NOTICES.md was accepted"
else
  empty_notice_status="$?"
fi
[[ "$empty_notice_status" == 1 ]] ||
  fail "empty notice exited $empty_notice_status instead of 1: $empty_notice_output"
grep -Fxq -- "$empty_notice_diagnostic" <<<"$empty_notice_output" ||
  fail "empty notice rejection omitted exact diagnostic: $empty_notice_output"

stale_notice_artifact="$work_dir/reject-stale-notice"
create_artifact "$stale_notice_artifact"
printf '\nstale notice\n' >>"$stale_notice_artifact/THIRD_PARTY_NOTICES.md"
assert_rejected "$stale_notice_artifact" 'does not match canonical'

for leak_case in "${leak_cases[@]}"; do
  case_name="${leak_case%%|*}"
  marker="${leak_case#*|}"
  leaking_artifact="$work_dir/leak-$case_name"
  create_artifact "$leaking_artifact"
  printf 'const leakedValue = %q;\n' "$marker" >"$leaking_artifact/assets/leak.js"
  assert_rejected "$leaking_artifact" "$marker"
done

hidden_artifact="$work_dir/leak-hidden"
create_artifact "$hidden_artifact"
mkdir "$hidden_artifact/.private"
printf 'nodev2\n' >"$hidden_artifact/.private/leak.js"
assert_rejected "$hidden_artifact" 'nodev2'

binary_artifact="$work_dir/leak-binary"
create_artifact "$binary_artifact"
printf '\0/sys/bus/usb/devices\0' >"$binary_artifact/assets/leak.bin"
assert_rejected "$binary_artifact" '/sys/bus/usb/devices'

ignored_artifact="$work_dir/leak-ignore-bypass"
create_artifact "$ignored_artifact"
printf 'ignored.js\n' >"$ignored_artifact/.ignore"
printf 'gh-runner-secret\n' >"$ignored_artifact/ignored.js"
assert_rejected "$ignored_artifact" 'gh-runner-'

symlink_artifact="$work_dir/reject-symlink"
create_artifact "$symlink_artifact"
ln -s 'app.js' "$symlink_artifact/assets/link.js"
assert_rejected "$symlink_artifact" 'symbolic link'

filename_artifact="$work_dir/leak-filename"
create_artifact "$filename_artifact"
printf 'safe contents\n' >"$filename_artifact/doctor-readiness.local.json"
assert_rejected "$filename_artifact" 'doctor-readiness.local.json'

missing_csp_artifact="$work_dir/reject-missing-csp"
create_artifact "$missing_csp_artifact"
sed -i '/Content-Security-Policy/d' "$missing_csp_artifact/index.html"
assert_rejected "$missing_csp_artifact" 'Content-Security-Policy'

unsafe_csp_artifact="$work_dir/reject-unsafe-csp"
create_artifact "$unsafe_csp_artifact"
sed -i "s/script-src 'self'/script-src 'self' 'unsafe-inline'/" \
  "$unsafe_csp_artifact/index.html"
assert_rejected "$unsafe_csp_artifact" 'Content-Security-Policy'

malformed_csp_artifact="$work_dir/reject-malformed-csp"
create_artifact "$malformed_csp_artifact"
sed -i "s/; base-uri 'none'//" "$malformed_csp_artifact/index.html"
assert_rejected "$malformed_csp_artifact" 'Content-Security-Policy'

root_assets_artifact="$work_dir/reject-root-assets"
create_artifact "$root_assets_artifact"
sed -i 's|src="./assets/app.js"|src="/assets/app.js"|' \
  "$root_assets_artifact/index.html"
assert_rejected "$root_assets_artifact" '/assets/'

headers_artifact="$work_dir/reject-headers"
create_artifact "$headers_artifact"
printf 'Content-Security-Policy: default-src self\n' >"$headers_artifact/_headers"
assert_rejected "$headers_artifact" '_headers'

trailing_slash_headers_artifact="$work_dir/reject-headers-trailing-slash"
create_artifact "$trailing_slash_headers_artifact"
printf 'Content-Security-Policy: default-src self\n' \
  >"$trailing_slash_headers_artifact/_headers"
assert_rejected "$trailing_slash_headers_artifact/" '_headers'

operational_error_artifact="$work_dir/reject-rg-error"
create_artifact "$operational_error_artifact"
fake_rg_dir="$work_dir/fake-rg-bin"
fake_rg_diagnostic='test rg failure: deterministic operational error'
mkdir "$fake_rg_dir"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  "printf '%s\\n' '$fake_rg_diagnostic' >&2" \
  'exit 2' >"$fake_rg_dir/rg"
chmod +x "$fake_rg_dir/rg"
assert_operational_error \
  "$operational_error_artifact" "$fake_rg_dir" "$fake_rg_diagnostic"

if (( failures != 0 )); then
  exit 1
fi

printf 'Public build audit behavior tests passed.\n'
