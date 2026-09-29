use thiserror::Error;

pub const VIA_REPORT_ID: u8 = 0;
pub const REPORT_LENGTH: usize = 32;

#[derive(Debug, Error)]
pub enum HidError {
    #[error("requested command is not in the read-only allow-list")]
    CommandNotAllowed,
    #[error("request payload is invalid")]
    InvalidRequest,
    #[error("keymap dimensions are invalid")]
    InvalidDimensions,
    #[error("reported layer count does not match the expected dimensions")]
    LayerCountMismatch,
    #[error("no matching response within the timeout")]
    Timeout,
    #[error("transport failure: {0}")]
    Transport(String),
    #[error("response did not match the request")]
    ResponseMismatch,
}

/// A bounded, read-only HID request/response primitive. Implementations
/// perform the actual report I/O; native hidapi and the test mock both satisfy
/// this shape.
pub trait HidTransport {
    /// Sends a `command` with `payload` and returns the full matching report.
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError>;
}

/// Builds the 32-byte VIA report frame for a command and payload.
pub fn build_report(command: u8, payload: &[u8]) -> Vec<u8> {
    let mut report = vec![0u8; REPORT_LENGTH];
    report[0] = command;
    let payload = &payload[..payload.len().min(REPORT_LENGTH - 1)];
    report[1..1 + payload.len()].copy_from_slice(payload);
    report
}
