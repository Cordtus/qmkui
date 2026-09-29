use qmkui_build::{
    artifact::{command_log, ArtifactInput, ArtifactStore},
    plan::{plan_build, project_digest, Readiness},
    runner::{CommandPlan, CommandResult, CommandRunner},
    stage_json_project,
};
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

struct FixtureRunner {
    plans: Vec<CommandPlan>,
}

impl CommandRunner for FixtureRunner {
    fn run(&mut self, plan: &CommandPlan) -> std::io::Result<CommandResult> {
        self.plans.push(plan.clone());
        Ok(CommandResult {
            stdout: "compiled".into(),
            stderr: String::new(),
            exit_code: Some(0),
            duration_ms: 12,
        })
    }
}

#[test]
fn plans_a_ready_build_when_qmk_is_available() {
    let project = example_project();
    let report = validate_project(&project, &example_layout());

    let plan = plan_build(&project, &report, true).expect("plans");

    assert_eq!(plan.readiness, Readiness::Ready);
    assert!(plan.blockers.is_empty());
    assert_eq!(plan.qmk_keyboard, "example/keyboard");
    assert_eq!(
        plan.project_digest,
        project_digest(&project).expect("digest")
    );
}

#[test]
fn blocks_when_qmk_is_missing() {
    let project = example_project();
    let report = validate_project(&project, &example_layout());

    let plan = plan_build(&project, &report, false).expect("plans");

    assert_eq!(plan.readiness, Readiness::Blocked);
    assert!(plan
        .blockers
        .iter()
        .any(|blocker| blocker.contains("qmk CLI")));
}

#[test]
fn blocks_on_validation_errors() {
    let mut project = example_project();
    project.layers.truncate(1);
    let report = validate_project(&project, &example_layout());
    assert_eq!(report.status, ValidationStatus::Errors);

    let plan = plan_build(&project, &report, true).expect("plans");

    assert_eq!(plan.readiness, Readiness::Blocked);
    assert!(!plan.blockers.is_empty());
}

#[test]
fn runner_records_command_plans() {
    let mut runner = FixtureRunner { plans: Vec::new() };
    let result = runner
        .run(&CommandPlan {
            program: "qmk".into(),
            args: vec!["compile".into()],
            cwd: None,
        })
        .expect("runs");
    assert_eq!(result.exit_code, Some(0));
    assert_eq!(runner.plans.len(), 1);
    assert!(command_log(&runner.plans[0], &result).contains("$ qmk compile"));
}

#[test]
fn stages_exported_keymap_json() {
    let project = example_project();
    let layout = example_layout();
    let export = export_qmk_keymap(&project, &layout).expect("exports");
    let dir = std::env::temp_dir().join(format!("qmkui-staging-{}", std::process::id()));

    let path = stage_json_project(&dir, &export).expect("stages");

    let staged: qmkui_core::qmk_json::QmkKeymapJson =
        serde_json::from_slice(&std::fs::read(&path).expect("read")).expect("parses");
    assert_eq!(staged.keyboard, "example/keyboard");
    assert_eq!(staged.layers[0], vec!["KC_ESC", "KC_A", "MO(1)"]);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn artifact_store_is_content_addressed_and_immutable() {
    let dir = std::env::temp_dir().join(format!("qmkui-artifacts-{}", std::process::id()));
    let store = ArtifactStore::new(dir.clone());
    let digest_a = project_digest(&example_project()).expect("digest");

    let artifact = store
        .store(ArtifactInput {
            firmware: b"firmware-bytes".to_vec(),
            keymap_json: br#"{"keyboard":"example/keyboard"}"#.to_vec(),
            log: "build log".into(),
            project_digest: digest_a.clone(),
            qmk_keyboard: "example/keyboard".into(),
            qmk_version: Some("0.28.0".into()),
            catalog_version: Some("keychron-qmk-b4bdf3f1".into()),
            created_at: "2026-08-11T00:00:00.000Z".into(),
        })
        .expect("stores");

    // Content-addressed: re-storing identical input returns the same artifact
    // without duplicating files.
    let again = store
        .store(ArtifactInput {
            firmware: b"firmware-bytes".to_vec(),
            keymap_json: br#"{"keyboard":"example/keyboard"}"#.to_vec(),
            log: "build log".into(),
            project_digest: digest_a.clone(),
            qmk_keyboard: "example/keyboard".into(),
            qmk_version: Some("0.28.0".into()),
            catalog_version: Some("keychron-qmk-b4bdf3f1".into()),
            created_at: "2026-08-11T00:00:00.000Z".into(),
        })
        .expect("stores again");
    assert_eq!(again.id, artifact.id);

    assert_eq!(
        std::fs::read(dir.join(&artifact.id).join("firmware")).expect("firmware"),
        b"firmware-bytes"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
