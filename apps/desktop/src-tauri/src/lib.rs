use qmkui_hid::hidapi::HidApiTransport;
use qmkui_hid::keychron_v5::KeychronV5Reader;
use qmkui_hid::via::{KeymapDimensions, ViaReadProtocol};
use qmkui_hid::via_write::ViaWriteProtocol;
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

mod projects;

use projects::{ProjectStore, ProjectSummary};

/// Operator-controlled write gate. Writes are only possible after the UI
/// explicitly enables them (a confirmed action); every write command checks it.
struct WriteGate(Mutex<bool>);

impl WriteGate {
    fn is_enabled(&self) -> bool {
        *self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

const VENDOR_ID: u16 = 0x3434;
const PRODUCT_ID: u16 = 0x0950;
const V5_DIMENSIONS: KeymapDimensions = KeymapDimensions {
    layer_count: 4,
    rows: 6,
    columns: 19,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceInfo {
    vendor_id: u16,
    product_id: u16,
    product_string: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct V5Snapshot {
    identity: qmkui_hid::keychron_v5::V5Identity,
    capabilities: qmkui_hid::keychron_v5::V5Capabilities,
    lighting: qmkui_hid::keychron_v5::V5Lighting,
    keymap: qmkui_hid::via::ViaKeymap,
}

/// Lists connected devices matching supported keyboards. Read-only: only
/// descriptor identity is reported.
#[tauri::command]
fn list_devices() -> Vec<DeviceInfo> {
    use hidapi::HidApi;
    let api = match HidApi::new() {
        Ok(api) => api,
        Err(_) => return Vec::new(),
    };
    api.device_list()
        .filter(|device| device.vendor_id() == VENDOR_ID && device.product_id() == PRODUCT_ID)
        .map(|device| DeviceInfo {
            vendor_id: device.vendor_id(),
            product_id: device.product_id(),
            product_string: device.product_string().map(str::to_owned),
        })
        .collect()
}

/// Reads a full read-only snapshot from the Keychron V5 Max.
#[tauri::command]
fn read_v5_snapshot() -> Result<V5Snapshot, String> {
    let transport = HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut reader = KeychronV5Reader::new(transport);
    let identity = reader.read_identity().map_err(|error| error.to_string())?;
    let capabilities = reader.read_capabilities().map_err(|error| error.to_string())?;
    let lighting = reader.read_lighting().map_err(|error| error.to_string())?;
    let keymap = reader
        .read_via_keymap(V5_DIMENSIONS)
        .map_err(|error| error.to_string())?;
    Ok(V5Snapshot {
        identity,
        capabilities,
        lighting,
        keymap,
    })
}

/// Verifies the VIA protocol version. Sends only the standard read command.
#[tauri::command]
fn verify_protocol() -> Result<u16, String> {
    let transport = HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut via = ViaReadProtocol::new(transport);
    via.get_protocol_version().map_err(|error| error.to_string())
}

#[tauri::command]
fn save_project(store: State<ProjectStore>, id: String, project_json: String) -> Result<(), String> {
    store
        .save(&id, &project_json)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_project(store: State<ProjectStore>, id: String) -> Result<Option<String>, String> {
    store.load(&id).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_projects(store: State<ProjectStore>) -> Vec<ProjectSummary> {
    store.list()
}

#[tauri::command]
fn remove_project(store: State<ProjectStore>, id: String) -> Result<bool, String> {
    store.remove(&id).map_err(|error| error.to_string())
}

/// Enables the write gate. Call only after the operator confirms the intent.
#[tauri::command]
fn enable_device_writes(gate: State<WriteGate>) {
    *gate
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = true;
}

fn require_write_gate(gate: &WriteGate) -> Result<(), String> {
    if gate.is_enabled() {
        Ok(())
    } else {
        Err("Device writes are not enabled; confirm the write action first.".to_owned())
    }
}

/// Sets a keycode on the live dynamic keymap (volatile until saved).
#[tauri::command]
fn set_keycode(gate: State<WriteGate>, layer: u8, row: u8, col: u8, keycode: u16) -> Result<(), String> {
    require_write_gate(&gate)?;
    let transport = HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_keycode(layer, row, col, keycode)
        .map_err(|error| error.to_string())
}

/// Persists the live keymap to EEPROM. A separate confirmed action.
#[tauri::command]
fn save_eeprom(gate: State<WriteGate>) -> Result<(), String> {
    require_write_gate(&gate)?;
    let transport = HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut write = ViaWriteProtocol::new(transport);
    write.save_eeprom().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProjectStore::new(ProjectStore::default_root()))
        .manage(WriteGate(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![
            list_devices,
            read_v5_snapshot,
            verify_protocol,
            save_project,
            load_project,
            list_projects,
            remove_project,
            enable_device_writes,
            set_keycode,
            save_eeprom
        ])
        .run(tauri::generate_context!())
        .expect("error while running QMKUI");
}
