//! Gated `qmk flash` adapter.
//!
//! The only path to a real flash: a policy-verified request, a bundle that
//! parses and checksums, a keymap prepared inside the QMK tree, and an
//! explicitly confirmed operator. The command runner is injectable so tests
//! never invoke QMK.

use crate::bundle::read_bundle;
use crate::policy::{assess_request, PolicyVerdict};
use crate::request::{DeviceIdentity, FlashRequest, FlashResult, FlashStatus};
use crate::FlashError;
use qmkui_build::artifact::hex_sha256;
use qmkui_build::runner::{CommandPlan, CommandRunner};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct QmkOutput {
    pub qmk_path: PathBuf,
    pub keyboard: String,
    pub keymap: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedFlash {
    pub keymap_dir: PathBuf,
    pub backup_dir: Option<PathBuf>,
    pub files: Vec<String>,
    /// sha256 of the bundle that produced these files.
    pub sha256: String,
    pub command: CommandPlan,
}

/// Extracts the bundle into `<qmk>/keyboards/<keyboard>/keymaps/<keymap>/`.
/// Staging and backups live under `<qmk>/.qmkui/` so QMK never lists them; an
/// existing keymap directory is moved aside, never deleted.
pub fn prepare_keymap(output: &QmkOutput, bundle: &[u8]) -> Result<PreparedFlash, FlashError> {
    validate_keyboard(&output.keyboard)?;
    validate_component("keymap", &output.keymap)?;

    let files = read_bundle(bundle)?;
    let readme = files
        .iter()
        .find(|file| file.name == "README.md")
        .ok_or_else(|| FlashError::InvalidBundle("bundle has no README.md".to_owned()))?;
    let readme = std::str::from_utf8(&readme.contents)
        .map_err(|_| FlashError::InvalidBundle("bundle README is not UTF-8".to_owned()))?;
    let target = readme
        .lines()
        .find_map(|line| {
            let start = line.find("-kb ")?;
            line[start + 4..].split_whitespace().next()
        })
        .ok_or_else(|| FlashError::InvalidBundle("bundle README has no -kb target".to_owned()))?;
    if target != output.keyboard {
        return Err(FlashError::InvalidTarget(format!(
            "bundle targets {target}, not {}",
            output.keyboard
        )));
    }

    let keymaps = output
        .qmk_path
        .join("keyboards")
        .join(&output.keyboard)
        .join("keymaps");
    let target = keymaps.join(&output.keymap);
    let stamp = stamp();
    let work = output.qmk_path.join(".qmkui");
    let staging_root = work.join("staging");
    let backups = work.join("backups");

    if !output
        .qmk_path
        .join("keyboards")
        .join(&output.keyboard)
        .is_dir()
    {
        return Err(FlashError::InvalidTarget(format!(
            "{} is not a keyboard in this QMK checkout",
            output.keyboard
        )));
    }
    fs::create_dir_all(&keymaps)?;
    fs::create_dir_all(&staging_root)?;
    fs::create_dir_all(&backups)?;
    let staging = staging_root.join(format!("{}-{stamp}", output.keymap));
    fs::create_dir(&staging)?;
    for file in &files {
        if let Err(error) = fs::write(staging.join(&file.name), &file.contents) {
            fs::remove_dir_all(&staging).ok();
            return Err(error.into());
        }
    }

    let backup_dir = if target.exists() {
        let backup = backups.join(format!("{}-{stamp}", output.keymap));
        if let Err(error) = fs::rename(&target, &backup) {
            fs::remove_dir_all(&staging).ok();
            return Err(error.into());
        }
        Some(backup)
    } else {
        None
    };

    if let Err(error) = fs::rename(&staging, &target) {
        fs::remove_dir_all(&staging).ok();
        if let Some(backup) = &backup_dir {
            if let Err(restore) = fs::rename(backup, &target) {
                return Err(FlashError::InvalidTarget(format!(
                    "could not restore the previous keymap; it is at {}: {restore}",
                    backup.display()
                )));
            }
        }
        return Err(error.into());
    }

    Ok(PreparedFlash {
        keymap_dir: target,
        backup_dir,
        files: files.into_iter().map(|file| file.name).collect(),
        sha256: hex_sha256(bundle),
        command: CommandPlan {
            program: "qmk".to_owned(),
            args: vec![
                "flash".to_owned(),
                "-kb".to_owned(),
                output.keyboard.clone(),
                "-km".to_owned(),
                output.keymap.clone(),
            ],
            cwd: Some(output.qmk_path.display().to_string()),
        },
    })
}

/// Runs the prepared command after re-assessing the policy. A blocked request
/// never reaches the runner. This is the blocking fallback for non-interactive
/// CLI runs and library/test callers; use [`crate::events::run_flash_session`]
/// when output streaming or cancellation is needed.
pub fn run_flash<R: CommandRunner>(
    prepared: &PreparedFlash,
    request: &FlashRequest,
    current_project_digest: Option<&str>,
    detected_device: Option<&DeviceIdentity>,
    detected_bootloader: Option<&str>,
    runner: &mut R,
) -> FlashResult {
    if let Some(blocked) = preflight(
        prepared,
        request,
        current_project_digest,
        detected_device,
        detected_bootloader,
    ) {
        return blocked;
    }

    let mut log = vec![format!(
        "running {} {} (cwd {})",
        prepared.command.program,
        prepared.command.args.join(" "),
        prepared.command.cwd.as_deref().unwrap_or(".")
    )];

    match runner.run(&prepared.command) {
        Ok(result) => {
            log.extend(result.stdout.lines().map(|line| format!("out  {line}")));
            log.extend(result.stderr.lines().map(|line| format!("err  {line}")));
            let status = match result.exit_code {
                Some(0) => FlashStatus::Success,
                code => {
                    log.push(match code {
                        Some(code) => format!("qmk flash exited with code {code}"),
                        None => "qmk flash was terminated by a signal".to_owned(),
                    });
                    FlashStatus::Failed
                }
            };
            FlashResult { status, log }
        }
        Err(error) => FlashResult {
            status: FlashStatus::Failed,
            log: vec![format!("could not start qmk: {error}")],
        },
    }
}

/// Policy and staged-digest gate shared by the blocking and streamed paths.
pub(crate) fn preflight(
    prepared: &PreparedFlash,
    request: &FlashRequest,
    current_project_digest: Option<&str>,
    detected_device: Option<&DeviceIdentity>,
    detected_bootloader: Option<&str>,
) -> Option<FlashResult> {
    let verdict = match current_project_digest {
        Some(digest) => assess_request(request, digest, detected_device, detected_bootloader),
        None => crate::policy::assess_target(request, detected_device, detected_bootloader),
    };
    if let PolicyVerdict::Blocked { reason } = verdict {
        return Some(blocked_result(prepared, reason));
    }
    if prepared.sha256 != request.target.firmware_sha256 {
        return Some(blocked_result(
            prepared,
            "Staged files do not match the request digest.".to_owned(),
        ));
    }
    None
}

/// Rolls a blocked request back: removes the staged keymap and restores the
/// previous directory. A flash failure keeps the staged keymap for retry.
pub(crate) fn blocked_result(prepared: &PreparedFlash, reason: String) -> FlashResult {
    let mut log = vec![reason];
    match &prepared.backup_dir {
        Some(backup) => {
            fs::remove_dir_all(&prepared.keymap_dir).ok();
            match fs::rename(backup, &prepared.keymap_dir) {
                Ok(()) => log.push(format!(
                    "restored the previous keymap at {}",
                    prepared.keymap_dir.display()
                )),
                Err(error) => log.push(format!(
                    "could not restore the previous keymap; it is at {}: {error}",
                    backup.display()
                )),
            }
        }
        None => {
            fs::remove_dir_all(&prepared.keymap_dir).ok();
            log.push("removed the staged keymap".to_owned());
        }
    }
    FlashResult {
        status: FlashStatus::Blocked,
        log,
    }
}

/// Writes the run log next to the operator's state directory, returning the
/// path. Failed runs keep their log; successful runs keep one too.
pub fn retain_log(directory: &Path, log: &[String]) -> std::io::Result<PathBuf> {
    fs::create_dir_all(directory)?;
    let path = directory.join(format!("flash-{}-{}.log", stamp(), std::process::id()));
    fs::write(&path, log.join("\n") + "\n")?;
    Ok(path)
}

fn validate_keyboard(keyboard: &str) -> Result<(), FlashError> {
    for part in keyboard.split('/') {
        validate_component("keyboard", part)?;
    }
    Ok(())
}

fn validate_component(kind: &str, value: &str) -> Result<(), FlashError> {
    let valid = !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'));
    if valid {
        Ok(())
    } else {
        Err(FlashError::InvalidTarget(format!(
            "{kind} name {value:?} may only contain letters, digits, '_' and '-'"
        )))
    }
}

fn stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bundle::tests::stored_zip;
    use crate::request::FlashTarget;
    use qmkui_build::runner::CommandResult;

    struct FakeRunner {
        result: Result<CommandResult, std::io::Error>,
        seen: Vec<CommandPlan>,
    }

    impl FakeRunner {
        fn ok() -> Self {
            Self {
                result: Ok(CommandResult {
                    stdout: "compiled\nflashed\n".to_owned(),
                    stderr: String::new(),
                    exit_code: Some(0),
                    duration_ms: 1,
                }),
                seen: Vec::new(),
            }
        }
    }

    impl CommandRunner for FakeRunner {
        fn run(&mut self, plan: &CommandPlan) -> std::io::Result<CommandResult> {
            self.seen.push(plan.clone());
            match &self.result {
                Ok(result) => Ok(result.clone()),
                Err(error) => Err(std::io::Error::new(error.kind(), error.to_string())),
            }
        }
    }

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("qmkui-flash-{name}-{}", stamp()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn bundle() -> Vec<u8> {
        stored_zip(
            &[
                ("keymap.c", b"// keymap\n"),
                ("qmkui-lighting-rules.c", b"// rules\n"),
                (
                    "README.md",
                    b"qmk flash -kb keychron/v5_max/ansi_encoder -km qmkui_test\n",
                ),
            ],
            false,
        )
    }

    fn output(root: &Path) -> QmkOutput {
        fs::create_dir_all(root.join("keyboards/keychron/v5_max/ansi_encoder")).unwrap();
        QmkOutput {
            qmk_path: root.to_path_buf(),
            keyboard: "keychron/v5_max/ansi_encoder".to_owned(),
            keymap: "qmkui_test".to_owned(),
        }
    }

    fn request(digest: &str, confirmed: bool) -> FlashRequest {
        FlashRequest {
            target: FlashTarget {
                project_digest: digest.to_owned(),
                firmware_sha256: "sha".to_owned(),
                qmk_keyboard: "keychron/v5_max/ansi_encoder".to_owned(),
                bootloader: "stm32-dfu".to_owned(),
            },
            expected_device: DeviceIdentity {
                vendor_id: "0483".to_owned(),
                product_id: "df11".to_owned(),
            },
            operator_confirmed: confirmed,
        }
    }

    #[test]
    fn prepares_the_keymap_and_builds_the_qmk_command() {
        let root = temp_root("prepare");
        let prepared = prepare_keymap(&output(&root), &bundle()).unwrap();

        assert_eq!(
            prepared.keymap_dir,
            root.join("keyboards/keychron/v5_max/ansi_encoder/keymaps/qmkui_test")
        );
        assert_eq!(
            fs::read(prepared.keymap_dir.join("keymap.c")).unwrap(),
            b"// keymap\n"
        );
        assert_eq!(
            prepared.command.args,
            [
                "flash",
                "-kb",
                "keychron/v5_max/ansi_encoder",
                "-km",
                "qmkui_test"
            ]
        );
        assert_eq!(prepared.files.len(), 3);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn backs_up_an_existing_keymap() {
        let root = temp_root("backup");
        let target = root.join("keyboards/keychron/v5_max/ansi_encoder/keymaps/qmkui_test");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("keymap.c"), "old").unwrap();

        let prepared = prepare_keymap(&output(&root), &bundle()).unwrap();
        let backup = prepared.backup_dir.expect("backup");
        assert!(backup.starts_with(root.join(".qmkui/backups")));
        assert_eq!(fs::read(backup.join("keymap.c")).unwrap(), b"old");
        assert_eq!(
            fs::read(prepared.keymap_dir.join("keymap.c")).unwrap(),
            b"// keymap\n"
        );
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_unsafe_targets() {
        let root = temp_root("unsafe");
        let mut output = output(&root);
        output.keymap = "../escape".to_owned();
        assert!(prepare_keymap(&output, &bundle()).is_err());
        output.keymap = "ok".to_owned();
        output.keyboard = "no-slash".to_owned();
        assert!(prepare_keymap(&output, &bundle()).is_err());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn blocked_requests_never_reach_the_runner() {
        let root = temp_root("blocked");
        let prepared = prepare_keymap(&output(&root), &bundle()).unwrap();
        let mut runner = FakeRunner::ok();
        let result = run_flash(
            &prepared,
            &request("old", true),
            Some("current"),
            None,
            Some("stm32-dfu"),
            &mut runner,
        );
        assert_eq!(result.status, FlashStatus::Blocked);
        assert!(runner.seen.is_empty());
        assert!(!prepared.keymap_dir.exists());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn runs_and_reports_a_failed_flash() {
        let root = temp_root("failed");
        let prepared = prepare_keymap(&output(&root), &bundle()).unwrap();
        let mut runner = FakeRunner {
            result: Ok(CommandResult {
                stdout: String::new(),
                stderr: "no device\n".to_owned(),
                exit_code: Some(1),
                duration_ms: 1,
            }),
            seen: Vec::new(),
        };
        let mut request = request("same", true);
        request.target.firmware_sha256 = prepared.sha256.clone();
        let result = run_flash(
            &prepared,
            &request,
            Some("same"),
            Some(&request.expected_device),
            Some("stm32-dfu"),
            &mut runner,
        );
        assert_eq!(result.status, FlashStatus::Failed);
        assert!(result.log.iter().any(|line| line.contains("no device")));
        assert_eq!(runner.seen.len(), 1);

        let log = retain_log(&root.join("logs"), &result.log).unwrap();
        assert!(fs::read_to_string(log).unwrap().contains("no device"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn refuses_a_bundle_built_for_another_keyboard() {
        let root = temp_root("wrong-board");
        let other = stored_zip(
            &[
                ("keymap.c", b"// other\n"),
                ("README.md", b"qmk flash -kb example/other -km qmkui_test\n"),
            ],
            false,
        );
        let error = prepare_keymap(&output(&root), &other).unwrap_err();
        assert!(error.to_string().contains("targets example/other"));
        assert!(!root.join(".qmkui").exists());
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn refuses_a_bundle_that_does_not_match_the_request_digest() {
        let root = temp_root("digest");
        let target = root.join("keyboards/keychron/v5_max/ansi_encoder/keymaps/qmkui_test");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("keymap.c"), "old").unwrap();
        let prepared = prepare_keymap(&output(&root), &bundle()).unwrap();
        let mut runner = FakeRunner::ok();
        let request = request("same", true);
        let result = run_flash(
            &prepared,
            &request,
            Some("same"),
            Some(&request.expected_device),
            Some("stm32-dfu"),
            &mut runner,
        );
        assert_eq!(result.status, FlashStatus::Blocked);
        assert!(result.log.iter().any(|line| line.contains("digest")));
        assert!(runner.seen.is_empty());
        assert_eq!(
            fs::read(prepared.keymap_dir.join("keymap.c")).unwrap(),
            b"old"
        );
        fs::remove_dir_all(&root).ok();
    }
}
