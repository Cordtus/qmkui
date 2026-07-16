use qmkui_core::{
    export_qmk_keymap, validate_project, KeyboardProject, LayoutContract, ValidationStatus,
};

fn example_project() -> KeyboardProject {
    serde_json::from_str(include_str!("../../../fixtures/projects/example-60.json"))
        .expect("example project fixture parses")
}

fn example_layout() -> LayoutContract {
    LayoutContract::for_keyboard_layout(
        "example/keyboard",
        "example/keyboard",
        "LAYOUT",
        "LAYOUT",
        vec!["k00".into(), "k01".into(), "k02".into()],
    )
}

#[test]
fn valid_project_round_trips_to_qmk_json() {
    let project = example_project();
    let layout = example_layout();

    let report = validate_project(&project, &layout);
    let exported = export_qmk_keymap(&project, &layout).expect("project exports");

    assert_eq!(report.status, ValidationStatus::Valid);
    assert_eq!(exported.layers[0], vec!["KC_ESC", "KC_A", "MO(1)"]);
}

#[test]
fn missing_layer_reference_blocks_build_readiness() {
    let mut project = example_project();
    project.layers.truncate(1);
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "assignment.layerReference.missing"));
}

#[test]
fn assignment_count_mismatch_is_reported_before_export() {
    let mut project = example_project();
    project.layers[1].assignments.pop();
    let layout = example_layout();

    let report = validate_project(&project, &layout);
    let export = export_qmk_keymap(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "layer.assignmentCount.mismatch"));
    assert!(export.is_err());
}

#[test]
fn visual_key_mismatch_is_reported_before_export() {
    let mut project = example_project();
    project.layers[0].assignments[0].visual_key_id = "ghost".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);
    let export = export_qmk_keymap(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "assignment.visualKey.unknown"));
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "assignment.visualKey.missing"));
    assert!(export.is_err());
}

#[test]
fn base_layer_zero_is_required() {
    let mut project = example_project();
    project.layers.remove(0);
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "layer.base.missing"));
}

#[test]
fn common_qmk_layer_wrappers_are_validated() {
    let mut project = example_project();
    project.layers[0].assignments[2].qmk = "TT(9)".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "assignment.layerReference.missing"));
}

#[test]
fn unsupported_schema_version_blocks_build_readiness() {
    let mut project = example_project();
    project.schema_version = "9.9.9".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "project.schemaVersion.unsupported"));
}

#[test]
fn layout_target_mismatch_blocks_export_readiness() {
    let mut project = example_project();
    project.target.qmk_layout_macro = "LAYOUT_split_bs".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "target.qmkLayoutMacro.mismatch"));
}

#[test]
fn invalid_keymap_name_blocks_export_readiness() {
    let mut project = example_project();
    project.build.keymap_name = "bad keymap".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "build.keymapName.invalid"));
}

#[test]
fn keyboard_target_mismatch_blocks_export_readiness() {
    let mut project = example_project();
    project.target.qmk_keyboard = "wrong/keyboard".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "target.qmkKeyboard.mismatch"));
}

#[test]
fn keyboard_id_mismatch_blocks_export_readiness() {
    let mut project = example_project();
    project.target.keyboard_id = "wrong/keyboard".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "target.keyboardId.mismatch"));
}

#[test]
fn layout_id_mismatch_blocks_export_readiness() {
    let mut project = example_project();
    project.target.layout_id = "LAYOUT_ortho".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "target.layoutId.mismatch"));
}

#[test]
fn sparse_layer_indexes_block_json_export_readiness() {
    let mut project = example_project();
    project.layers[1].index = 2;
    project.layers[0].assignments[2].qmk = "MO(2)".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "layer.index.sparse"));
}

#[test]
fn malformed_extra_layer_wrapper_args_block_export_readiness() {
    let mut project = example_project();
    project.layers[0].assignments[2].qmk = "LT(1, KC_A, KC_B)".to_owned();
    let layout = example_layout();

    let report = validate_project(&project, &layout);

    assert_eq!(report.status, ValidationStatus::Errors);
    assert!(report
        .issues
        .iter()
        .any(|issue| issue.code == "assignment.layerReference.malformed"));
}

#[test]
fn validation_report_serializes_context() {
    let project = example_project();
    let layout = example_layout();

    let report = validate_project(&project, &layout);
    let serialized = serde_json::to_value(report).expect("report serializes");

    assert_eq!(serialized["context"]["projectId"], "proj_example_60");
    assert_eq!(serialized["context"]["keyboardTarget"], "example/keyboard");
    assert_eq!(serialized["context"]["layoutMacro"], "LAYOUT");
    assert!(serialized["checkedAt"]
        .as_str()
        .is_some_and(|value| value.starts_with("unix-ms:")));
}
