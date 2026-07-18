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

Routine tests must not open HID or serial endpoints, enter bootloader mode,
flash firmware, or write to a keyboard. Do not add or run hardware-write tests
without an explicitly approved hardware test plan covering the exact device,
target validation, recovery path, and operator steps.

Future write-capable code must remain disabled until it has an authoritative
device profile and must use the safety foundation: current client-side project
validation, a recovery bundle or explicit two-step backup decline, and a final
operator review of every pending action. A past safety record applies only to
the unchanged project/device-source state. Never infer a bootloader, recovery
artifact, firmware revision, or device protocol from a generic profile.

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
