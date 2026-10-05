//! Gated VIA write commands. Every frame is checked against the explicit
//! write allow-list; nothing else is emitted. Higher layers enforce operator
//! consent and target validation before any call reaches this module.

use crate::allowlist::is_via_write_command;
use crate::transport::{HidError, HidTransport, REPORT_LENGTH};

const SET_KEYCODE: u8 = 0x05;
const SET_CUSTOM_VALUE: u8 = 0x07;
const SAVE_EEPROM: u8 = 0x09;

/// Standard VIA RGB-matrix custom channel and value ids (`quantum/via.h`).
const RGB_MATRIX_CHANNEL: u8 = 3;
const RGB_MATRIX_BRIGHTNESS: u8 = 1;
const RGB_MATRIX_EFFECT: u8 = 2;
const RGB_MATRIX_EFFECT_SPEED: u8 = 3;
const RGB_MATRIX_COLOR: u8 = 4;

/// The global RGB-matrix lighting state. `effect` is omitted when unknown, so
/// the device keeps its current mode instead of being switched to mode 0 (off).
#[derive(Debug, Clone, Copy)]
pub struct RgbMatrixLighting {
    pub brightness: u8,
    pub effect_speed: u8,
    pub hue: u8,
    pub saturation: u8,
    pub effect: Option<u8>,
}

pub struct ViaWriteProtocol<T: HidTransport> {
    transport: T,
}

impl<T: HidTransport> ViaWriteProtocol<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    /// Sets a keycode on the live dynamic keymap. QMK persists keycodes to
    /// EEPROM immediately (`dynamic_keymap_set_keycode`); there is no separate
    /// keymap-save command.
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

    /// Sets a VIA custom channel value (`id_custom_set_value`, `0x07`), framed
    /// as `[command, channel, value_id, ...data]`. This is the same frame VIA's
    /// own configurator emits for lighting; the change is volatile until
    /// [`save_rgb_matrix_eeprom`](Self::save_rgb_matrix_eeprom).
    pub fn set_custom_value(
        &mut self,
        channel: u8,
        value_id: u8,
        data: &[u8],
    ) -> Result<(), HidError> {
        let mut payload = Vec::with_capacity(data.len() + 2);
        payload.push(channel);
        payload.push(value_id);
        payload.extend_from_slice(data);
        self.write(SET_CUSTOM_VALUE, &payload)
    }

    /// Global RGB-matrix colour as VIA hue/saturation bytes.
    pub fn set_rgb_matrix_color(&mut self, hue: u8, saturation: u8) -> Result<(), HidError> {
        self.set_custom_value(RGB_MATRIX_CHANNEL, RGB_MATRIX_COLOR, &[hue, saturation])
    }

    /// Writes the global RGB-matrix lighting state (brightness, optional effect,
    /// effect speed, colour), mirroring the TypeScript `writeRgbMatrix`. The
    /// change is volatile until [`save_rgb_matrix_eeprom`](Self::save_rgb_matrix_eeprom).
    pub fn set_rgb_matrix_lighting(&mut self, state: RgbMatrixLighting) -> Result<(), HidError> {
        self.set_custom_value(
            RGB_MATRIX_CHANNEL,
            RGB_MATRIX_BRIGHTNESS,
            &[state.brightness],
        )?;
        if let Some(effect) = state.effect {
            self.set_custom_value(RGB_MATRIX_CHANNEL, RGB_MATRIX_EFFECT, &[effect])?;
        }
        self.set_custom_value(
            RGB_MATRIX_CHANNEL,
            RGB_MATRIX_EFFECT_SPEED,
            &[state.effect_speed],
        )?;
        self.set_rgb_matrix_color(state.hue, state.saturation)
    }

    /// Persists the RGB-matrix lighting state to EEPROM. `id_custom_save`
    /// (`0x09`) routes on the channel byte, so the RGB-matrix channel must be
    /// present or the frame is dropped before it reaches the lighting handler.
    /// A separate, operator-confirmed step.
    pub fn save_rgb_matrix_eeprom(&mut self) -> Result<(), HidError> {
        self.write(SAVE_EEPROM, &[RGB_MATRIX_CHANNEL, 0, 0])
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
