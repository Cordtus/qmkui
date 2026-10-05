# QMKUI

QMKUI is an early, device-first QMK hardware reader. It starts with no selected
keyboard, model, project, key map, or editable workspace. In Chrome, Edge, or
Opera, use **Connect keyboard** to authorize a device in the browser prompt.
QMKUI identifies that device before showing a read action. For the exact wired
**Keychron V5 Max ANSI Knob**, **Read device** performs a bounded read-only
snapshot of the values the firmware reports. For another browser-authorized
VIA raw-HID interface, first choose **Verify protocol**; QMKUI sends only the
standard VIA `Get Protocol Version` request. A successful response enables a
generic standard-state read with no inferred keyboard model or layout.

Connection, Read device, and Refresh device are read-only. QMKUI is also
becoming a write-capable VIA replacement (operator direction 2026-08-12):
a gated write path can set keycodes on the live dynamic keymap and write the
RGB-matrix lighting, exactly like VIA. Keycodes persist immediately (QMK writes
EEPROM on set); lighting is persisted by a separate confirmed "save lighting to
EEPROM" action. Writes are **gated** — they require an explicit
operator confirmation in the UI, a matching device identity, and every frame
must be in the write allow-list
(`fixtures/protocol/write-commands.json`). No write reaches real hardware until
the V5 Max manual test plan (`dev-docs/plans/hardware-test-plan.md`) is signed
off. There is still no flash, bootloader, or firmware path. Unavailable or unverified fields remain visibly unavailable with their
reason; QMKUI never substitutes a bundled default. The bundled V5 definition
is available after a read only as an explicit, read-only comparison reference.

