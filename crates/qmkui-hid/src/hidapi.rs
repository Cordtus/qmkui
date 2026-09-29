//! Native hidapi transport, enabled by the `hidapi-transport` feature.
//!
//! Opens a device by VID/PID and performs the bounded request/response
//! round-trip. Read-only: it only writes the read-command report frames built
//! by the protocol modules; there is no generic write API.

#![cfg(feature = "hidapi-transport")]

use crate::transport::{HidError, HidTransport, REPORT_LENGTH};
use hidapi::HidApi;
use std::time::{Duration, Instant};

pub struct HidApiTransport {
    device: hidapi::HidDevice,
    timeout: Duration,
}

impl HidApiTransport {
    pub fn open(vendor_id: u16, product_id: u16) -> Result<Self, HidError> {
        Self::open_with_timeout(vendor_id, product_id, Duration::from_millis(1_000))
    }

    /// Opens the VIA raw-HID interface (usage page `0xFF60`, usage `0x0061`)
    /// for the given VID/PID. A keyboard exposes several HID interfaces under
    /// the same IDs; opening the first one (a keyboard/consumer interface)
    /// silently swallows vendor reports, so the interface must be selected by
    /// usage.
    pub fn open_with_timeout(
        vendor_id: u16,
        product_id: u16,
        timeout: Duration,
    ) -> Result<Self, HidError> {
        const VIA_USAGE_PAGE: u16 = 0xff60;
        const VIA_USAGE: u16 = 0x0061;

        let api = HidApi::new().map_err(|error| HidError::Transport(error.to_string()))?;
        let info = api
            .device_list()
            .find(|info| {
                info.vendor_id() == vendor_id
                    && info.product_id() == product_id
                    && info.usage_page() == VIA_USAGE_PAGE
                    && info.usage() == VIA_USAGE
            })
            .ok_or_else(|| {
                HidError::Transport(format!(
                    "no VIA raw-HID interface (usage page 0x{VIA_USAGE_PAGE:04x}) for {vendor_id:04x}:{product_id:04x}"
                ))
            })?;
        let device = api
            .open_path(info.path())
            .map_err(|error| HidError::Transport(error.to_string()))?;
        device
            .set_blocking_mode(false)
            .map_err(|error| HidError::Transport(error.to_string()))?;
        Ok(Self { device, timeout })
    }
}

impl HidTransport for HidApiTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let report = crate::transport::build_report(command, payload);
        let written = self
            .device
            .write(&report)
            .map_err(|error| HidError::Transport(error.to_string()))?;
        if written != REPORT_LENGTH {
            return Err(HidError::Transport(format!(
                "short write: {written} of {REPORT_LENGTH}"
            )));
        }

        let deadline = Instant::now() + self.timeout;
        let mut buffer = [0u8; REPORT_LENGTH];
        while Instant::now() < deadline {
            match self.device.read(&mut buffer) {
                Ok(received)
                    if received == REPORT_LENGTH && matches_response(&buffer, command, payload) =>
                {
                    return Ok(buffer.to_vec());
                }
                // Non-blocking reads return 0 bytes or a timeout-like error when
                // no report is ready yet; keep polling until the deadline.
                Ok(_) => continue,
                Err(error) if error.to_string().to_lowercase().contains("timeout") => continue,
                Err(error) => return Err(HidError::Transport(error.to_string())),
            }
        }
        Err(HidError::Timeout)
    }
}

fn matches_response(response: &[u8], command: u8, payload: &[u8]) -> bool {
    // Standard VIA and Keychron identity/capability frames echo the command
    // byte. Custom-get-value frames additionally echo channel and value id.
    if response[0] != command {
        return false;
    }
    if command == 0x08 {
        return payload.first() == response.get(1) && payload.get(1) == response.get(2);
    }
    true
}
