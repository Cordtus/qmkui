//! Keychron V5 Max read commands, mirroring `keychronV5MaxReader.ts`. Identity,
//! capabilities, and lighting reads are Keychron vendor commands (`0xa0`-`0xa8`)
//! gated by the shared allow-list; the keymap read uses the standard VIA
//! commands.

use crate::allowlist::{is_read_only_keychron_command, is_read_only_rgb_op};
use crate::transport::{HidError, HidTransport, REPORT_LENGTH};
use crate::via::{KeymapDimensions, ViaKeymap};

const COMMAND_IDENTITY_PROTOCOL: u8 = 0xa0;
const COMMAND_IDENTITY_FIRMWARE: u8 = 0xa1;
const COMMAND_CAPABILITIES: u8 = 0xa2;
const COMMAND_DEFAULT_LAYER: u8 = 0xa3;
const COMMAND_RGB: u8 = 0xa8;
const RGB_OP_PROTOCOL: u8 = 0x01;
const RGB_OP_INDICATORS: u8 = 0x03;
const RGB_OP_LED_COUNT: u8 = 0x05;
const RGB_OP_LED_INDEX: u8 = 0x06;
const RGB_OP_LED_EFFECT: u8 = 0x07;
const RGB_OP_COLORS: u8 = 0x09;

