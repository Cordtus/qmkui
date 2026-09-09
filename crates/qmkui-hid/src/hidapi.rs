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

    pub fn open_with_timeout(
        vendor_id: u16,
        product_id: u16,
        timeout: Duration,
    ) -> Result<Self, HidError> {
        let api = HidApi::new().map_err(|error| HidError::Transport(error.to_string()))?;
        let device = api
            .open(vendor_id, product_id)
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
    if response[0] != command {
        return false;
    }
    // Keychron RGB commands echo their operation byte.
    if command == 0xa8 {
        return payload.first() == Some(&response[1]);
    }
    true
}
