use std::process::Command;

#[test]
fn check_mode_ingests_and_validates_the_fixture_checkout() {
    let output = Command::new(env!("CARGO_BIN_EXE_ingest"))
        .args(["--qmk-path", "../../fixtures/qmk", "--check"])
        .output()
        .expect("runs catalog ingest");
    assert!(output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stdout).contains("Validated 2 ingested boards"));
}

#[test]
fn validate_mode_accepts_the_checked_in_catalog() {
    let output = Command::new(env!("CARGO_BIN_EXE_ingest"))
        .args(["--validate", "../../fixtures/catalog/keyboards.json"])
        .output()
        .expect("runs catalog validation");
    assert!(output.status.success(), "{output:?}");
    assert!(String::from_utf8_lossy(&output.stdout).contains("Validated 1 boards"));
}
