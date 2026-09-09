//! Gated VIA write commands. Every frame is checked against the explicit
//! write allow-list; nothing else is emitted. Higher layers enforce operator
//! consent and target validation before any call reaches this module.

use crate::allowlist::is_via_write_command;
use crate::transport::{HidError, HidTransport, REPORT_LENGTH};

const SET_KEYCODE: u8 = 0x05;
const SAVE_EEPROM: u8 = 0x09;

pub struct ViaWriteProtocol<T: HidTransport> {
    transport: T,
}

impl<T: HidTransport> ViaWriteProtocol<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    /// Sets a keycode on the live dynamic keymap (volatile until saved).
    pub fn set_keycode(
        &mut self,
        layer: u8,
        row: u8,
        col: u8,
        keycode: u16,
    ) -> Result<(), HidError> {
        self.write(
            SET_KEYCODE,
            &[
                layer,
                row,
                col,
                (keycode >> 8) as u8,
                (keycode & 0xff) as u8,
            ],
        )
    }

    /// Persists the live keymap to EEPROM. A separate, operator-confirmed step.
    pub fn save_eeprom(&mut self) -> Result<(), HidError> {
        self.write(SAVE_EEPROM, &[])
    }

    fn write(&mut self, command: u8, payload: &[u8]) -> Result<(), HidError> {
        if !is_via_write_command(command) {
            return Err(HidError::CommandNotAllowed);
        }
        if payload.len() > REPORT_LENGTH - 1 {
            return Err(HidError::InvalidRequest);
        }
        let response = self.transport.request(command, payload)?;
        if response.len() != REPORT_LENGTH || response[0] != command {
            return Err(HidError::ResponseMismatch);
        }
        Ok(())
    }
}
