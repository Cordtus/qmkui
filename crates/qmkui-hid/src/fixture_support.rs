//! Shared fixture transports for the conformance tests and `protocol-check`.
//! These are test-support types, not part of the read/write device path.

use crate::transport::{build_report, HidError, HidTransport, REPORT_LENGTH};
use serde_json::Value;
use std::cell::{Cell, RefCell};
use std::collections::BTreeMap;
use std::path::Path;
use std::rc::Rc;

/// Serves fixture responses keyed by the full 32-byte request frame.
pub struct VectorTransport {
    by_request: BTreeMap<Vec<u8>, Vec<u8>>,
}

impl VectorTransport {
    pub fn from_path(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let text = std::fs::read_to_string(path)?;
        let entries: Value = serde_json::from_str(&text)?;
        let entries = entries
            .as_array()
            .ok_or_else(|| format!("{} is not an array", path.display()))?;
        let mut by_request = BTreeMap::new();
        for entry in entries {
            by_request.insert(bytes(entry, "request")?, bytes(entry, "response")?);
        }
        Ok(Self { by_request })
    }

    pub fn from_dir(dir: &Path, name: &str) -> Result<Self, Box<dyn std::error::Error>> {
        Self::from_path(&dir.join(name))
    }

    pub fn from_manifest_fixture(name: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/protocol")
            .join(name);
        Self::from_path(&path)
    }
}

impl HidTransport for VectorTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let request = build_report(command, payload);
        self.by_request
            .get(&request)
            .cloned()
            .ok_or(HidError::ResponseMismatch)
    }
}

/// Serves one layer and incrementing keycodes for keymap traversal tests.
pub struct SequentialTransport {
    next: Cell<u16>,
}

impl SequentialTransport {
    pub fn new() -> Self {
        Self { next: Cell::new(1) }
    }
}

impl Default for SequentialTransport {
    fn default() -> Self {
        Self::new()
    }
}

impl HidTransport for SequentialTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut report = vec![0u8; REPORT_LENGTH];
        report[0] = command;
        report[1..1 + payload.len()].copy_from_slice(payload);
        match command {
            0x11 => report[1] = 1,
            0x04 => {
                let keycode = self.next.get();
                self.next.set(keycode + 1);
                report[4] = (keycode >> 8) as u8;
                report[5] = (keycode & 0xff) as u8;
            }
            _ => return Err(HidError::ResponseMismatch),
        }
        Ok(report)
    }
}

/// Echoes requests and records every frame for write assertions.
#[derive(Clone, Default)]
pub struct RecordingTransport {
    pub frames: Rc<RefCell<Vec<Vec<u8>>>>,
}

impl RecordingTransport {
    pub fn new() -> Self {
        Self::default()
    }
}

impl HidTransport for RecordingTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let frame = build_report(command, payload);
        self.frames.borrow_mut().push(frame.clone());
        Ok(frame)
    }
}

fn bytes(value: &Value, key: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    value
        .get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| format!("vector {key} is not an array"))?
        .iter()
        .map(|byte| {
            byte.as_u64()
                .filter(|byte| *byte <= 0xff)
                .map(|byte| byte as u8)
                .ok_or_else(|| format!("vector {key} byte is out of range").into())
        })
        .collect()
}