const DYNAMIC_KEYMAP_GET_KEYCODE: u8 = 0x04;
const DYNAMIC_KEYMAP_GET_LAYER_COUNT: u8 = 0x11;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V5Identity {
    pub protocol_version: [u8; 3],
    pub firmware_version: String,
    pub default_layer: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V5Capabilities {
    pub feature_bitmap: [u8; 2],
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedIndex {
    pub led: u8,
    pub row: u8,
    pub column: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedColor {
    pub led: u8,
    pub hue: u8,
    pub saturation: u8,
    pub value: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedEffect {
    pub led: u8,
    pub effect: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct V5Lighting {
    pub rgb_protocol: [u8; 2],
    pub indicators: u8,
    pub led_count: u8,
    pub led_indices: Vec<LedIndex>,
    pub effects: Vec<LedEffect>,
    pub colors: Vec<LedColor>,
}

pub struct KeychronV5Reader<T: HidTransport> {
    transport: T,
}

impl<T: HidTransport> KeychronV5Reader<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    pub fn read(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        if !is_read_only_keychron_command(command) {
            return Err(HidError::CommandNotAllowed);
        }
        if command == COMMAND_RGB && (payload.is_empty() || !is_read_only_rgb_op(payload[0])) {
            return Err(HidError::CommandNotAllowed);
        }
        let response = self.transport.request(command, payload)?;
        if response.len() != REPORT_LENGTH || response[0] != command {
            return Err(HidError::ResponseMismatch);
        }
        Ok(response)
    }

    pub fn read_identity(&mut self) -> Result<V5Identity, HidError> {
        let protocol = self.read(COMMAND_IDENTITY_PROTOCOL, &[])?;
        let firmware = self.read(COMMAND_IDENTITY_FIRMWARE, &[])?;
        let default_layer = self.read(COMMAND_DEFAULT_LAYER, &[])?;
        Ok(V5Identity {
            protocol_version: [protocol[1], protocol[2], protocol[3]],
            firmware_version: decode_firmware(&firmware).ok_or(HidError::InvalidRequest)?,
            default_layer: default_layer[1],
        })
    }

    pub fn read_capabilities(&mut self) -> Result<V5Capabilities, HidError> {
        let response = self.read(COMMAND_CAPABILITIES, &[])?;
        Ok(V5Capabilities {
            feature_bitmap: [response[1], response[2]],
        })
    }

    pub fn rgb_protocol(&mut self) -> Result<[u8; 2], HidError> {
        let response = self.read(COMMAND_RGB, &[RGB_OP_PROTOCOL])?;
        Ok([response[2], response[3]])
    }

    pub fn rgb_indicators(&mut self) -> Result<u8, HidError> {
        let response = self.read(COMMAND_RGB, &[RGB_OP_INDICATORS])?;
        Ok(response[2])
    }

    pub fn led_count(&mut self) -> Result<u8, HidError> {
        let response = self.read(COMMAND_RGB, &[RGB_OP_LED_COUNT])?;
        Ok(response[2])
    }

    pub fn led_index(&mut self, led: u8) -> Result<LedIndex, HidError> {
        let response = self.read(COMMAND_RGB, &[RGB_OP_LED_INDEX, led])?;
        Ok(LedIndex {
            led,
            row: response[3],
            column: response[4],
        })
    }

    pub fn led_effect(&mut self, led: u8) -> Result<u8, HidError> {
        let response = self.read(COMMAND_RGB, &[RGB_OP_LED_EFFECT, led])?;
        Ok(response[3])
    }

    pub fn led_colors(&mut self, start: u8, count: u8) -> Result<Vec<LedColor>, HidError> {
        let response = self.read(COMMAND_RGB, &[RGB_OP_COLORS, start, count])?;
        if response[3] != count {
            return Err(HidError::InvalidRequest);
        }
        let mut colors = Vec::with_capacity(usize::from(count));
        for offset in 0..count {
            let byte_offset = 4 + usize::from(offset) * 3;
            colors.push(LedColor {
                led: start + offset,
                hue: response[byte_offset],
                saturation: response[byte_offset + 1],
                value: response[byte_offset + 2],
            });
        }
        Ok(colors)
    }

    pub fn read_lighting(&mut self) -> Result<V5Lighting, HidError> {
        let rgb_protocol = self.rgb_protocol()?;
        let indicators = self.rgb_indicators()?;
        let led_count = self.led_count()?;
        let mut led_indices = Vec::with_capacity(usize::from(led_count));
        let mut effects = Vec::with_capacity(usize::from(led_count));
        for led in 0..led_count {
            led_indices.push(self.led_index(led)?);
            effects.push(LedEffect {
                led,
                effect: self.led_effect(led)?,
            });
        }
        let mut colors = Vec::new();
        let mut start = 0u8;
        while start < led_count {
            let batch = (led_count - start).min(9);
            colors.extend(self.led_colors(start, batch)?);
            start += batch;
        }
        Ok(V5Lighting {
            rgb_protocol,
            indicators,
            led_count,
            led_indices,
            effects,
            colors,
        })
    }

    /// Reads the full keymap via the standard VIA commands, mirroring the
    /// TypeScript `readViaKeymap`.
    pub fn read_via_keymap(&mut self, dimensions: KeymapDimensions) -> Result<ViaKeymap, HidError> {
        if dimensions.rows == 0 || dimensions.columns == 0 {
            return Err(HidError::InvalidDimensions);
        }
        let reported = self.via_layer_count()?;
        if reported != dimensions.layer_count {
            return Err(HidError::LayerCountMismatch);
        }
        let mut keycodes = Vec::with_capacity(usize::from(dimensions.layer_count));
        for layer in 0..dimensions.layer_count {
            let mut layer_rows = Vec::with_capacity(usize::from(dimensions.rows));
            for row in 0..dimensions.rows {
                let mut row_keycodes = Vec::with_capacity(usize::from(dimensions.columns));
                for column in 0..dimensions.columns {
                    row_keycodes.push(self.via_keycode(layer, row, column)?);
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

    fn via_layer_count(&mut self) -> Result<u8, HidError> {
        let response = self
            .transport
            .request(DYNAMIC_KEYMAP_GET_LAYER_COUNT, &[])?;
        if response.len() != REPORT_LENGTH || response[0] != DYNAMIC_KEYMAP_GET_LAYER_COUNT {
            return Err(HidError::ResponseMismatch);
        }
        Ok(response[1])
    }

    pub fn via_keycode(&mut self, layer: u8, row: u8, column: u8) -> Result<u16, HidError> {
        let response = self
            .transport
            .request(DYNAMIC_KEYMAP_GET_KEYCODE, &[layer, row, column])?;
        if response.len() != REPORT_LENGTH || response[0] != DYNAMIC_KEYMAP_GET_KEYCODE {
            return Err(HidError::ResponseMismatch);
        }
        Ok((u16::from(response[4]) << 8) | u16::from(response[5]))
    }
}

fn decode_firmware(response: &[u8]) -> Option<String> {
    let mut bytes = Vec::new();
    for value in response.iter().skip(1) {
        if *value == 0 {
            break;
        }
        if !(0x20..=0x7e).contains(value) {
            return None;
        }
        bytes.push(*value);
    }
    if bytes.is_empty() {
        return None;
    }
    String::from_utf8(bytes).ok()
}
