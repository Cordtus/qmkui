use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn unique_dir(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "qmkui-build-cli-{label}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}

fn fake_qmk_path() -> PathBuf {
    let bin = unique_dir("bin");
    fs::create_dir_all(&bin).unwrap();
    let qmk = bin.join("qmk");
    fs::write(&qmk, "#!/bin/sh\nexit 0\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&qmk, fs::Permissions::from_mode(0o755)).unwrap();
    }
    bin
}

fn run(args: &[&str], path: &Path) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_qmkui-build"))
        .args(args)
        .env("PATH", path)
        .output()
        .expect("runs qmkui-build")
}

#[test]
fn plans_and_stages_the_example_project() {
    let out = unique_dir("out");
    let path = fake_qmk_path();
    let output = run(
        &[
            "--project",
            "../../fixtures/projects/example-60.json",
            "--out",
            out.to_str().unwrap(),
        ],
        &path,
    );

    assert!(output.status.success(), "{output:?}");
    let plan: serde_json::Value = serde_json::from_slice(&output.stdout).expect("prints plan JSON");
    assert_eq!(plan["qmkKeyboard"], "example/keyboard");
    let keymap = fs::read_to_string(out.join("keymap.json")).expect("stages keymap");
    assert!(keymap.contains("\"layout\":\"LAYOUT\""));
    fs::remove_dir_all(out).ok();
}

#[test]
fn stores_an_artifact_after_staging() {
    let out = unique_dir("store-out");
    let store = unique_dir("store");
    let firmware = unique_dir("firmware");
    fs::create_dir_all(&firmware).unwrap();
    let firmware_path = firmware.join("firmware.bin");
    fs::write(&firmware_path, b"fake firmware").unwrap();
    let path = fake_qmk_path();
    let output = run(
        &[
            "--project",
            "../../fixtures/projects/example-60.json",
            "--out",
            out.to_str().unwrap(),
            "--firmware",
            firmware_path.to_str().unwrap(),
            "--store",
            store.to_str().unwrap(),
        ],
        &path,
    );

    assert!(output.status.success(), "{output:?}");
    let records: Vec<_> = fs::read_dir(&store)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(records.len(), 1);
    assert!(records[0].join("meta.json").is_file());
    fs::remove_dir_all(out).ok();
    fs::remove_dir_all(store).ok();
    fs::remove_dir_all(firmware).ok();
    fs::remove_dir_all(path).ok();
}

#[test]
fn check_mode_exits_three_when_qmk_is_missing() {
    let path = unique_dir("empty-bin");
    fs::create_dir_all(&path).unwrap();
    let output = run(
        &[
            "--project",
            "../../fixtures/projects/example-60.json",
            "--check",
        ],
        &path,
    );

    assert_eq!(output.status.code(), Some(3), "{output:?}");
    fs::remove_dir_all(path).ok();
}

#[test]
fn refuses_to_stage_a_blocked_project() {
    let out = unique_dir("blocked");
    let path = unique_dir("empty-blocked-bin");
    fs::create_dir_all(&path).unwrap();
    let output = run(
        &[
            "--project",
            "../../fixtures/projects/example-60.json",
            "--out",
            out.to_str().unwrap(),
        ],
        &path,
    );

    assert!(!output.status.success(), "{output:?}");
    assert!(!out.exists());
    fs::remove_dir_all(path).ok();
}

#[test]
fn refuses_to_replace_an_unrelated_output_directory() {
    let out = unique_dir("unrelated");
    fs::create_dir_all(&out).unwrap();
    fs::write(out.join("notes.txt"), "keep me").unwrap();
    let path = fake_qmk_path();
    let output = run(
        &[
            "--project",
            "../../fixtures/projects/example-60.json",
            "--out",
            out.to_str().unwrap(),
        ],
        &path,
    );

    assert!(!output.status.success(), "{output:?}");
    assert_eq!(
        fs::read_to_string(out.join("notes.txt")).unwrap(),
        "keep me"
    );
    fs::remove_dir_all(out).ok();
    fs::remove_dir_all(path).ok();
}
