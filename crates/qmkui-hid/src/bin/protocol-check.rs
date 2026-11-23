//! `protocol-check` — validates the shared protocol fixtures and exercises the
//! Rust VIA/Keychron encoders/decoders against them. Read-only: the write path
//! is replayed into a recording transport, never a device.
//!
//! Usage:
//!   cargo run -p qmkui-hid --bin protocol-check -- [fixtures-dir]

use qmkui_hid::keychron_v5::KeychronV5Reader;
use qmkui_hid::transport::{HidError, HidTransport, REPORT_LENGTH};
use qmkui_hid::via::{KeymapDimensions, ViaReadProtocol};
use qmkui_hid::via_write::{RgbMatrixLighting, ViaWriteProtocol};
use qmkui_hid::{allowlist_snapshot, is_read_only_keychron_command, is_read_only_via_command};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

fn main() {
    let dir = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("fixtures/protocol"));
    match run(&dir) {
        Ok(summary) => println!("{summary}"),
        Err(error) => {
            eprintln!("protocol-check: {error}");
            std::process::exit(1);
        }
    }
}

fn run(dir: &Path) -> Result<String, Box<dyn std::error::Error>> {
    let read_rules: Value = read_json_file(dir, "read-only-commands.json")?;
    let write_rules: Value = read_json_file(dir, "write-commands.json")?;
    let expected = allowlist_snapshot();
    let read_commands = commands(&read_rules, "viaReadCommands");
    let keychron_commands = commands(&read_rules, "keychronReadCommands");
    let write_commands = commands(&write_rules, "viaWriteCommands");

    if read_commands != expected.via_read_commands {
        return Err("viaReadCommands does not match the embedded allow-list".into());
    }
    if keychron_commands != expected.keychron_read_commands {
        return Err("keychronReadCommands does not match the embedded allow-list".into());
    }
    if write_commands != expected.via_write_commands {
        return Err("viaWriteCommands does not match the embedded allow-list".into());
    }

    let mut vectors = 0;
    for file in ["via-commands.json", "v5-keymap.json", "v5-lighting.json"] {
        for entry in read_vectors(dir, file)? {
            let command = validate_vector(&entry)?;
            if !is_read_only_via_command(command) {
                return Err(
                    format!("{file}: command {command:#04x} is not an allowed read").into(),
                );
            }
            vectors += 1;
        }
    }
    for entry in read_vectors(dir, "v5-identity.json")? {
        let request = bytes(&entry, "request")?;
        if request.is_empty() || !is_read_only_keychron_command(request[0]) {
            return Err("v5-identity.json: request is not an allowed Keychron read".into());
        }
        validate_vector(&entry)?;
        vectors += 1;
    }

    let mut via = ViaReadProtocol::new(VectorTransport::from_dir(dir, "via-commands.json")?);
    if via.get_protocol_version()? != 12 || via.get_layer_count()? != 4 {
        return Err("via-commands.json: protocol/layer decode mismatch".into());
    }
    if via.get_keycode(0, 0, 0)? != 0x1234 {
        return Err("via-commands.json: keycode decode mismatch".into());
    }

    let mut reader = KeychronV5Reader::new(VectorTransport::from_dir(dir, "v5-identity.json")?);
    let identity = reader.read_identity()?;
    if identity.protocol_version != [2, 0, 2] || identity.firmware_version != "v1.0.0" {
        return Err("v5-identity.json: identity decode mismatch".into());
    }
    let mut reader = KeychronV5Reader::new(VectorTransport::from_dir(dir, "v5-identity.json")?);
    if reader.read_capabilities()?.feature_bitmap != [0x00, 0x81] {
        return Err("v5-identity.json: capabilities decode mismatch".into());
    }

    let mut via = ViaReadProtocol::new(VectorTransport::from_dir(dir, "v5-keymap.json")?);
    if via.get_keycode(2, 0, 15)? != 0x0046 {
        return Err("v5-keymap.json: keycode decode mismatch".into());
    }

    let mut via = ViaReadProtocol::new(VectorTransport::from_dir(dir, "v5-lighting.json")?);
    let lighting = via.read_rgb_matrix_state()?;
    if lighting.brightness != 255 || lighting.hue != 113 || lighting.saturation != 221 {
        return Err("v5-lighting.json: RGB state decode mismatch".into());
    }
    let mut keymap = ViaReadProtocol::new(SequentialTransport { next: 1 });
    let keymap = keymap.read_via_keymap(KeymapDimensions {
        layer_count: 1,
        rows: 1,
        columns: 3,
    })?;
    if keymap.keycodes[0][0] != [1, 2, 3] {
        return Err("sequential keymap decode mismatch".into());
    }

    let mut writes = RecordingTransport::default();
    let mut writer = ViaWriteProtocol::new(&mut writes);
    writer.set_keycode(0, 0, 0, 0x0046)?;
    writer.set_rgb_matrix_lighting(RgbMatrixLighting {
        brightness: 180,
        effect_speed: 128,
        hue: 10,
        saturation: 20,
        effect: Some(1),
    })?;
    writer.save_rgb_matrix_eeprom()?;
    for frame in &writes.frames {
        if !is_read_only_via_command(frame[0]) && !expected.via_write_commands.contains(&frame[0]) {
            return Err(format!("write frame {:#04x} is not allowed", frame[0]).into());
        }
    }

    Ok(serde_json::json!({
        "status": "ok",
        "vectors": vectors,
        "viaReadCommands": read_commands,
        "keychronReadCommands": keychron_commands,
        "viaWriteCommands": write_commands,
        "writeFrames": writes.frames.len(),
    })
    .to_string())
}

