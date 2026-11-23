//! Replays the shared `fixtures/protocol/*.json` vectors through the Rust
//! readers. These vectors are the conformance contract shared with the
//! TypeScript readers; a failure here is a corpus or decoder bug, not a mock
//! artifact.

use qmkui_hid::fixture_support::{SequentialTransport, VectorTransport};
use qmkui_hid::keychron_v5::KeychronV5Reader;
use qmkui_hid::transport::HidError;
use qmkui_hid::via::{KeymapDimensions, ViaReadProtocol};
use qmkui_hid::HidTransport;

#[test]
fn replays_via_vectors() {
    let transport =
        VectorTransport::from_manifest_fixture("via-commands.json").expect("via fixtures");
    let mut via = ViaReadProtocol::new(transport);
    assert_eq!(via.get_protocol_version().expect("protocol"), 12);
    assert_eq!(via.get_layer_count().expect("layers"), 4);
    assert_eq!(via.get_keycode(0, 0, 0).expect("keycode"), 0x1234);
    let bytes = via.get_custom_value(2, 1).expect("custom value");
    assert_eq!(&bytes[..1], &[0x2a]);
}

#[test]
fn replays_v5_identity_vectors() {
    let transport =
        VectorTransport::from_manifest_fixture("v5-identity.json").expect("identity fixtures");
    let mut reader = KeychronV5Reader::new(transport);
    let identity = reader.read_identity().expect("identity");
    assert_eq!(identity.protocol_version, [2, 0, 2]);
    assert_eq!(identity.firmware_version, "v1.0.0");
    assert_eq!(identity.default_layer, 2);

    let transport =
        VectorTransport::from_manifest_fixture("v5-identity.json").expect("identity fixtures");
    let mut reader = KeychronV5Reader::new(transport);
    let caps = reader.read_capabilities().expect("capabilities");
    assert_eq!(caps.feature_bitmap, [0x00, 0x81]);
}

#[test]
fn replays_v5_keymap_vector() {
    let transport =
        VectorTransport::from_manifest_fixture("v5-keymap.json").expect("keymap fixtures");
    let mut via = ViaReadProtocol::new(transport);
    assert_eq!(via.get_keycode(2, 0, 15).expect("keycode"), 0x0046);
}

#[test]
fn replays_v5_lighting_vectors() {
    // V5 lighting is standard VIA RGB-matrix channel 3, not the Keychron 0xa8
    // protocol (which the firmware answers with id_unhandled).
    let transport =
        VectorTransport::from_manifest_fixture("v5-lighting.json").expect("lighting fixtures");
    let mut via = ViaReadProtocol::new(transport);
    let state = via.read_rgb_matrix_state().expect("rgb matrix state");
    assert_eq!(
        state,
        qmkui_hid::via::ViaRgbMatrixState {
            brightness: 255,
            effect: 1,
            effect_speed: 127,
            hue: 113,
            saturation: 221,
        }
    );
}

#[test]
fn read_via_keymap_reads_all_positions() {
    let transport = SequentialTransport::new();
    let mut via = ViaReadProtocol::new(transport);
    let keymap = via
        .read_via_keymap(KeymapDimensions {
            layer_count: 1,
            rows: 1,
            columns: 3,
        })
        .expect("keymap");
    assert_eq!(keymap.keycodes[0][0], vec![1, 2, 3]);
}

#[test]
fn read_via_macros_decodes_actions_and_characters_across_chunks() {
    // Macro 1: "hi"; Macro 2: tap KC_A, tap KC_B. Buffer is 9 bytes, read in a
    // single chunk.
    let transport = MacroTransport {
        buffer: vec![0x68, 0x69, 0x00, 0x01, 0x04, 0x01, 0x05, 0x00],
    };
    let mut via = ViaReadProtocol::new(transport);
    let macros = via.read_via_macros().expect("macros");
    assert_eq!(macros.count, 2);
    assert_eq!(macros.buffer_size, 8);
    assert_eq!(macros.macros.len(), 2);
    assert_eq!(macros.macros[0].len(), 2);
    assert_eq!(
        macros.macros[0][0],
        qmkui_hid::via::ViaMacroStep {
            kind: qmkui_hid::via::ViaMacroStepKind::Char,
            keycode: None,
            char: Some("h".to_owned()),
        }
    );
    assert_eq!(
        macros.macros[1][0],
        qmkui_hid::via::ViaMacroStep {
            kind: qmkui_hid::via::ViaMacroStepKind::Tap,
            keycode: Some(0x04),
            char: None,
        }
    );
}

