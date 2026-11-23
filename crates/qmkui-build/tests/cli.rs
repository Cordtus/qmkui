use std::process::Command;

#[test]
fn plans_and_stages_the_example_project() {
    let out = std::env::temp_dir().join(format!(
        "qmkui-build-cli-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let output = Command::new(env!("CARGO_BIN_EXE_qmkui-build"))
        .args([
            "--project",
            "../../fixtures/projects/example-60.json",
            "--out",
            out.to_str().unwrap(),
        ])
        .output()
        .expect("runs qmkui-build");

    assert!(output.status.success(), "{output:?}");
    let plan: serde_json::Value = serde_json::from_slice(&output.stdout).expect("prints plan JSON");
    assert_eq!(plan["qmkKeyboard"], "example/keyboard");
    let keymap = std::fs::read_to_string(out.join("keymap.json")).expect("stages keymap");
    assert!(keymap.contains("\"layout\":\"LAYOUT\""));
    std::fs::remove_dir_all(out).ok();
}