fn validate_vector(entry: &Value) -> Result<u8, Box<dyn std::error::Error>> {
    let request = bytes(entry, "request")?;
    let response = bytes(entry, "response")?;
    if request.len() != REPORT_LENGTH || response.len() != REPORT_LENGTH {
        return Err("vector is not 32 bytes".into());
    }
    if request[0] != response[0] {
        return Err("request and response command differ".into());
    }
    Ok(request[0])
}

fn read_json_file(dir: &Path, name: &str) -> Result<Value, Box<dyn std::error::Error>> {
    let text = std::fs::read_to_string(dir.join(name))?;
    Ok(serde_json::from_str(&text)?)
}

fn read_vectors(dir: &Path, name: &str) -> Result<Vec<Value>, Box<dyn std::error::Error>> {
    let value = read_json_file(dir, name)?;
    value
        .as_array()
        .cloned()
        .ok_or_else(|| format!("{name} is not an array").into())
}

fn commands(value: &Value, key: &str) -> Vec<u8> {
    value[key]
        .as_object()
        .map(|entries| {
            let mut commands: Vec<u8> = entries
                .values()
                .filter_map(Value::as_u64)
                .map(|command| command as u8)
                .collect();
            commands.sort_unstable();
            commands.dedup();
            commands
        })
        .unwrap_or_default()
}

fn bytes(value: &Value, key: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    value[key]
        .as_array()
        .ok_or_else(|| format!("{key} is not an array"))?
        .iter()
        .map(|byte| {
            byte.as_u64()
                .filter(|byte| *byte <= 0xff)
                .map(|byte| byte as u8)
                .ok_or_else(|| "vector byte is out of range".into())
        })
        .collect()
}

struct VectorTransport {
    by_request: BTreeMap<Vec<u8>, Vec<u8>>,
}

impl VectorTransport {
    fn from_dir(dir: &Path, name: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut by_request = BTreeMap::new();
        for entry in read_vectors(dir, name)? {
            by_request.insert(bytes(&entry, "request")?, bytes(&entry, "response")?);
        }
        Ok(Self { by_request })
    }
}

impl HidTransport for VectorTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut request = vec![0u8; REPORT_LENGTH];
        request[0] = command;
        request[1..1 + payload.len()].copy_from_slice(payload);
        self.by_request
            .get(&request)
            .cloned()
            .ok_or(HidError::ResponseMismatch)
    }
}

#[derive(Default)]
struct SequentialTransport {
    next: u16,
}

impl HidTransport for SequentialTransport {
    fn request(&mut self, command: u8, _payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut report = vec![0u8; REPORT_LENGTH];
        report[0] = command;
        match command {
            0x11 => report[1] = 1,
            0x04 => {
                let keycode = self.next;
                self.next += 1;
                report[4] = (keycode >> 8) as u8;
                report[5] = (keycode & 0xff) as u8;
            }
            _ => return Err(HidError::ResponseMismatch),
        }
        Ok(report)
    }
}

#[derive(Default)]
struct RecordingTransport {
    frames: Vec<Vec<u8>>,
}

impl HidTransport for RecordingTransport {
    fn request(&mut self, command: u8, payload: &[u8]) -> Result<Vec<u8>, HidError> {
        let mut frame = vec![0u8; REPORT_LENGTH];
        frame[0] = command;
        frame[1..1 + payload.len()].copy_from_slice(payload);
        self.frames.push(frame.clone());
        Ok(frame)
    }
}
