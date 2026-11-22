//! `qmkui-flash` — gated firmware flash for a QMKUI bundle.
//!
//! Usage:
//!   qmkui-flash --bundle firmware.zip --qmk-path ~/qmk_firmware \
//!     --keyboard vendor/board --keymap qmkui_project --bootloader stm32-dfu \
//!     --confirm vendor/board
//!
//! The operator puts the board in bootloader mode first. This tool detects the
//! bootloader over read-only sysfs, stages the bundle under `<qmk>/.qmkui/`,
//! checks the device-side policy, then moves the keymap into place and runs
//! `qmk flash`. It never opens the USB device directly.

use qmkui_build::artifact::hex_sha256;
use qmkui_build::runner::SystemCommandRunner;
use qmkui_flash::adapter::{prepare_keymap, retain_log, run_flash, QmkOutput};
use qmkui_flash::bootloader;
use qmkui_flash::bundle::{crc32, read_bundle, MAX_ARCHIVE_SIZE};
use qmkui_flash::request::{FlashRequest, FlashStatus};
use qmkui_flash::{assess_target, FlashError};
use std::env;
use std::fs;
use std::path::PathBuf;

const USAGE: &str = "\
qmkui-flash — flash a QMKUI firmware bundle

Required:
  --bundle <zip>        Firmware bundle from QMKUI (Download firmware)
  --qmk-path <dir>      QMK checkout root (must contain keyboards/)
  --keyboard <target>   QMK keyboard, e.g. keychron/v5_max/ansi_encoder
  --keymap <name>       Keymap directory name, e.g. qmkui_my_board
  --bootloader <family> Bootloader family from the keyboard info.json
  --confirm <target>    Repeat --keyboard to confirm the target

Options:
  --digest <value>      Recorded project digest (default: bundle sha256)
  --sysfs <dir>         USB sysfs root (default /sys/bus/usb/devices)
  --log-dir <dir>       Where the run log is kept
  --dry-run             Print the plan without detecting, writing, or flashing
  -h, --help            Show this help

Bootloader families: stm32-dfu, atmel-dfu
Exit codes: 0 success, 2 usage/IO, 3 no unique bootloader device, 4 refused
or flash failed.
";

struct Args {
    bundle: PathBuf,
    qmk_path: PathBuf,
    keyboard: String,
    keymap: String,
    bootloader: String,
    digest: Option<String>,
    sysfs: PathBuf,
    log_dir: PathBuf,
    confirm: Option<String>,
    dry_run: bool,
}

fn main() {
    let code = match run(env::args().skip(1)) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("qmkui-flash: {error}");
            2
        }
    };
    std::process::exit(code);
}

