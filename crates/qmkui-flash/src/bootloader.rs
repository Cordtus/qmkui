//! Bootloader registry: family → USB identity, entry instructions, recovery.
//!
//! Detection is a read-only sysfs probe; this crate never opens the device.

use crate::request::DeviceIdentity;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootloaderSpec {
    pub family: &'static str,
    /// Bootloader-mode USB identities, lowercase hex without `0x`.
    pub usb_ids: &'static [(&'static str, &'static str)],
    pub entry: &'static str,
    pub recovery: &'static str,
}

pub const BOOTLOADERS: &[BootloaderSpec] = &[
    BootloaderSpec {
        family: "stm32-dfu",
        usb_ids: &[("0483", "df11")],
        entry: "Unplug the keyboard, hold Esc (or the reset key), then reconnect \
                it; it should enumerate as STM32 DFU (0483:df11).",
        recovery: "If the board does not enumerate, unplug it, hold the reset key \
                   for five seconds, and reconnect. If DFU entry keeps failing, use \
                   the vendor's recovery firmware for this exact model.",
    },
    BootloaderSpec {
        family: "atmel-dfu",
        usb_ids: &[
            ("03eb", "2ff4"),
            ("03eb", "2ff0"),
            ("03eb", "2ffb"),
            ("03eb", "2fef"),
        ],
        entry: "Press the reset button twice, or hold the bootmagic key while \
                reconnecting, until the board enumerates as ATmega DFU.",
        recovery: "Unplug the board, hold reset, and reconnect. If it stays silent, \
                   use the vendor's recovery firmware for this exact model.",
    },
];

pub fn spec(family: &str) -> Option<&'static BootloaderSpec> {
    BOOTLOADERS
        .iter()
        .find(|candidate| candidate.family == family)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedBootloader {
    pub identity: DeviceIdentity,
    pub sysfs_path: std::path::PathBuf,
}

/// All sysfs devices matching the bootloader's USB identities. Reads only
/// `idVendor`/`idProduct`; never endpoints or serial numbers.
pub fn detect_all(sysfs_root: &Path, spec: &BootloaderSpec) -> Vec<DetectedBootloader> {
    let Ok(entries) = fs::read_dir(sysfs_root) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let (Some(vid), Some(pid)) = (read_id(&path, "idVendor"), read_id(&path, "idProduct"))
        else {
            // Interface directories have no ids; keep looking.
            continue;
        };
        if spec
            .usb_ids
            .iter()
            .any(|(want_vid, want_pid)| vid == *want_vid && pid == *want_pid)
        {
            found.push(DetectedBootloader {
                identity: DeviceIdentity {
                    vendor_id: vid,
                    product_id: pid,
                },
                sysfs_path: path,
            });
        }
    }
    found
}

/// The single matching device, or `None` when absent or ambiguous.
pub fn detect(sysfs_root: &Path, spec: &BootloaderSpec) -> Option<DeviceIdentity> {
    let mut found = detect_all(sysfs_root, spec);
    (found.len() == 1).then(|| found.remove(0).identity)
}

fn read_id(dir: &Path, name: &str) -> Option<String> {
    let value = fs::read_to_string(dir.join(name)).ok()?;
    Some(value.trim().to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture(vid: &str, pid: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("qmkui-bootloader-{unique}"));
        let device = root.join("1-1");
        fs::create_dir_all(&device).unwrap();
        fs::write(device.join("idVendor"), format!("{vid}\n")).unwrap();
        fs::write(device.join("idProduct"), format!("{pid}\n")).unwrap();
        root
    }

    #[test]
    fn finds_stm32_dfu() {
        let root = fixture("0483", "DF11");
        let found = detect(&root, spec("stm32-dfu").unwrap()).unwrap();
        fs::remove_dir_all(&root).ok();

        assert_eq!(found.vendor_id, "0483");
        assert_eq!(found.product_id, "df11");
    }

    #[test]
    fn reports_ambiguity_instead_of_guessing() {
        let root = fixture("0483", "df11");
        let second = root.join("1-2");
        fs::create_dir_all(&second).unwrap();
        fs::write(second.join("idVendor"), "0483\n").unwrap();
        fs::write(second.join("idProduct"), "df11\n").unwrap();
        let spec = spec("stm32-dfu").unwrap();
        assert_eq!(detect_all(&root, spec).len(), 2);
        assert!(detect(&root, spec).is_none());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn ignores_other_devices_and_unknown_families() {
        let root = fixture("3434", "0950");
        assert!(detect(&root, spec("stm32-dfu").unwrap()).is_none());
        fs::remove_dir_all(&root).ok();
        assert!(spec("no-such-bootloader").is_none());
    }
}