The public instance is available at
[https://cordtus.github.io/qmkui/](https://cordtus.github.io/qmkui/). GitHub
Actions uses local self-hosted runners to deploy the same audited static
artifact built and previewed with the commands below.

## What works

- Detect a previously authorized HID device or authorize one explicitly, and
  accurately show unsupported hardware as unsupported.
- Recognize the exact wired Keychron V5 Max ANSI Knob and expose **Read device**
  only after browser authorization.
- Offer a neutral generic VIA candidate only for an authorized VIA raw-HID
  interface. Verification sends only standard VIA command `0x01`; devices that
  do not answer it remain neutral and never receive Keychron/vendor I/O.
- After generic VIA verification, read the protocol value, standard keyboard
  values, layer count, and standard QMK lighting custom values through the
  read-only VIA surface. Unknown definitions, matrix dimensions, keymaps, and
  switch-matrix geometry stay unavailable or unverified rather than becoming a
  model, static project, layout, or default configuration.
- Read and display the reported V5 identity, feature bitmap, VIA keymap values,
  and RGB-matrix lighting without emitting any mutation packet. The V5 keymap
  read uses the verified definition's four-layer, six-row, 19-column matrix
  shape, then renders the returned keycodes as the current read-only keyboard
  view; it does not use the bundled keymap as device state. The V5 lighting read
  uses the standard VIA RGB-matrix custom channel (channel 3: brightness,
  effect, effect speed, hue, saturation); the Keychron `0xA8` vendor RGB
  protocol is not implemented by the V5 Max firmware and is not in the
  allow-list.
- The confirmed-VIA protocol layer permits only these standard state queries:
  protocol version; uptime, layout options, switch-matrix state, firmware, and
  keycodes versions; keycodes; macro count, size, and buffer; layer count;
  dynamic-keymap buffer; encoder mappings; and explicitly selected custom-get
  values. It rejects every set, save, reset, EEPROM, and bootloader command
  before HID I/O. Standard QMK custom channels are returned as verified raw
  protocol values; a vendor custom-channel result remains unverified until an
  exact decoder is registered. The generic browser read uses only the standard
  `0x01`, `0x02`, `0x08`, and `0x11` read surfaces; it cannot send Keychron
  `0xA0` frames.
- Display the reported global RGB-matrix state (brightness, effect, effect
  speed, and hue/saturation). Dynamic effects are labeled as configuration
  effects, not as a captured live animation.
- Keep unavailable or unverified identity, capability, keymap, and lighting
  areas grouped with their device-provided reason.
- Compare a successful V5 read with the bundled definition baseline without
  applying that baseline to the device or treating it as current state.
- Inspect software and read-only Linux readiness with `qmkui-doctor`.

Project saves use browser `localStorage` (or an injected adapter) and persist
across reloads; project JSON exports are plain local files. QMKUI does not
transmit, encrypt, or treat them as tamper-proof. They do not read, back up, or
restore keyboard firmware, EEPROM, wireless configuration, or other device
state.

QMKUI can also write to the connected device through a **gated** path: every
write frame must be in `fixtures/protocol/write-commands.json`, runs only after
explicit operator confirmation, and is refused unless the connected device's
USB id matches the open project's keyboard. Keycode writes persist immediately
(QMK writes EEPROM on set); RGB-matrix lighting is persisted by a separate
confirmed "save lighting to EEPROM" action. In-app compilation, flashing,
bootloader entry, and broad catalog ingestion are not implemented; the app can
plan a local `qmk compile` command and dry-run a flash policy, but executes
neither.

## Safety and recovery

A successful read is a transient display of observed hardware state, not a
device backup. The write path is exercised only against mock transports until
the V5 Max manual test plan (`dev-docs/plans/hardware-test-plan.md`) is signed
off by the operator; no write reaches real hardware before then. There is no
flash or bootloader path. Keep vendor recovery firmware separately, matched to
the exact model and firmware.

## Requirements

- Node.js 24 and npm
- Stable Rust with `rustfmt` and `clippy`
- Linux for the optional read-only hardware probe

The browser app itself can be built and served without QMK CLI or connected
hardware.

## Install and run

Install the locked frontend dependencies:

```bash
npm --prefix apps/desktop ci
```

Start the development server on localhost:

```bash
npm --prefix apps/desktop run dev -- --port 5173
```

Open `http://127.0.0.1:5173`. Development mode can display a local Doctor
report generated by the read-only probe below.

Append `?demo` (`http://127.0.0.1:5173/?demo`) to load a **dev-only mock
Keychron V5 Max**. The full UI — discovery, reads, and the gated write path —
runs against an in-memory device (captured identity/lighting plus the stock
keymap), so you can exercise backlight mapping and customization without
hardware. The mock is excluded from production builds.

## Install as an app

QMKUI is an installable web app — there is no native shell or bundled webview.
In a Chromium-based browser, use the address-bar install icon (or menu →
"Install QMKUI") to run it in its own window with an icon. This works for the
deployed site and for any static host, including the `npm run preview` build.

WebHID is only exposed in a secure context (HTTPS or localhost). On Linux,
Chromium also needs permission to open the keyboard's raw HID interfaces:
install `packaging/udev/70-qmkui.rules` to `/usr/lib/udev/rules.d/`, reload
udev, and reconnect the keyboard.

## Build the public app

Build and audit the same static artifact used for public deployment:

```bash
npm --prefix apps/desktop run build
npm --prefix apps/desktop run audit:build
```

Serve that production artifact locally on localhost:

```bash
npm --prefix apps/desktop run preview
```

The preview URL is printed by Vite. The production build contains no local
Doctor report; it includes the user-triggered V5 Max read allowlist plus the
generic standard-VIA read surface. The generic path has no model/layout/default
fallback and no backup, default/reset, write, or flash operation.

## Doctor

Run all routine software checks. Its Doctor step explicitly skips hardware:

```bash
scripts/test-software.sh
```

Run the opt-in, read-only Linux probe and make its report available to the
development server:

```bash
scripts/probe-read-only.sh
```

The read-only probe inspects Linux USB descriptor metadata under
`/sys/bus/usb/devices`. It does not open device endpoints or collect USB serial
numbers. Do not use either command as a flashing workflow.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, project structure, and
the hardware-safety boundary.

## License

QMKUI is MIT licensed. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
