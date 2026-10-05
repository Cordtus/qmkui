# Contributing to QMKUI

QMKUI is in active development. Keep changes focused, behavior-tested, and
inside the software-only safety boundary.

## Setup

Install Node.js 24, npm, and stable Rust with `rustfmt` and `clippy`. If Rust
is managed by `rustup`, install the required toolchain and make it the default:

```bash
rustup toolchain install stable --profile default --component rustfmt,clippy
rustup default stable
```

For a distro-managed Rust installation, install its stable `cargo`, `rustc`,
`rustfmt`, and `clippy` packages instead; no `rustup` command is needed. Then
install the locked frontend dependencies:

```bash
npm --prefix apps/desktop ci
```

## Repository layout

- `apps/desktop`: static TypeScript/Vite browser app
- `crates/qmkui-core`: project model, validation, and QMK JSON export
- `crates/qmkui-catalog`: keyboard definition loading and search
- `crates/qmkui-doctor`: software readiness and opt-in read-only Linux probe
- `fixtures`: deterministic catalog and project test inputs
- `packaging/arch`: local Arch/Garuda Doctor package
- `scripts`: repeatable checks, probing, and public-build auditing

## Checks

Run the complete routine software suite:

```bash
scripts/test-software.sh
```

Before submitting a change, also run the stricter lint and public-artifact
checks:

```bash
cargo clippy --workspace --all-targets -- -D warnings
scripts/test-public-build-audit.sh
scripts/test-public-packaging.sh
npm --prefix apps/desktop run audit:build
```

Focused commands are useful while iterating:

```bash
cargo fmt --all -- --check
cargo test --workspace
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop test
npm --prefix apps/desktop run build
```

Tests should exercise observable behavior and realistic failure boundaries.
Prefer deterministic inputs and public interfaces over source-text checks,
private implementation details, broad snapshots, or mocks that replace the
behavior under test. Add a regression test first for a bug fix when practical.

## Hardware safety

QMKUI is a write-capable VIA replacement (operator direction 2026-08-12).
Writes are gated, never unrestricted:

- Routine tests must not open HID or serial endpoints, enter bootloader mode,
  flash firmware, or write to a keyboard, except through the gated write path
  and only against mock transports or an approved hardware test plan.
- Every write frame must be in `fixtures/protocol/write-commands.json` and pass
  the write allow-list in `qmkui-hid`; nothing is hardcoded ad hoc.
- A write only runs after explicit operator confirmation in the UI and only
  when the device identity matches the selected target. Keycode writes persist
  immediately; lighting is persisted by a separate confirmed "save lighting to
  EEPROM" action.
- No write reaches real hardware until the V5 Max manual test plan
  (`dev-docs/plans/hardware-test-plan.md`) is signed off by the operator.
  Until then, writes are exercised only against mock transports and the
  dry-run adapter.
- Never infer a bootloader, recovery artifact, firmware revision, or device
  protocol from a generic profile.

Recovery bundles and browser ledger data are intentionally local-only plain
JSON. Do not add network upload, analytics, USB serial-number collection, or
claims that user-controlled browser storage is tamper-proof.

Do not treat a download click as a completed backup. A write workflow may use a
backup only after the operator explicitly confirms that the exported file was
saved. If local ledger storage is unavailable or corrupt, future write
preparation must fail closed. Recovery imports may reuse safety history only
when their complete catalog definition exactly matches the current bundled
definition; otherwise import the project as unverified and require a new
sequence.

`scripts/probe-read-only.sh` is an explicit local action. It may read Linux USB
descriptor metadata but must remain free of device-endpoint access and writes.