fn run(args: impl Iterator<Item = String>) -> Result<i32, Box<dyn std::error::Error>> {
    let Some(args) = parse_args(args)? else {
        print!("{USAGE}");
        return Ok(0);
    };

    let size = fs::metadata(&args.bundle)?.len();
    if size as usize > MAX_ARCHIVE_SIZE {
        eprintln!(
            "qmkui-flash: bundle is larger than {} bytes",
            MAX_ARCHIVE_SIZE
        );
        return Ok(2);
    }
    let bytes = fs::read(&args.bundle)?;
    let sha256 = hex_sha256(&bytes);
    let spec = bootloader::spec(&args.bootloader).ok_or_else(|| {
        FlashError::InvalidTarget(format!(
            "unknown bootloader family {:?}; known: stm32-dfu, atmel-dfu",
            args.bootloader
        ))
    })?;

    if args.dry_run {
        let files = read_bundle(&bytes)?;
        println!("bootloader: {} ({})", spec.family, spec.entry);
        println!(
            "bootloader ids: {}",
            spec.usb_ids
                .iter()
                .map(|(vid, pid)| format!("{vid}:{pid}"))
                .collect::<Vec<_>>()
                .join(", ")
        );
        println!(
            "bundle: {} files, sha256 {}, crc32 {:08x}",
            files.len(),
            sha256,
            crc32(&bytes)
        );
        println!(
            "would stage under {}/.qmkui and move to {}/keyboards/{}/keymaps/{}",
            args.qmk_path.display(),
            args.qmk_path.display(),
            args.keyboard,
            args.keymap
        );
        println!(
            "would run: qmk flash -kb {} -km {}",
            args.keyboard, args.keymap
        );
        println!("dry-run: no device was probed, nothing was written");
        return Ok(0);
    }

    if args.confirm.as_deref() != Some(args.keyboard.as_str()) {
        eprintln!(
            "qmkui-flash: refusing to flash without --confirm {}",
            args.keyboard
        );
        return Ok(4);
    }
    if !args.qmk_path.join("keyboards").is_dir() {
        eprintln!(
            "qmkui-flash: {} does not look like a QMK checkout (no keyboards/)",
            args.qmk_path.display()
        );
        return Ok(2);
    }

    let detected = bootloader::detect_all(&args.sysfs, spec);
    let detected = match detected.as_slice() {
        [] => {
            eprintln!(
                "qmkui-flash: no {} bootloader device found in {}",
                spec.family,
                args.sysfs.display()
            );
            eprintln!("qmkui-flash: {}", spec.entry);
            return Ok(3);
        }
        [only] => only.clone(),
        many => {
            eprintln!(
                "qmkui-flash: {} {} bootloader devices found; disconnect all but the target:",
                many.len(),
                spec.family
            );
            for device in many {
                eprintln!(
                    "  {}:{} at {}",
                    device.identity.vendor_id,
                    device.identity.product_id,
                    device.sysfs_path.display()
                );
            }
            return Ok(3);
        }
    };
    println!(
        "detected {} bootloader at {}:{} ({})",
        spec.family,
        detected.identity.vendor_id,
        detected.identity.product_id,
        detected.sysfs_path.display()
    );

    let digest = args.digest.clone().unwrap_or_else(|| sha256.clone());
    let request = FlashRequest {
        target: qmkui_flash::FlashTarget {
            project_digest: digest.clone(),
            firmware_sha256: sha256.clone(),
            qmk_keyboard: args.keyboard.clone(),
            bootloader: spec.family.to_owned(),
        },
        expected_device: detected.identity.clone(),
        operator_confirmed: true,
    };
    if let qmkui_flash::PolicyVerdict::Blocked { reason } =
        assess_target(&request, Some(&detected.identity), Some(spec.family))
    {
        eprintln!("qmkui-flash: blocked: {reason}");
        eprintln!("recovery: {}", spec.recovery);
        return Ok(4);
    }

    let prepared = prepare_keymap(
        &QmkOutput {
            qmk_path: args.qmk_path,
            keyboard: args.keyboard.clone(),
            keymap: args.keymap.clone(),
        },
        &bytes,
    )?;
    println!("prepared {}", prepared.keymap_dir.display());
    if let Some(backup) = &prepared.backup_dir {
        println!("previous keymap kept at {}", backup.display());
    }

    let mut runner = SystemCommandRunner;
    let result = run_flash(
        &prepared,
        &request,
        &digest,
        Some(&detected.identity),
        Some(spec.family),
        &mut runner,
    );

    let mut log = vec![
        format!("target: {} ({})", args.keyboard, args.keymap),
        format!("bundle: {} sha256 {sha256}", args.bundle.display()),
        format!(
            "bootloader: {} at {}:{} ({})",
            spec.family,
            detected.identity.vendor_id,
            detected.identity.product_id,
            detected.sysfs_path.display()
        ),
    ];
    log.extend(result.log.iter().cloned());
    for line in &log {
        println!("{line}");
    }
    match retain_log(&args.log_dir, &log) {
        Ok(path) => println!("log kept at {}", path.display()),
        Err(error) => eprintln!("qmkui-flash: could not keep the log: {error}"),
    }

    match result.status {
        FlashStatus::Success => {
            println!(
                "flash complete. Unplug and reconnect, then test every key in QMKUI's Device view."
            );
            Ok(0)
        }
        FlashStatus::Failed | FlashStatus::Blocked => {
            eprintln!("qmkui-flash: flash did not complete.");
            eprintln!("recovery: {}", spec.recovery);
            Ok(4)
        }
    }
}

