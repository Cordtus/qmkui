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

    pub fn get_macro_buffer(&mut self, offset: u8, size: u8) -> Result<Vec<u8>, HidError> {
        let response = self.read(DYNAMIC_KEYMAP_MACRO_GET_BUFFER, &[offset, size])?;
        Ok(response[3..].to_vec())
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
    (u16::from(response[offset]) << 8) | u16::from(response[offset + 1])
}

fn read_uint32(response: &[u8], offset: usize) -> u32 {
    (u32::from(response[offset]) * 0x100_0000)
        + (u32::from(response[offset + 1]) * 0x1_0000)
        + (u32::from(response[offset + 2]) * 0x100)
        + u32::from(response[offset + 3])
}
