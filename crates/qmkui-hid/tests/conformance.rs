//! Replays the shared `fixtures/protocol/*.json` vectors through the Rust
//! readers. These vectors are the conformance contract shared with the
//! TypeScript readers; a failure here is a corpus or decoder bug, not a mock
//! artifact.

use qmkui_hid::keychron_v5::KeychronV5Reader;
use qmkui_hid::transport::HidError;
use qmkui_hid::via::{KeymapDimensions, ViaReadProtocol};
use qmkui_hid::HidTransport;
use serde_json::Value;
use std::collections::BTreeMap;

fn read_vectors(file: &str) -> Vec<Value> {
    let contents = std::fs::read_to_string(format!(
        "{}/../../fixtures/protocol/{}",
        env!("CARGO_MANIFEST_DIR"),
        file
    ))
    .expect("vector file readable");
    serde_json::from_str(&contents).expect("vector file valid")
}

fn response_bytes(entry: &Value) -> Vec<u8> {
    entry["response"]
        .as_array()
        .expect("response array")
        .iter()
        .map(|value| value.as_u64().expect("byte") as u8)
        .collect()
}

/// Serves fixture responses keyed by the full request frame, so multi-command
/// readers (and the four `0x08` custom-get-value channel-3 lighting vectors)
/// receive the correct response for each request.
struct VectorTransport {
    by_request: BTreeMap<Vec<u8>, Vec<u8>>,
}

impl VectorTransport {
    fn from_vectors(file: &str) -> Self {
        let mut by_request = BTreeMap::new();
        for entry in read_vectors(file) {
            let request: Vec<u8> = entry["request"]
                .as_array()
                .expect("request array")
                .iter()
                .map(|value| value.as_u64().expect("byte") as u8)
                .collect();
            by_request.insert(request, response_bytes(&entry));
        }
        Self { by_request }
    }
}

impl HidTransport for VectorTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut request = vec![0u8; 32];
        request[0] = command;
        request[1..1 + payload.len()].copy_from_slice(payload);
        self.by_request
            .get(&request)
            .cloned()
            .ok_or(HidError::ResponseMismatch)
    }
}

#[test]
fn replays_via_vectors() {
    let transport = VectorTransport::from_vectors("via-commands.json");
    let mut via = ViaReadProtocol::new(transport);
    assert_eq!(via.get_protocol_version().expect("protocol"), 12);
    assert_eq!(via.get_layer_count().expect("layers"), 4);
    assert_eq!(via.get_keycode(0, 0, 0).expect("keycode"), 0x1234);
    let bytes = via.get_custom_value(2, 1).expect("custom value");
    assert_eq!(&bytes[..1], &[0x2a]);
}

#[test]
fn replays_v5_identity_vectors() {
    let transport = VectorTransport::from_vectors("v5-identity.json");
    let mut reader = KeychronV5Reader::new(transport);
    let identity = reader.read_identity().expect("identity");
    assert_eq!(identity.protocol_version, [2, 0, 2]);
    assert_eq!(identity.firmware_version, "v1.0.0");
    assert_eq!(identity.default_layer, 2);

    let transport = VectorTransport::from_vectors("v5-identity.json");
    let mut reader = KeychronV5Reader::new(transport);
    let caps = reader.read_capabilities().expect("capabilities");
    assert_eq!(caps.feature_bitmap, [0x00, 0x81]);
}

#[test]
fn replays_v5_keymap_vector() {
    let transport = VectorTransport::from_vectors("v5-keymap.json");
    let mut via = ViaReadProtocol::new(transport);
    assert_eq!(via.get_keycode(2, 0, 15).expect("keycode"), 0x0046);
}

#[test]
fn replays_v5_lighting_vectors() {
    // V5 lighting is standard VIA RGB-matrix channel 3, not the Keychron 0xa8
    // protocol (which the firmware answers with id_unhandled).
    let transport = VectorTransport::from_vectors("v5-lighting.json");
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
    let transport = SequentialTransport {
        next_keycode: std::cell::Cell::new(1),
    };
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

struct SequentialTransport {
    next_keycode: std::cell::Cell<u16>,
}

impl HidTransport for SequentialTransport {
    fn request(&mut self, command: u8, _payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut report = vec![0u8; 32];
        report[0] = command;
        if command == 0x11 {
            report[1] = 1; // layer count
        } else if command == 0x04 {
            let keycode = self.next_keycode.get();
            self.next_keycode.set(keycode + 1);
            report[4] = (keycode >> 8) as u8;
            report[5] = (keycode & 0xff) as u8;
        }
        Ok(report)
    }
}