fn parse_args(
    mut args: impl Iterator<Item = String>,
) -> Result<Option<Args>, Box<dyn std::error::Error>> {
    let mut bundle = None;
    let mut qmk_path = None;
    let mut keyboard = None;
    let mut keymap = None;
    let mut bootloader = None;
    let mut digest = None;
    let mut sysfs = PathBuf::from("/sys/bus/usb/devices");
    let mut log_dir = default_log_dir();
    let mut confirm = None;
    let mut dry_run = false;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => return Ok(None),
            "--dry-run" => dry_run = true,
            "--confirm" => confirm = Some(value(&mut args, &arg)?),
            "--bundle" => bundle = Some(PathBuf::from(value(&mut args, &arg)?)),
            "--qmk-path" => qmk_path = Some(PathBuf::from(value(&mut args, &arg)?)),
            "--keyboard" => keyboard = Some(value(&mut args, &arg)?),
            "--keymap" => keymap = Some(value(&mut args, &arg)?),
            "--bootloader" => bootloader = Some(value(&mut args, &arg)?),
            "--digest" => digest = Some(value(&mut args, &arg)?),
            "--sysfs" => sysfs = PathBuf::from(value(&mut args, &arg)?),
            "--log-dir" => log_dir = PathBuf::from(value(&mut args, &arg)?),
            other => return Err(format!("unknown argument {other:?}; use --help").into()),
        }
    }

    Ok(Some(Args {
        bundle: bundle.ok_or("--bundle is required")?,
        qmk_path: qmk_path.ok_or("--qmk-path is required")?,
        keyboard: keyboard.ok_or("--keyboard is required")?,
        keymap: keymap.ok_or("--keymap is required")?,
        bootloader: bootloader.ok_or("--bootloader is required")?,
        digest,
        sysfs,
        log_dir,
        confirm,
        dry_run,
    }))
}

fn value(
    args: &mut impl Iterator<Item = String>,
    flag: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let value = args.next().ok_or_else(|| format!("{flag} needs a value"))?;
    if value.starts_with('-') {
        return Err(format!("{flag} needs a value, not {value:?}").into());
    }
    Ok(value)
}

fn default_log_dir() -> PathBuf {
    if let Some(state) = env::var_os("XDG_STATE_HOME") {
        return PathBuf::from(state).join("qmkui");
    }
    if let Some(home) = env::var_os("HOME") {
        return PathBuf::from(home).join(".local/state/qmkui");
    }
    env::temp_dir().join("qmkui")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(values: &[&str]) -> Result<Option<Args>, Box<dyn std::error::Error>> {
        parse_args(values.iter().map(|value| (*value).to_owned()))
    }

    fn base() -> Vec<&'static str> {
        vec![
            "--bundle",
            "bundle.zip",
            "--qmk-path",
            "/tmp/qmk",
            "--keyboard",
            "keychron/v5_max/ansi_encoder",
            "--keymap",
            "qmkui_test",
            "--bootloader",
            "stm32-dfu",
        ]
    }

    #[test]
    fn requires_the_target_flags() {
        assert!(parse(&["--bundle", "x.zip"]).is_err());
        assert!(parse(&base()).is_ok());
    }

    #[test]
    fn confirmation_names_the_keyboard() {
        let mut values = base();
        values.extend(["--confirm", "keychron/v5_max/ansi_encoder"]);
        let args = parse(&values).unwrap().unwrap();
        assert_eq!(
            args.confirm.as_deref(),
            Some("keychron/v5_max/ansi_encoder")
        );
    }

    #[test]
    fn rejects_a_flag_as_a_value() {
        let mut values = base();
        values.extend(["--confirm", "--dry-run"]);
        assert!(parse(&values).is_err());
    }
}
