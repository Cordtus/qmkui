use qmkui_build::artifact::{command_log, ArtifactInput, ArtifactStore};
use qmkui_build::plan::project_digest;
use qmkui_build::runner::{CommandRunner, SystemCommandRunner};
use qmkui_flash::dry_run::DryRunAdapter;
use qmkui_flash::policy::assess_request;
use qmkui_flash::request::{DeviceIdentity, FlashRequest, FlashTarget};
use qmkui_hid::hidapi::HidApiTransport;
use qmkui_hid::keychron_v5::KeychronV5Reader;
use qmkui_hid::via::{KeymapDimensions, ViaReadProtocol};
use qmkui_hid::via_write::ViaWriteProtocol;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::State;

mod projects;

use projects::{ProjectStore, ProjectSummary};

/// Operator-controlled write gate. Writes are only possible after the UI
/// explicitly enables them (a confirmed action); every write command checks it.
struct WriteGate(AtomicBool);

impl WriteGate {
    fn is_enabled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
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
    lighting: qmkui_hid::via::ViaRgbMatrixState,
    keymap: qmkui_hid::via::ViaKeymap,
    macros: qmkui_hid::via::ViaMacros,
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
    let transport =
        HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut reader = KeychronV5Reader::new(transport);
    let identity = reader.read_identity().map_err(|error| error.to_string())?;
    let capabilities = reader
        .read_capabilities()
        .map_err(|error| error.to_string())?;
    drop(reader);
    let transport =
        HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut via = ViaReadProtocol::new(transport);
    // Lighting is standard VIA RGB-matrix channel 3, not a Keychron command.
    let lighting = via
        .read_rgb_matrix_state()
        .map_err(|error| error.to_string())?;
    let keymap = via
        .read_via_keymap(V5_DIMENSIONS)
        .map_err(|error| error.to_string())?;
    let macros = via.read_via_macros().map_err(|error| error.to_string())?;
    Ok(V5Snapshot {
        identity,
        capabilities,
        lighting,
        keymap,
        macros,
    })
}

