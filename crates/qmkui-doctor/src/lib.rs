use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorSnapshot {
    pub distro_id: Option<String>,
    pub package_manager: Option<String>,
    pub commands: Vec<CommandStatus>,
    pub qmk_package: Option<ArchPackageStatus>,
    pub hardware_probe: HardwareProbeStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandStatus {
    pub name: String,
    pub path: Option<PathBuf>,
    pub required_for: Requirement,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Requirement {
    LocalBuild,
    Flashing,
    CatalogSync,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchPackageStatus {
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProbeStatus {
    pub status: ProbeState,
    pub reason: String,
    #[serde(default)]
    pub devices: Vec<UsbDeviceSnapshot>,
    #[serde(default)]
    pub detected_keyboards: Vec<DetectedKeyboard>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeState {
    Skipped,
    Ready,
    Blocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProbeMode {
    ReadOnly,
    NoHardware,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbDeviceSnapshot {
    pub sysfs_name: String,
    pub vid: String,
    pub pid: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manufacturer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub product: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedKeyboard {
    pub catalog_keyboard_id: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qmk_keyboard: Option<String>,
    pub layout_id: String,
    pub match_kind: KeyboardMatchKind,
    pub confidence: u8,
    pub device: UsbDeviceSnapshot,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum KeyboardMatchKind {
    UsbVidPid,
    ProductText,
}

#[derive(Debug, Clone, Copy)]
struct KnownKeyboard {
    vid: &'static str,
    pid: &'static str,
    product_hint: &'static str,
    catalog_keyboard_id: &'static str,
    display_name: &'static str,
    qmk_keyboard: Option<&'static str>,
    layout_id: &'static str,
    note: Option<&'static str>,
}

const KNOWN_KEYBOARDS: &[KnownKeyboard] = &[
    KnownKeyboard {
        vid: "3434",
        pid: "0950",
        product_hint: "keychron v5 max",
        catalog_keyboard_id: "keychron/v5_max/ansi_encoder",
        display_name: "Keychron V5 Max ANSI Knob",
        qmk_keyboard: Some("keychron/v5_max/ansi_encoder"),
        layout_id: "LAYOUT_ansi_98",
        note: None,
    },
    KnownKeyboard {
        vid: "3434",
        pid: "0351",
        product_hint: "keychron v5",
        catalog_keyboard_id: "keychron/v5/ansi_encoder",
        display_name: "Keychron V5 ANSI Encoder",
        qmk_keyboard: Some("keychron/v5/ansi_encoder"),
        layout_id: "LAYOUT_ansi_98",
        note: None,
    },
    KnownKeyboard {
        vid: "3434",
        pid: "0350",
        product_hint: "keychron v5",
        catalog_keyboard_id: "keychron/v5/ansi",
        display_name: "Keychron V5 ANSI",
        qmk_keyboard: Some("keychron/v5/ansi"),
        layout_id: "LAYOUT_ansi_100",
        note: None,
    },
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DoctorFinding {
    pub code: String,
    pub severity: FindingSeverity,
    pub title: String,
    pub message: String,
    pub remediation: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FindingSeverity {
    Info,
    Warning,
    Error,
}

pub fn probe_mode_from_args<I, S>(args: I) -> Result<ProbeMode, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut args = args.into_iter();
    let Some(argument) = args.next() else {
        return Ok(ProbeMode::ReadOnly);
    };
    let argument = argument.as_ref().to_string_lossy();

    if argument != "--no-hardware-probe" {
        return Err(format!("unknown argument: {argument}"));
    }

    if let Some(extra) = args.next() {
        return Err(format!(
            "unexpected extra argument: {}",
            extra.as_ref().to_string_lossy()
        ));
    }

    Ok(ProbeMode::NoHardware)
}

pub fn snapshot_current_read_only_probe() -> DoctorSnapshot {
    snapshot_current_with_probe_root(Path::new("/sys/bus/usb/devices"))
}

pub fn snapshot_current_no_hardware_probe() -> DoctorSnapshot {
    let mut snapshot = snapshot_base();
    snapshot.hardware_probe = HardwareProbeStatus {
        status: ProbeState::Skipped,
        reason: "Keyboard probing was skipped by explicit no-probe mode.".to_owned(),
        devices: Vec::new(),
        detected_keyboards: Vec::new(),
    };
    snapshot
}

fn snapshot_current_with_probe_root(probe_root: &Path) -> DoctorSnapshot {
    let mut snapshot = snapshot_base();
    snapshot.hardware_probe = read_only_usb_probe(probe_root);
    snapshot
}

fn snapshot_base() -> DoctorSnapshot {
    let distro_id = read_os_release_id();
    let package_manager = find_on_path("pacman").map(|_| "pacman".to_owned());
    let commands = [
        ("qmk", Requirement::LocalBuild),
        ("git", Requirement::CatalogSync),
        ("dfu-util", Requirement::Flashing),
        ("dfu-programmer", Requirement::Flashing),
        ("avrdude", Requirement::Flashing),
    ]
    .into_iter()
    .map(|(name, required_for)| CommandStatus {
        name: name.to_owned(),
        path: find_on_path(name),
        required_for,
    })
    .collect();

    DoctorSnapshot {
        distro_id,
        package_manager,
        commands,
        qmk_package: None,
        hardware_probe: HardwareProbeStatus {
            status: ProbeState::Blocked,
            reason: "USB descriptor probe has not run yet.".to_owned(),
            devices: Vec::new(),
            detected_keyboards: Vec::new(),
        },
    }
}

pub fn evaluate(snapshot: &DoctorSnapshot) -> Vec<DoctorFinding> {
    let mut findings = Vec::new();

    if snapshot.distro_id.as_deref() != Some("arch")
        && snapshot.distro_id.as_deref() != Some("garuda")
    {
        findings.push(DoctorFinding {
            code: "system.distro.secondary".to_owned(),
            severity: FindingSeverity::Info,
            title: "Secondary Linux target detected".to_owned(),
            message: "The first packaging path is optimized for Arch/Garuda.".to_owned(),
            remediation: vec!["Use the AppImage/deb/rpm path when it is available.".to_owned()],
        });
    }

    for command in &snapshot.commands {
        if command.path.is_none() {
            findings.push(DoctorFinding {
                code: format!("command.{}.missing", command.name),
                severity: match command.required_for {
                    Requirement::LocalBuild => FindingSeverity::Error,
                    Requirement::Flashing | Requirement::CatalogSync => FindingSeverity::Warning,
                },
                title: format!("{} is not installed", command.name),
                message: format!("{} was not found on PATH.", command.name),
                remediation: match command.name.as_str() {
                    "qmk" => vec!["Install Arch package extra/qmk for local builds.".to_owned()],
                    "git" => vec!["Install git to update QMK metadata.".to_owned()],
                    _ => vec![format!(
                        "Install {} if you need this bootloader or flash path.",
                        command.name
                    )],
                },
            });
        }
    }

    match snapshot.hardware_probe.status {
        ProbeState::Skipped => {
            findings.push(DoctorFinding {
                code: "hardware.probe.skipped".to_owned(),
                severity: FindingSeverity::Info,
                title: "Keyboard probing was skipped".to_owned(),
                message: snapshot.hardware_probe.reason.clone(),
                remediation: vec!["Refresh keyboard status.".to_owned()],
            });
        }
        ProbeState::Ready => {
            if snapshot.hardware_probe.detected_keyboards.is_empty() {
                findings.push(DoctorFinding {
                    code: "hardware.keyboard.notDetected".to_owned(),
                    severity: FindingSeverity::Warning,
                    title: "Keyboard not recognized".to_owned(),
                    message: snapshot.hardware_probe.reason.clone(),
                    remediation: vec![
                        "Select a preset or add this device to the catalog.".to_owned()
                    ],
                });
            } else {
                findings.push(DoctorFinding {
                    code: "hardware.keyboard.detected".to_owned(),
                    severity: FindingSeverity::Info,
                    title: "Keyboard detected".to_owned(),
                    message: snapshot
                        .hardware_probe
                        .detected_keyboards
                        .iter()
                        .map(|keyboard| keyboard.display_name.as_str())
                        .collect::<Vec<_>>()
                        .join(", "),
                    remediation: vec!["Use the matched preset.".to_owned()],
                });
            }
        }
        ProbeState::Blocked => {
            findings.push(DoctorFinding {
                code: "hardware.probe.blocked".to_owned(),
                severity: FindingSeverity::Warning,
                title: "Keyboard scan unavailable".to_owned(),
                message: snapshot.hardware_probe.reason.clone(),
                remediation: vec!["Check USB device visibility.".to_owned()],
            });
        }
    }

    findings
}

fn read_only_usb_probe(root: &Path) -> HardwareProbeStatus {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            return HardwareProbeStatus {
                status: ProbeState::Blocked,
                reason: format!("Could not read {}: {error}", root.display()),
                devices: Vec::new(),
                detected_keyboards: Vec::new(),
            };
        }
    };

    let mut devices = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(vid) = read_sysfs_value(&path, "idVendor") else {
            continue;
        };
        let Some(pid) = read_sysfs_value(&path, "idProduct") else {
            continue;
        };

        let candidate = UsbDeviceSnapshot {
            sysfs_name: entry.file_name().to_string_lossy().into_owned(),
            vid: normalize_hex_id(&vid),
            pid: normalize_hex_id(&pid),
            manufacturer: read_sysfs_value(&path, "manufacturer"),
            product: read_sysfs_value(&path, "product"),
        };

        if matches_known_keyboard(&candidate).is_some() || looks_like_keyboard(&candidate) {
            devices.push(candidate);
        }
    }

    let detected_keyboards = devices
        .iter()
        .filter_map(detect_known_keyboard)
        .collect::<Vec<_>>();

    let reason = if detected_keyboards.is_empty() {
        format!(
            "Scan complete; {} keyboard-like USB device(s) visible.",
            devices.len()
        )
    } else {
        format!("Matched {} keyboard preset(s).", detected_keyboards.len())
    };

    HardwareProbeStatus {
        status: ProbeState::Ready,
        reason,
        devices,
        detected_keyboards,
    }
}

fn read_sysfs_value(path: &Path, file_name: &str) -> Option<String> {
    let value = std::fs::read_to_string(path.join(file_name)).ok()?;
    let value = value.trim().to_owned();
    (!value.is_empty()).then_some(value)
}

fn normalize_hex_id(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("0x")
        .trim_start_matches("0X")
        .to_ascii_lowercase()
}

fn looks_like_keyboard(device: &UsbDeviceSnapshot) -> bool {
    let text = format!(
        "{} {}",
        device.manufacturer.as_deref().unwrap_or_default(),
        device.product.as_deref().unwrap_or_default()
    )
    .to_ascii_lowercase();

    text.contains("keyboard") || text.contains("keychron") || text.contains("qmk")
}

fn matches_known_keyboard(device: &UsbDeviceSnapshot) -> Option<&'static KnownKeyboard> {
    KNOWN_KEYBOARDS
        .iter()
        .find(|keyboard| keyboard.vid == device.vid && keyboard.pid == device.pid)
}

fn detect_known_keyboard(device: &UsbDeviceSnapshot) -> Option<DetectedKeyboard> {
    let known = matches_known_keyboard(device)?;
    let product_text = device
        .product
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let match_kind = if product_text.contains(known.product_hint) {
        KeyboardMatchKind::ProductText
    } else {
        KeyboardMatchKind::UsbVidPid
    };

    Some(DetectedKeyboard {
        catalog_keyboard_id: known.catalog_keyboard_id.to_owned(),
        display_name: known.display_name.to_owned(),
        qmk_keyboard: known.qmk_keyboard.map(str::to_owned),
        layout_id: known.layout_id.to_owned(),
        match_kind,
        confidence: if match_kind == KeyboardMatchKind::ProductText {
            98
        } else {
            90
        },
        device: device.clone(),
        note: known.note.map(str::to_owned),
    })
}

pub fn find_on_path(command: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    find_on_path_in(command, &path)
}

fn find_on_path_in(command: &str, path: &OsStr) -> Option<PathBuf> {
    env::split_paths(path).find_map(|entry| {
        let candidate = entry.join(command);
        is_executable_file(&candidate).then_some(candidate)
    })
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    std::fs::metadata(path)
        .map(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

fn read_os_release_id() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    content.lines().find_map(|line| {
        let value = line.strip_prefix("ID=")?;
        Some(value.trim_matches('"').to_owned())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn probe_mode_from_args_defaults_to_read_only() {
        assert_eq!(
            probe_mode_from_args(std::iter::empty::<&str>()),
            Ok(ProbeMode::ReadOnly)
        );
    }

    #[test]
    fn probe_mode_from_args_accepts_no_hardware_probe_flag() {
        assert_eq!(
            probe_mode_from_args(["--no-hardware-probe"]),
            Ok(ProbeMode::NoHardware)
        );
    }

    #[test]
    fn probe_mode_from_args_rejects_unknown_argument() {
        assert_eq!(
            probe_mode_from_args(["--unknown"]),
            Err("unknown argument: --unknown".to_owned())
        );
    }

    #[test]
    fn probe_mode_from_args_rejects_extra_argument() {
        assert_eq!(
            probe_mode_from_args(["--no-hardware-probe", "unexpected"]),
            Err("unexpected extra argument: unexpected".to_owned())
        );
    }

    #[test]
    fn missing_qmk_is_error_but_keyboard_probe_stays_skipped() {
        let snapshot = DoctorSnapshot {
            distro_id: Some("garuda".to_owned()),
            package_manager: Some("pacman".to_owned()),
            commands: vec![CommandStatus {
                name: "qmk".to_owned(),
                path: None,
                required_for: Requirement::LocalBuild,
            }],
            qmk_package: None,
            hardware_probe: HardwareProbeStatus {
                status: ProbeState::Skipped,
                reason: "test does not probe hardware".to_owned(),
                devices: Vec::new(),
                detected_keyboards: Vec::new(),
            },
        };

        let findings = evaluate(&snapshot);

        assert!(findings.iter().any(|finding| {
            finding.code == "command.qmk.missing" && finding.severity == FindingSeverity::Error
        }));
        assert!(findings
            .iter()
            .any(|finding| finding.code == "hardware.probe.skipped"));
    }

    #[test]
    fn default_snapshot_keeps_hardware_probe_skipped() {
        let snapshot = snapshot_current_no_hardware_probe();

        assert_eq!(snapshot.hardware_probe.status, ProbeState::Skipped);
        assert!(snapshot
            .hardware_probe
            .reason
            .contains("explicit no-probe mode"));
    }

    #[test]
    fn read_only_probe_detects_known_keychron_presets_from_sysfs_descriptors() {
        let cases = [
            (
                "0950",
                "Keychron V5 Max",
                "keychron/v5_max/ansi_encoder",
                Some("keychron/v5_max/ansi_encoder"),
                "LAYOUT_ansi_98",
                KeyboardMatchKind::ProductText,
                98,
            ),
            (
                "0351",
                "Keychron V5",
                "keychron/v5/ansi_encoder",
                Some("keychron/v5/ansi_encoder"),
                "LAYOUT_ansi_98",
                KeyboardMatchKind::ProductText,
                98,
            ),
            (
                "0350",
                "Keychron V5",
                "keychron/v5/ansi",
                Some("keychron/v5/ansi"),
                "LAYOUT_ansi_100",
                KeyboardMatchKind::ProductText,
                98,
            ),
            (
                "0351",
                "USB Keyboard",
                "keychron/v5/ansi_encoder",
                Some("keychron/v5/ansi_encoder"),
                "LAYOUT_ansi_98",
                KeyboardMatchKind::UsbVidPid,
                90,
            ),
        ];

        for (pid, product, catalog_keyboard_id, qmk_keyboard, layout_id, match_kind, confidence) in
            cases
        {
            let temp_dir = unique_temp_dir("qmkui-doctor-sysfs");
            write_sysfs_device(&temp_dir, "1-3", "3434", pid, "Keychron", product);

            let snapshot = snapshot_current_with_probe_root(&temp_dir);

            assert_eq!(snapshot.hardware_probe.status, ProbeState::Ready);
            assert_eq!(snapshot.hardware_probe.detected_keyboards.len(), 1);
            let detected = &snapshot.hardware_probe.detected_keyboards[0];
            assert_eq!(detected.catalog_keyboard_id, catalog_keyboard_id);
            assert_eq!(detected.device.vid, "3434");
            assert_eq!(detected.device.pid, pid);
            assert_eq!(detected.qmk_keyboard.as_deref(), qmk_keyboard);
            assert_eq!(detected.layout_id, layout_id);
            assert_eq!(detected.match_kind, match_kind);
            assert_eq!(detected.confidence, confidence);

            fs::remove_dir_all(temp_dir).expect("temp dir is removed");
        }
    }

    #[test]
    fn read_only_probe_does_not_serialize_sysfs_serial_files() {
        let temp_dir = unique_temp_dir("qmkui-doctor-sysfs-privacy");
        let device_dir = write_sysfs_device(
            &temp_dir,
            "1-3",
            "3434",
            "0950",
            "Keychron",
            "Keychron V5 Max",
        );
        fs::write(device_dir.join("serial"), "SECRET_SERIAL_SENTINEL\n")
            .expect("serial is written");
        fs::write(device_dir.join("iSerial"), "SECRET_ISERIAL_SENTINEL\n")
            .expect("iSerial is written");
        fs::write(
            device_dir.join("serialNumber"),
            "SECRET_SERIAL_NUMBER_SENTINEL\n",
        )
        .expect("serialNumber is written");

        let snapshot = snapshot_current_with_probe_root(&temp_dir);
        let serialized = serde_json::to_string(&snapshot).expect("snapshot serializes");

        assert_eq!(snapshot.hardware_probe.detected_keyboards.len(), 1);
        assert!(!serialized.contains("SECRET_"));
        assert!(!serialized.to_ascii_lowercase().contains("serial"));

        fs::remove_dir_all(temp_dir).expect("temp dir is removed");
    }

    #[test]
    fn read_only_probe_does_not_report_unrelated_usb_devices() {
        let temp_dir = unique_temp_dir("qmkui-doctor-sysfs-unrelated");
        let device_dir = temp_dir.join("1-7");
        fs::create_dir_all(&device_dir).expect("device dir is created");
        fs::write(device_dir.join("idVendor"), "1050\n").expect("vid is written");
        fs::write(device_dir.join("idProduct"), "0407\n").expect("pid is written");
        fs::write(device_dir.join("manufacturer"), "Yubico\n").expect("manufacturer is written");
        fs::write(device_dir.join("product"), "YubiKey OTP+FIDO+CCID\n")
            .expect("product is written");

        let snapshot = snapshot_current_with_probe_root(&temp_dir);

        assert_eq!(snapshot.hardware_probe.status, ProbeState::Ready);
        assert!(snapshot.hardware_probe.devices.is_empty());
        assert!(snapshot.hardware_probe.detected_keyboards.is_empty());

        fs::remove_dir_all(temp_dir).expect("temp dir is removed");
    }

    #[cfg(unix)]
    #[test]
    fn path_detection_requires_executable_permission() {
        let temp_dir = unique_temp_dir("qmkui-doctor-path");
        fs::create_dir_all(&temp_dir).expect("temp dir is created");
        let command_path = temp_dir.join("qmk");
        fs::write(&command_path, "#!/usr/bin/env sh\n").expect("stub command is written");

        let path = env::join_paths([temp_dir.as_path()]).expect("PATH joins");
        assert_eq!(find_on_path_in("qmk", &path), None);

        let mut permissions = fs::metadata(&command_path)
            .expect("stub metadata is readable")
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&command_path, permissions).expect("stub is executable");

        assert_eq!(find_on_path_in("qmk", &path), Some(command_path));

        fs::remove_dir_all(temp_dir).expect("temp dir is removed");
    }

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time is after epoch")
            .as_nanos();
        env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()))
    }

    fn write_sysfs_device(
        root: &Path,
        sysfs_name: &str,
        vid: &str,
        pid: &str,
        manufacturer: &str,
        product: &str,
    ) -> PathBuf {
        let device_dir = root.join(sysfs_name);
        fs::create_dir_all(&device_dir).expect("device dir is created");
        fs::write(device_dir.join("idVendor"), format!("{vid}\n")).expect("vid is written");
        fs::write(device_dir.join("idProduct"), format!("{pid}\n")).expect("pid is written");
        fs::write(device_dir.join("manufacturer"), format!("{manufacturer}\n"))
            .expect("manufacturer is written");
        fs::write(device_dir.join("product"), format!("{product}\n")).expect("product is written");
        device_dir
    }
}