#[test]
fn read_via_macros_returns_empty_when_disabled() {
    let transport = MacroTransport { buffer: Vec::new() };
    let mut via = ViaReadProtocol::new(transport);
    let macros = via.read_via_macros().expect("macros");
    assert_eq!(macros.count, 0);
    assert_eq!(macros.macros, Vec::<Vec<_>>::new());
}

#[test]
fn read_helpers_decode_keyboard_values_and_encoders() {
    let mut via = ViaReadProtocol::new(
        VectorTransport::from_manifest_fixture("via-commands.json").expect("via fixtures"),
    );
    assert_eq!(via.get_uptime().expect("uptime"), 0x0102_0304);
    assert_eq!(via.get_layout_options().expect("layout options"), 3);
    assert_eq!(via.get_firmware_version().expect("firmware"), 0x0001_0002);
    assert_eq!(via.get_keycodes_version().expect("keycodes"), 12);
    assert_eq!(
        via.get_encoder_keycode(2, 1, true).expect("encoder"),
        0xabcd
    );
}

#[test]
fn replays_the_dynamic_keymap_and_macro_buffer_vectors() {
    let mut via = ViaReadProtocol::new(
        VectorTransport::from_manifest_fixture("via-commands.json").expect("via fixtures"),
    );
    assert_eq!(
        via.get_dynamic_keymap_buffer(0x0456, 2)
            .expect("dynamic buffer"),
        vec![0xca, 0xfe]
    );

    let mut via = ViaReadProtocol::new(
        VectorTransport::from_manifest_fixture("via-commands.json").expect("via fixtures"),
    );
    assert_eq!(
        via.get_macro_buffer(0, 4).expect("macro buffer"),
        vec![0x68, 0x69, 0x00, 0x00]
    );
}

#[test]
fn dynamic_keymap_buffer_rejects_an_empty_or_oversized_chunk() {
    let mut via = ViaReadProtocol::new(
        VectorTransport::from_manifest_fixture("via-commands.json").expect("via fixtures"),
    );
    assert!(matches!(
        via.get_dynamic_keymap_buffer(0, 0),
        Err(HidError::InvalidRequest)
    ));
    assert!(matches!(
        via.get_dynamic_keymap_buffer(0, 29),
        Err(HidError::InvalidRequest)
    ));
}

/// Serves macro commands from a fixed buffer. `0x0c` reports the macro count
/// (one NUL-terminated macro per run), `0x0d` reports the buffer size, and
/// `0x0e` serves chunked slices.
struct MacroTransport {
    buffer: Vec<u8>,
}

impl MacroTransport {
    fn macro_count(&self) -> u8 {
        self.buffer.iter().filter(|&&byte| byte == 0).count() as u8
    }
}

impl HidTransport for MacroTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut report = vec![0u8; 32];
        report[0] = command;
        match command {
            0x0c => report[1] = self.macro_count(),
            0x0d => {
                let size = self.buffer.len() as u16;
                report[1] = (size >> 8) as u8;
                report[2] = (size & 0xff) as u8;
            }
            0x0e => {
                let offset = (u16::from(payload[0]) << 8) | u16::from(payload[1]);
                let size = usize::from(payload[2]);
                report[1] = payload[0];
                report[2] = payload[1];
                report[3] = payload[2];
                for (index, byte) in self
                    .buffer
                    .iter()
                    .skip(offset as usize)
                    .take(size)
                    .enumerate()
                {
                    report[4 + index] = *byte;
                }
            }
            _ => return Err(HidError::ResponseMismatch),
        }
        Ok(report)
    }
}
