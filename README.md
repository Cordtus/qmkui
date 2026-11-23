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

## Interface

Three surfaces, one workbench:

- **Keymap** — board-first editing, one inspector (Lighting / Key / Layer), and
  a write strip that stays attached to the board.
- **Device** — identity, capability chips, macros, recovery, and an opt-in key
  tester; the board and lighting live only in Keymap.
- **Firmware** — Build → Flash → Verify step rail, the exact `qmkui-flash`
  command, diagnostics, and support export.

Generate local design captures at 1440/1024/768 with
`npm --prefix apps/desktop run ui:screens` (output is gitignored under
`apps/desktop/.local/ui-screens`). Captures are deliberately not committed:
they are binary churn and drift from the code. Regenerate them when reviewing a
UI change.

## Status

| Capability | State |
| --- | --- |
| Detect / identify a HID keyboard | Works, opt-in per browser prompt |
| Read a Keychron V5 Max ANSI Knob | Works: identity, capabilities, keymap, lighting, macros |
| Read any other verified VIA device | Standard VIA state only, no inferred model or layout |
| Edit a key map and lighting profile (project) | Works, local project data |
| Write keycodes / RGB-matrix lighting to hardware | Implemented and gated; mock transports only until the bench test is signed off |
| Flash / bootloader / firmware build | Native `qmkui-flash` CLI; the browser only previews |
| In-app `qmk compile` execution | Not implemented; QMKUI plans the command and hands the bundle to `qmkui-flash` |

## What a read gives you

- **Identity** — model, firmware version, protocol version, default layer.
- **Capabilities** — the firmware feature bitmap.
- **Keymap** — the live dynamic keymap, read per matrix position and used to
  confirm the device's capabilities. The editing board renders the project with
  its bundled definition; device state is never substituted for it.
- **Lighting** — the global VIA RGB-matrix state: brightness, effect, effect
  speed, hue and saturation (channel 3).
- **Macros** — the VIA dynamic macro buffer, decoded into key steps and text.

Reads are bounded and allow-listed in `fixtures/protocol/read-only-commands.json`.
Set, save, reset, EEPROM and bootloader commands are rejected before any HID
report is sent. Unknown VIA boards must pass a single standard
`Get Protocol Version` (`0x01`) check before QMKUI reads standard state, and
they never receive Keychron vendor frames.

## Key map and backlighting

The key map is the lighting canvas. The right rail has three tabs — **Lighting**,
**Key**, **Layer** — so only one control set is on screen. Click a key
(Shift/Ctrl/⌘-click for more, or **All keys**), then use the colour wheel in
**Lighting → Keys**: hue around the rim, saturation from the centre,
brightness on the Value slider, plus a hex field. **Paint keys** turns clicks into a brush so you can colour key after
key, **Clear** removes overrides, and the swatch row re-applies colours already
used in the project.

Colours read back from the board are mirrored per key, and **Resync** re-reads
the board's lighting without re-reading the keymap. VIA exposes global
RGB-matrix state only: per-key colours live in the project and the generated
firmware bundle. **Lighting → Board** is the separate, global VIA write
(effect, board colour, brightness, speed); **Persist lighting**
stores that state in the keyboard EEPROM so it survives unplugging. Writing
board lighting never converts a painted key colour into the whole board.

**Key rules** add stateful lighting: Caps/Num/Scroll Lock indicators, “while
layer N is active”, and “while key X is held”. **Download firmware** builds a
zip with `keymap.c` (all layers), `qmkui-lighting-rules.c`
(`rgb_matrix_indicators_advanced_user` with every per-key colour and rule), and
build/flash instructions. Copy it into your QMK checkout, then compile and
flash with QMK CLI or Toolbox. The browser app does not build or flash
firmware; the native `qmkui-flash` adapter does (below).

## Exports

