//! Keychron V5 Max read commands, mirroring `keychronV5MaxReader.ts`. Only
//! identity and capabilities are Keychron vendor commands (`0xa0`-`0xa3`) gated
//! by the shared allow-list. Lighting and the keymap use the standard VIA
//! commands (`via.rs`): the never-implemented `0xa8` RGB protocol is not in the
//! allow-list and cannot be emitted.

use crate::allowlist::is_read_only_keychron_command;
use crate::transport::{HidError, HidTransport, REPORT_LENGTH};

const COMMAND_IDENTITY_PROTOCOL: u8 = 0xa0;
const COMMAND_IDENTITY_FIRMWARE: u8 = 0xa1;
const COMMAND_CAPABILITIES: u8 = 0xa2;
const COMMAND_DEFAULT_LAYER: u8 = 0xa3;

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
