//! Gated write-path tests. The mock records the exact report frame emitted;
//! these assert the set-keycode, lighting, and save-EEPROM frames against the
//! protocol contract.

use qmkui_hid::transport::{HidError, HidTransport};
use qmkui_hid::via_write::{RgbMatrixLighting, ViaWriteProtocol};
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Clone)]
struct RecordingTransport {
    frames: Rc<RefCell<Vec<Vec<u8>>>>,
}

impl RecordingTransport {
    fn new() -> Self {
        Self {
            frames: Rc::new(RefCell::new(Vec::new())),
        }
    }
}

impl HidTransport for RecordingTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut report = vec![0u8; 32];
        report[0] = command;
        for (index, byte) in payload.iter().take(31).enumerate() {
            report[1 + index] = *byte;
        }
        self.frames.borrow_mut().push(report.clone());
        Ok(report)
    }
}

#[test]
fn set_keycode_emits_the_via_frame() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_keycode(1, 0, 15, 0x0046)
        .expect("set keycode succeeds");

    let frames = frames.borrow();
    let frame = frames.last().expect("a frame was emitted");
    assert_eq!(frame[0], 0x05);
    assert_eq!(&frame[1..4], &[1, 0, 15]);
    assert_eq!(&frame[4..6], &[0x00, 0x46]);
}

#[test]
fn save_rgb_matrix_eeprom_emits_the_channel_three_frame() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write.save_rgb_matrix_eeprom().expect("save succeeds");

    let frames = frames.borrow();
    let frame = frames.last().expect("a frame was emitted");
    // [id_custom_save, rgb-matrix channel, 0, 0] — the channel byte is what
    // routes the save to the lighting handler.
    assert_eq!(&frame[0..4], &[0x09, 3, 0, 0]);
}

#[test]
fn set_custom_value_emits_the_via_frame() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_custom_value(3, 1, &[200])
        .expect("custom set succeeds");

    let frames = frames.borrow();
    let frame = frames.last().expect("a frame was emitted");
    // [id_custom_set_value, channel, value_id, ...data]
    assert_eq!(frame[0], 0x07);
    assert_eq!(&frame[1..4], &[3, 1, 200]);
}

#[test]
fn set_rgb_matrix_color_emits_hue_and_saturation() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_rgb_matrix_color(113, 221)
        .expect("colour set succeeds");

    let frames = frames.borrow();
    let frame = frames.last().expect("a frame was emitted");
    assert_eq!(&frame[0..5], &[0x07, 3, 4, 113, 221]);
}

#[test]
fn set_rgb_matrix_lighting_emits_brightness_speed_and_color() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_rgb_matrix_lighting(RgbMatrixLighting {
            brightness: 120,
            effect_speed: 128,
            hue: 10,
            saturation: 20,
            effect: Some(2),
        })
        .expect("lighting write succeeds");

    let frames = frames.borrow();
    // brightness, effect, effect speed, colour (in that order).
    assert_eq!(&frames[0].as_slice()[0..4], &[0x07, 3, 1, 120]);
    assert_eq!(&frames[1].as_slice()[0..4], &[0x07, 3, 2, 2]);
    assert_eq!(&frames[2].as_slice()[0..4], &[0x07, 3, 3, 128]);
    assert_eq!(&frames[3].as_slice()[0..5], &[0x07, 3, 4, 10, 20]);
}

#[test]
fn set_rgb_matrix_lighting_omits_the_effect_when_unknown() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_rgb_matrix_lighting(RgbMatrixLighting {
            brightness: 120,
            effect_speed: 128,
            hue: 10,
            saturation: 20,
            effect: None,
        })
        .expect("lighting write succeeds");

    let frames = frames.borrow();
    // No frame with value id 2 (effect).
    assert!(frames.iter().all(|frame| frame[2] != 2));
}

#[test]
fn set_rgb_matrix_lighting_writes_effect_zero_when_explicit() {
    let transport = RecordingTransport::new();
    let frames = transport.frames.clone();
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_rgb_matrix_lighting(RgbMatrixLighting {
            brightness: 120,
            effect_speed: 128,
            hue: 10,
            saturation: 20,
            effect: Some(0),
        })
        .expect("lighting write succeeds");

    let frames = frames.borrow();
    // None (mode 0) is a real, explicit choice and must be emitted.
    assert!(frames
        .iter()
        .any(|frame| frame[0] == 0x07 && frame[2] == 2 && frame[3] == 0));
}

#[test]
fn set_keycode_requires_a_matching_echo() {
    struct NoEcho;
    impl HidTransport for NoEcho {
        fn request(&mut self, _command: u8, _payload: &[u8]) -> Result<Vec<u8>, HidError> {
            let mut report = vec![0u8; 32];
            report[0] = 0xff; // wrong command echo
            Ok(report)
        }
    }
    let mut write = ViaWriteProtocol::new(NoEcho);
    assert!(matches!(
        write.set_keycode(0, 0, 0, 0x0004),
        Err(HidError::ResponseMismatch)
    ));
}
