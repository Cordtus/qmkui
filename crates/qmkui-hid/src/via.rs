//! Standard VIA read commands, mirroring `viaReadProtocol.ts`. Every command
//! is gated by the shared read-only allow-list before any report is emitted.

use crate::allowlist::is_read_only_via_command;
use crate::transport::{HidError, HidTransport, REPORT_LENGTH};

const GET_PROTOCOL_VERSION: u8 = 0x01;
const GET_KEYBOARD_VALUE: u8 = 0x02;
const DYNAMIC_KEYMAP_GET_KEYCODE: u8 = 0x04;
const CUSTOM_GET_VALUE: u8 = 0x08;
const DYNAMIC_KEYMAP_MACRO_GET_COUNT: u8 = 0x0c;
const DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE: u8 = 0x0d;
const DYNAMIC_KEYMAP_MACRO_GET_BUFFER: u8 = 0x0e;
const DYNAMIC_KEYMAP_GET_LAYER_COUNT: u8 = 0x11;
const DYNAMIC_KEYMAP_GET_BUFFER: u8 = 0x12;
const DYNAMIC_KEYMAP_GET_ENCODER: u8 = 0x14;

const KEYBOARD_VALUE_UPTIME: u8 = 0x01;
const KEYBOARD_VALUE_LAYOUT_OPTIONS: u8 = 0x02;
const KEYBOARD_VALUE_FIRMWARE_VERSION: u8 = 0x04;
const KEYBOARD_VALUE_KEYCODES_VERSION: u8 = 0x06;

// Standard VIA RGB-matrix custom channel and value ids (`quantum/via.h`).
const RGB_MATRIX_CHANNEL: u8 = 3;
const RGB_MATRIX_BRIGHTNESS: u8 = 1;
const RGB_MATRIX_EFFECT: u8 = 2;
const RGB_MATRIX_EFFECT_SPEED: u8 = 3;
const RGB_MATRIX_COLOR: u8 = 4;