/// Verifies the VIA protocol version. Sends only the standard read command.
#[tauri::command]
fn verify_protocol() -> Result<u16, String> {
    let transport =
        HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut via = ViaReadProtocol::new(transport);
    via.get_protocol_version()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_project(
    store: State<ProjectStore>,
    id: String,
    project_json: String,
) -> Result<(), String> {
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
    gate.0.store(true, Ordering::SeqCst);
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
fn set_keycode(
    gate: State<WriteGate>,
    layer: u8,
    row: u8,
    col: u8,
    keycode: u16,
) -> Result<(), String> {
    require_write_gate(&gate)?;
    let transport =
        HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut write = ViaWriteProtocol::new(transport);
    write
        .set_keycode(layer, row, col, keycode)
        .map_err(|error| error.to_string())
}

/// Persists the RGB-matrix lighting state to EEPROM. A separate confirmed action.
#[tauri::command]
fn save_lighting(gate: State<WriteGate>) -> Result<(), String> {
    require_write_gate(&gate)?;
    let transport =
        HidApiTransport::open(VENDOR_ID, PRODUCT_ID).map_err(|error| error.to_string())?;
    let mut write = ViaWriteProtocol::new(transport);
    write
        .save_rgb_matrix_eeprom()
        .map_err(|error| error.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalBuildResult {
    ok: bool,
    stdout: String,
    stderr: String,
    duration_ms: u64,
    artifact_id: Option<String>,
    project_digest: String,
}

/// Runs the local `qmk compile` for the staged project. The runner is the real
/// system runner; staging and artifact storage happen under the user data dir.
#[tauri::command]
fn run_local_build(project_json: String) -> Result<LocalBuildResult, String> {
    let project: qmkui_core::model::KeyboardProject =
        serde_json::from_str(&project_json).map_err(|error| error.to_string())?;
    let digest = project_digest(&project).map_err(|error| error.to_string())?;

    let root = ProjectStore::default_root();
    let artifacts_dir = root.join("artifacts");
    let staging_dir = root.join("staging");
    let store = ArtifactStore::new(artifacts_dir);

    let layout = layout_contract_for(&project);
    let keymap_path = qmkui_build::staging::export_and_stage(&staging_dir, &project, &layout)
        .map_err(|error| error.to_string())?;

    let command_plan = qmkui_build::runner::CommandPlan {
        program: "qmk".to_owned(),
        args: vec![
            "compile".to_owned(),
            "-kb".to_owned(),
            project.target.qmk_keyboard.clone(),
            "-km".to_owned(),
            project.build.keymap_name.clone(),
        ],
        cwd: Some(staging_dir.to_string_lossy().into_owned()),
    };

    let started = std::time::Instant::now();
    let mut runner = SystemCommandRunner;
    let result = runner
        .run(&command_plan)
        .map_err(|error| error.to_string())?;
    let duration_ms = started.elapsed().as_millis() as u64;

    if result.exit_code != Some(0) {
        return Ok(LocalBuildResult {
            ok: false,
            stdout: result.stdout,
            stderr: result.stderr,
            duration_ms,
            artifact_id: None,
            project_digest: digest,
        });
    }

    let firmware = std::fs::read(keymap_path).unwrap_or_default();
    let artifact = store
        .store(ArtifactInput {
            firmware,
            keymap_json: serde_json::to_vec(
                &serde_json::json!({ "keyboard": project.target.qmk_keyboard }),
            )
            .unwrap_or_default(),
            log: command_log(&command_plan, &result),
            project_digest: digest.clone(),
            qmk_keyboard: project.target.qmk_keyboard.clone(),
            qmk_version: None,
            catalog_version: None,
            created_at: now_iso(),
        })
        .map_err(|error| error.to_string())?;

    Ok(LocalBuildResult {
        ok: true,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms,
        artifact_id: Some(artifact.id),
        project_digest: digest,
    })
}

fn layout_contract_for(project: &qmkui_core::model::KeyboardProject) -> qmkui_core::LayoutContract {
    let mut visual_key_order = Vec::new();
    if let Some(layer) = project.layers.first() {
        visual_key_order.extend(
            layer
                .assignments
                .iter()
                .map(|assignment| assignment.visual_key_id.clone()),
        );
    }
    qmkui_core::LayoutContract::for_keyboard_layout(
        project.target.keyboard_id.clone(),
        project.target.qmk_keyboard.clone(),
        project.target.layout_id.clone(),
        project.target.qmk_layout_macro.clone(),
        visual_key_order,
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FlashDryRunResult {
    verdict: FlashVerdictJson,
    log: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FlashVerdictJson {
    pass: bool,
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FlashDryRunInput {
    project_json: String,
    artifact_id: String,
    expected_vendor: String,
    expected_product: String,
    detected_vendor: Option<String>,
    detected_product: Option<String>,
    bootloader: Option<String>,
    operator_confirmed: bool,
}

/// Assesses a flash request against the current project and runs the dry-run
/// adapter when policy passes. No command reaches a device.
#[tauri::command]
fn flash_dry_run(input: FlashDryRunInput) -> Result<FlashDryRunResult, String> {
    let project: qmkui_core::model::KeyboardProject =
        serde_json::from_str(&input.project_json).map_err(|error| error.to_string())?;
    let digest = project_digest(&project).map_err(|error| error.to_string())?;

    let store = ArtifactStore::new(ProjectStore::default_root().join("artifacts"));
    let artifact = store
        .load(&input.artifact_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("Artifact {} does not exist", input.artifact_id))?;

    let request = FlashRequest {
        target: FlashTarget {
            project_digest: artifact.project_digest,
            firmware_sha256: artifact.firmware_sha256,
            qmk_keyboard: artifact.qmk_keyboard,
            bootloader: input
                .bootloader
                .clone()
                .unwrap_or_else(|| "atmel-dfu".to_owned()),
        },
        expected_device: DeviceIdentity {
            vendor_id: input.expected_vendor,
            product_id: input.expected_product,
        },
        operator_confirmed: input.operator_confirmed,
    };
    let detected_device = match (input.detected_vendor, input.detected_product) {
        (Some(vendor), Some(product)) => Some(DeviceIdentity {
            vendor_id: vendor,
            product_id: product,
        }),
        _ => None,
    };

    let verdict = assess_request(
        &request,
        &digest,
        detected_device.as_ref(),
        input.bootloader.as_deref(),
    );
    let log = if matches!(verdict, qmkui_flash::policy::PolicyVerdict::Pass) {
        let adapter = DryRunAdapter::new();
        adapter.flash(&request).log
    } else {
        Vec::new()
    };

    Ok(FlashDryRunResult {
        verdict: match verdict {
            qmkui_flash::policy::PolicyVerdict::Pass => FlashVerdictJson {
                pass: true,
                reason: None,
            },
            qmkui_flash::policy::PolicyVerdict::Blocked { reason } => FlashVerdictJson {
                pass: false,
                reason: Some(reason),
            },
        },
        log,
    })
}

fn now_iso() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProjectStore::new(ProjectStore::default_root()))
        .manage(WriteGate(AtomicBool::new(false)))
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
            save_lighting,
            run_local_build,
            flash_dry_run
        ])
        .run(tauri::generate_context!())
        .expect("error while running QMKUI");
}
