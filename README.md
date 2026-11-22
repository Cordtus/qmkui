# QMKUI

A device-first QMK/VIA keyboard inspector that runs in the browser over WebHID.
Connect a keyboard, see what the firmware actually reports, and shape a key map
and lighting profile against it — with every write gated behind explicit
confirmation.

**Live:** [https://qmkui.vercel.app](https://qmkui.vercel.app)

QMKUI starts with no assumed keyboard. It identifies the device first and only
then offers the actions that device supports. Unavailable or unverified values
are shown with the firmware's reason; nothing is filled in from a bundled
default.

## Status

| Capability | State |
| --- | --- |
| Detect / identify a HID keyboard | Works, opt-in per browser prompt |
| Read a Keychron V5 Max ANSI Knob | Works: identity, capabilities, keymap, lighting, macros |
| Read any other verified VIA device | Standard VIA state only, no inferred model or layout |
| Edit a key map and lighting profile (project) | Works, local project data |
| Write keycodes / RGB-matrix lighting to hardware | Implemented and gated; mock transports only until the bench test is signed off |
| Flash / bootloader / firmware build | Not implemented |
| In-app `qmk compile` execution | Not implemented; QMKUI can plan the command and run a flash policy dry-run |

## What a read gives you

- **Identity** — model, firmware version, protocol version, default layer.
- **Capabilities** — the firmware feature bitmap.
- **Keymap** — the live dynamic keymap, read per matrix position and rendered on
  the board. The bundled definition is never substituted for device state.
- **Lighting** — the global VIA RGB-matrix state: brightness, effect, effect
  speed, hue and saturation (channel 3).
- **Macros** — the VIA dynamic macro buffer, decoded into key steps and text.

Reads are bounded and allow-listed in `fixtures/protocol/read-only-commands.json`.
Set, save, reset, EEPROM and bootloader commands are rejected before any HID
report is sent. Unknown VIA boards must pass a single standard
`Get Protocol Version` (`0x01`) check before QMKUI reads standard state, and
they never receive Keychron vendor frames.

## Key map and backlighting

The key map is the lighting canvas. Click a key (Shift/Ctrl/⌘-click for more,
or **All keys**), then use the colour wheel in **Lighting → Key colour**: hue
around the rim, saturation from the centre, brightness on the slider, plus a
hex field. **Paint keys** turns clicks into a brush so you can colour key after
key, **Clear** removes overrides, and the swatch row re-applies colours already
used in the project.

Colours read back from the board are mirrored per key, and **Resync** re-reads
the board's lighting without re-reading the keymap. VIA exposes global
RGB-matrix state only, so per-key colours live in the project and travel with
the generated C, not the QMK JSON export (a project with per-key colours or
rules deliberately blocks JSON export).

**Key rules** add stateful lighting: Caps/Num/Scroll Lock indicators, “while
layer N is active”, and “while key X is held”. **Download rules C** generates a
`rgb_matrix_indicators_advanced_user()` overlay containing your per-key colours
and every rule. Paste it into the keymap, then build and flash with your own QMK
toolchain — QMKUI does not build or flash firmware.

There is no flash or bootloader path.

## Safety model

A read is a transient view of hardware state, not a backup. Writes — keycodes on
the live dynamic keymap, and RGB-matrix lighting — go through one gated path:

1. every frame is in `fixtures/protocol/write-commands.json`;
2. the operator ticks a confirmation and enables writes for the session;
3. the connected device's USB id must match the open project's keyboard.

Keycodes persist immediately (QMK writes EEPROM on set). Lighting is volatile
until a separate confirmed **Save lighting to EEPROM** action. Writes are
exercised only against mock transports until the V5 Max manual test plan is
signed off by the operator; no write reaches real hardware before then. Keep
vendor recovery firmware separately, matched to the exact model and firmware.

## Run it

Requirements: Node.js 24, npm, and a Chromium-based browser (Chrome, Chromium or
Edge). Rust is only needed for the workspace crates and checks.

```bash
npm --prefix apps/desktop ci
npm --prefix apps/desktop run dev -- --port 5173
```

Open `http://127.0.0.1:5173` and choose **Connect keyboard**.

### Demo without hardware

Append `?demo` to the dev URL:

```
http://127.0.0.1:5173/?demo
```

That installs a dev-only mock Keychron V5 Max (captured identity and lighting,
stock keymap), so discovery, reads, the key map mirror and the gated write path
all work in memory. The mock is excluded from production builds.

### Install as an app

There is no native shell or bundled webview. Use the browser's address-bar
install icon (or menu → **Install QMKUI**) to run the deployed site or a local
preview in its own window.

WebHID needs a secure context: HTTPS or `localhost`. On Linux, Chromium also
needs permission for the keyboard's raw HID interface:

```bash
sudo install -m 644 packaging/udev/70-qmkui.rules /usr/lib/udev/rules.d/
sudo udevadm control --reload-rules
# reconnect the keyboard
```

## Develop

```bash
npm --prefix apps/desktop run typecheck    # tsc --noEmit (src/)
npm --prefix apps/desktop test             # vitest
npm --prefix apps/desktop run build        # tsc && vite build
npm --prefix apps/desktop run preview      # serve dist/
npm --prefix apps/desktop run audit:build  # public-build audit on dist/

scripts/test-software.sh                   # full CI gate (Rust + frontend + audit + doctor)
scripts/probe-read-only.sh                 # opt-in Linux USB metadata probe
```

Rust workspace:

```bash
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo run -p qmkui-doctor -- --no-hardware-probe
```

Run `cargo fmt --check`, `cargo test`, the frontend tests and
`scripts/test-public-build-audit.sh` / `scripts/test-public-packaging.sh` before
submitting; `scripts/test-software.sh` is the CI gate.

## Project layout

```
apps/desktop          the whole product: static TypeScript/Vite app
crates/qmkui-core     project model, validation, QMK JSON export
crates/qmkui-catalog  keyboard definition loading and search
crates/qmkui-doctor   readiness CLI + opt-in read-only USB metadata probe
crates/qmkui-hid      read-only VIA/Keychron protocol core
crates/qmkui-build    build planning, command runner, artifact store
crates/qmkui-flash    flash models, wrong-target policy, dry-run adapters
fixtures/             catalog, projects, protocol vectors and allow-lists
scripts/              check, audit and probe entrypoints
packaging/            Arch PKGBUILD and the read-only udev rule
```

The read and write allow-lists under `fixtures/protocol/` are the single source
of truth: the TypeScript readers derive their command sets from them. Never add
a hand-synced command constant.

## Data and privacy

Projects and saved projects live in browser `localStorage`; exports are plain
local files. QMKUI has no backend, telemetry or upload path. The Linux probe
reads USB descriptor metadata only — it does not open endpoints or collect
serial numbers.

## Deployment

The Vercel project uses `apps/desktop` as its root directory, so its
`apps/desktop/vercel.json` runs `npm ci` + `npm run build` and publishes
`apps/desktop/dist`. Pushes to `main` are gated by the `ci` check in branch
protection. GitHub Actions runs the checks only and does not
deploy. The public-build audit must pass before an artifact ships.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, project structure and
the hardware-safety boundary.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