const MAX_MACRO_BUFFER_CHUNK: u8 = 28;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViaKeymap {
    pub layer_count: u8,
    pub keycodes: Vec<Vec<Vec<u16>>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct KeymapDimensions {
    pub layer_count: u8,
    pub rows: u8,
    pub columns: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViaMacroStep {
    pub kind: ViaMacroStepKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keycode: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub char: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ViaMacroStepKind {
    Tap,
    Down,
    Up,
    Char,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViaMacros {
    pub count: u8,
    pub buffer_size: u16,
    pub macros: Vec<Vec<ViaMacroStep>>,
}

/// Standard VIA RGB-matrix state (channel 3). `effect` is the firmware's RGB
/// matrix mode id; `hue`/`saturation` are the global colour; brightness and
/// effect speed are 0–255. VIA exposes no per-LED colour map.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViaRgbMatrixState {
    pub brightness: u8,
    pub effect: u8,
    pub effect_speed: u8,
    pub hue: u8,
    pub saturation: u8,
}

/// A bounded, read-only VIA adapter with no path for set, save, reset,
/// bootloader, or firmware commands.
pub struct ViaReadProtocol<T: HidTransport> {
    transport: T,
}

impl<T: HidTransport> ViaReadProtocol<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    pub fn read(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        if !is_read_only_via_command(command) {
            return Err(HidError::CommandNotAllowed);
        }
        if payload.len() > REPORT_LENGTH - 1 {
            return Err(HidError::InvalidRequest);
        }
        let response = self.transport.request(command, payload)?;
        if response.len() != REPORT_LENGTH || response[0] != command {
            return Err(HidError::ResponseMismatch);
        }
        Ok(response)
    }

    pub fn get_protocol_version(&mut self) -> Result<u16, HidError> {
        Ok(read_uint16(&self.read(GET_PROTOCOL_VERSION, &[])?, 1))
    }

    pub fn get_layer_count(&mut self) -> Result<u8, HidError> {
        Ok(self.read(DYNAMIC_KEYMAP_GET_LAYER_COUNT, &[])?[1])
    }

    pub fn get_keycode(&mut self, layer: u8, row: u8, column: u8) -> Result<u16, HidError> {
        let response = self.read(DYNAMIC_KEYMAP_GET_KEYCODE, &[layer, row, column])?;
        Ok((u16::from(response[4]) << 8) | u16::from(response[5]))
    }

    pub fn get_custom_value(&mut self, channel: u8, value_id: u8) -> Result<Vec<u8>, HidError> {
        let response = self.read(CUSTOM_GET_VALUE, &[channel, value_id])?;
        Ok(response[3..].to_vec())
    }

    /// Reads the global VIA RGB-matrix state (channel 3). Mirrors the
    /// TypeScript `readLighting` for the V5 Max: value id 4 is a hue/saturation
    /// pair in one response.
    pub fn read_rgb_matrix_state(&mut self) -> Result<ViaRgbMatrixState, HidError> {
        let brightness = self.get_custom_value(RGB_MATRIX_CHANNEL, RGB_MATRIX_BRIGHTNESS)?;
        let effect = self.get_custom_value(RGB_MATRIX_CHANNEL, RGB_MATRIX_EFFECT)?;
        let effect_speed = self.get_custom_value(RGB_MATRIX_CHANNEL, RGB_MATRIX_EFFECT_SPEED)?;
        let color = self.get_custom_value(RGB_MATRIX_CHANNEL, RGB_MATRIX_COLOR)?;
        Ok(ViaRgbMatrixState {
            brightness: brightness[0],
            effect: effect[0],
            effect_speed: effect_speed[0],
            hue: color[0],
            saturation: color[1],
        })
    }

    pub fn get_uptime(&mut self) -> Result<u32, HidError> {
        self.get_keyboard_uint32(KEYBOARD_VALUE_UPTIME)
    }

    pub fn get_layout_options(&mut self) -> Result<u32, HidError> {
        self.get_keyboard_uint32(KEYBOARD_VALUE_LAYOUT_OPTIONS)
    }

    pub fn get_firmware_version(&mut self) -> Result<u32, HidError> {
        self.get_keyboard_uint32(KEYBOARD_VALUE_FIRMWARE_VERSION)
    }

    pub fn get_keycodes_version(&mut self) -> Result<u32, HidError> {
        self.get_keyboard_uint32(KEYBOARD_VALUE_KEYCODES_VERSION)
    }

    pub fn get_macro_count(&mut self) -> Result<u8, HidError> {
        Ok(self.read(DYNAMIC_KEYMAP_MACRO_GET_COUNT, &[])?[1])
    }

    pub fn get_macro_buffer_size(&mut self) -> Result<u16, HidError> {
        Ok(read_uint16(
            &self.read(DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE, &[])?,
            1,
        ))
    }

    /// Reads a chunk of the macro buffer. Mirrors the TypeScript
    /// `getMacroBuffer`: the request carries a 16-bit offset and the payload
    /// bytes start at response index 4.
    pub fn get_macro_buffer(&mut self, offset: u16, size: u8) -> Result<Vec<u8>, HidError> {
        if size == 0 || size > MAX_MACRO_BUFFER_CHUNK {
            return Err(HidError::InvalidRequest);
        }
        let response = self.read(
            DYNAMIC_KEYMAP_MACRO_GET_BUFFER,
            &[(offset >> 8) as u8, (offset & 0xff) as u8, size],
        )?;
        Ok(response[4..4 + usize::from(size)].to_vec())
    }

    /// Reads and decodes every VIA macro. Mirrors the TypeScript
    /// `readViaMacros`: macros are NUL-terminated byte sequences where a key
    /// action is a prefix byte (tap/down/up) followed by one basic keycode
    /// byte, and any other byte is a literal character.
    pub fn read_via_macros(&mut self) -> Result<ViaMacros, HidError> {
        let count = self.get_macro_count()?;
        if count == 0 {
            return Ok(ViaMacros {
                count,
                buffer_size: 0,
                macros: Vec::new(),
            });
        }
        let buffer_size = self.get_macro_buffer_size()?;
        if buffer_size == 0 {
            return Ok(ViaMacros {
                count,
                buffer_size,
                macros: Vec::new(),
            });
        }

        let mut bytes = Vec::with_capacity(usize::from(buffer_size));
        let mut offset = 0u16;
        while offset < buffer_size {
            let chunk = (buffer_size - offset).min(u16::from(MAX_MACRO_BUFFER_CHUNK));
            bytes.extend(self.get_macro_buffer(offset, chunk as u8)?);
            offset += chunk;
        }

        Ok(ViaMacros {
            count,
            buffer_size,
            macros: decode_macro_buffer(&bytes, count),
        })
    }

    pub fn get_dynamic_keymap_buffer(&mut self, offset: u8, size: u8) -> Result<Vec<u8>, HidError> {
        let response = self.read(DYNAMIC_KEYMAP_GET_BUFFER, &[offset, size])?;
        Ok(response[3..].to_vec())
    }

    pub fn get_encoder_keycode(
        &mut self,
        layer: u8,
        encoder: u8,
        clockwise: bool,
    ) -> Result<u16, HidError> {
        let response = self.read(
            DYNAMIC_KEYMAP_GET_ENCODER,
            &[layer, encoder, if clockwise { 1 } else { 0 }],
        )?;
        Ok(read_uint16(&response, 4))
    }

    /// Reads a full keymap, mirroring the TypeScript `readViaKeymap`: the
    /// reported layer count must match the expected dimensions, then every
    /// keycode is read positionally.
    pub fn read_via_keymap(&mut self, dimensions: KeymapDimensions) -> Result<ViaKeymap, HidError> {
        if dimensions.rows == 0 || dimensions.columns == 0 {
            return Err(HidError::InvalidDimensions);
        }
        let reported = self.get_layer_count()?;
        if reported != dimensions.layer_count {
            return Err(HidError::LayerCountMismatch);
        }
        let mut keycodes = Vec::with_capacity(usize::from(dimensions.layer_count));
        for layer in 0..dimensions.layer_count {
            let mut layer_rows = Vec::with_capacity(usize::from(dimensions.rows));
            for row in 0..dimensions.rows {
                let mut row_keycodes = Vec::with_capacity(usize::from(dimensions.columns));
                for column in 0..dimensions.columns {
                    row_keycodes.push(self.get_keycode(layer, row, column)?);
                }
                layer_rows.push(row_keycodes);
            }
            keycodes.push(layer_rows);
        }
        Ok(ViaKeymap {
            layer_count: reported,
            keycodes,
        })
    }

    fn get_keyboard_uint32(&mut self, value_id: u8) -> Result<u32, HidError> {
        let response = self.read(GET_KEYBOARD_VALUE, &[value_id])?;
        Ok(read_uint32(&response, 2))
    }
}

fn read_uint16(response: &[u8], offset: usize) -> u16 {
    u16::from_be_bytes([response[offset], response[offset + 1]])
}

fn read_uint32(response: &[u8], offset: usize) -> u32 {
    u32::from_be_bytes([
        response[offset],
        response[offset + 1],
        response[offset + 2],
        response[offset + 3],
    ])
}

const MACRO_ACTION_TAP: u8 = 0x01;
const MACRO_ACTION_DOWN: u8 = 0x02;
const MACRO_ACTION_UP: u8 = 0x03;

fn decode_macro_buffer(bytes: &[u8], count: u8) -> Vec<Vec<ViaMacroStep>> {
    let mut macros: Vec<Vec<ViaMacroStep>> = Vec::new();
    let mut current: Vec<ViaMacroStep> = Vec::new();
    let mut index = 0usize;
    while index < bytes.len() {
        let byte = bytes[index];
        if byte == 0 {
            if !current.is_empty() {
                macros.push(std::mem::take(&mut current));
            }
            if macros.len() >= usize::from(count) {
                break;
            }
            index += 1;
            continue;
        }
        match byte {
            MACRO_ACTION_TAP | MACRO_ACTION_DOWN | MACRO_ACTION_UP => {
                let Some(&keycode) = bytes.get(index + 1) else {
                    break;
                };
                let kind = if byte == MACRO_ACTION_TAP {
                    ViaMacroStepKind::Tap
                } else if byte == MACRO_ACTION_DOWN {
                    ViaMacroStepKind::Down
                } else {
                    ViaMacroStepKind::Up
                };
                current.push(ViaMacroStep {
                    kind,
                    keycode: Some(u16::from(keycode)),
                    char: None,
                });
                index += 2;
            }
            _ => {
                current.push(ViaMacroStep {
                    kind: ViaMacroStepKind::Char,
                    keycode: None,
                    char: Some((byte as char).to_string()),
                });
                index += 1;
            }
        }
    }
    if !current.is_empty() {
        macros.push(current);
    }
    macros
}