- **QMK JSON** (header) — layers only, in QMK Configurator/VIA format.
- **Project JSON** (Project drawer) — the full project: layers, lighting
  profile, per-key colours and rules. This is the backup format.
- **Support bundle** — app version/mode/WebHID, project target, full keymap,
  lighting profile + rules, device identity/lighting when connected, validation
  issues, doctor findings (local paths redacted) and macros (actions redacted
  unless requested).
- **Firmware zip** (Lighting → Firmware) — `keymap.c`, the lighting overlay and
  build/flash instructions.

## Flash a firmware bundle

**Download firmware** produces a zip with the keymap and lighting overlay. Put
the board in bootloader mode, then use the native adapter (QMK CLI and
`dfu-util` installed):

```sh
cargo run -p qmkui-flash --release -- --bundle ~/Downloads/my-board-firmware.zip \
  --qmk-path ~/qmk_firmware --keyboard keychron/v5_max/ansi_encoder \
  --keymap qmkui_my_board --bootloader stm32-dfu \
  --confirm keychron/v5_max/ansi_encoder
```

`--confirm` must repeat the `--keyboard` target: the operator names what they
are flashing, rather than passing a bare flag. The CLI also reads the
keyboard's declared bootloader family from its QMK `info.json`; a typo'd target
or wrong `--bootloader` is refused before anything is staged. STM32/ATmega DFU
USB ids are family-generic, so the exact board model cannot be proven in
bootloader mode: disconnect other boards, keep only the target in bootloader
mode until the run finishes, and confirm the target. The bundle's README must
name the same `-kb` keyboard, so a bundle built for another board is refused
before staging. `--dry-run` prints the bundle
checksum, extraction target and `qmk flash` command without probing the device
or writing files. A real run reads only bootloader USB ids from sysfs, requires
exactly one matching device, stages the keymap under `<qmk>/.qmkui/`, then moves
it into `keyboards/<keyboard>/keymaps/<keymap>/` and invokes `qmk flash`. An
existing keymap directory is kept under `.qmkui/backups/`. Runs keep a log with
the target, detected identity, bootloader family and bundle sha256 under
`$XDG_STATE_HOME/qmkui` (default `~/.local/state/qmkui`). Supported families:
`stm32-dfu` (V5 Max) and `atmel-dfu`. The browser cannot see
bootloader mode, so it never flashes by itself.

Exit codes: `0` success, `2` usage/IO, `3` no unique bootloader device, `4`
refused or flash failed.

## Safety model

A read is a transient view of hardware state, not a backup. Writes — keycodes on
the live dynamic keymap, and RGB-matrix lighting — go through one gated path:

1. every frame is in `fixtures/protocol/write-commands.json`;
2. the operator ticks a confirmation and enables writes for the session;
3. the keyboard declares a USB id and the connected device matches it (a
   keyboard without a declared USB id cannot be written).

Keycodes persist immediately (QMK writes EEPROM on set). Lighting is volatile
until a separate confirmed **Persist lighting** action stores it in EEPROM. The
V5 Max lighting frames were validated against the documented manual test plan
before hardware use. Flash goes only through `qmkui-flash`: an explicit target
confirmation, one matching bootloader device, a checksummed bundle staged under
`.qmkui/`, then `qmk flash`. Keep vendor recovery firmware separately, matched
to the exact model and firmware.

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
stock keymap), so discovery, reads, the Keymap board and the gated write path
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
cargo run -p qmkui-build -- --project fixtures/projects/example-60.json --check  # exits 3 when blocked
scripts/refresh-catalog.sh --check              # validates ingest + checked-in catalog
cargo run -p qmkui-hid --bin protocol-check      # replays shared VIA/Keychron vectors
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
crates/qmkui-hid      read-only VIA/Keychron protocol core; supplies Doctor protocol gates
crates/qmkui-build    build planning, command runner, artifact store, project CLI
crates/qmkui-flash    flash models, bootloader registry, wrong-target policy, gated qmk flash adapter/CLI
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
