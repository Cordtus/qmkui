use crate::artifact::hex_sha256;
use qmkui_core::model::{KeyboardProject, OutputPreference};
use qmkui_core::validation::{IssueSeverity, ValidationReport, ValidationStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Readiness {
    Ready,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildPlan {
    pub project_digest: String,
    pub qmk_keyboard: String,
    pub keymap_name: String,
    pub output_preference: OutputPreference,
    pub readiness: Readiness,
    pub blockers: Vec<String>,
    pub commands: Vec<String>,
}

/// A canonical sha256 hex digest over the serialized project — the identifier
/// that drives artifact staleness.
pub fn project_digest(project: &KeyboardProject) -> Result<String, serde_json::Error> {
    let serialized = serde_json::to_vec(project)?;
    Ok(hex_sha256(&serialized))
}

/// Builds a readiness plan from a validated project. Blockers are critical or
/// error validation issues plus a missing local `qmk` toolchain.
pub fn plan_build(
    project: &KeyboardProject,
    validation: &ValidationReport,
    qmk_available: bool,
) -> Result<BuildPlan, serde_json::Error> {
    let mut blockers: Vec<String> = validation
        .issues
        .iter()
        .filter(|issue| {
            matches!(
                issue.severity,
                IssueSeverity::Error | IssueSeverity::Critical
            )
        })
        .map(|issue| issue.title.clone())
        .collect();
    if !qmk_available {
        blockers.push("qmk CLI is not installed".to_owned());
    }
    let readiness = if blockers.is_empty()
        && matches!(
            validation.status,
            ValidationStatus::Valid | ValidationStatus::Warnings
        ) {
        Readiness::Ready
    } else {
        Readiness::Blocked
    };

    let digest = project_digest(project)?;
    let command = format!(
        "qmk compile -kb {} -km {}",
        project.target.qmk_keyboard, project.build.keymap_name
    );
    Ok(BuildPlan {
        project_digest: digest,
        qmk_keyboard: project.target.qmk_keyboard.clone(),
        keymap_name: project.build.keymap_name.clone(),
        output_preference: project.build.output_preference.clone(),
        readiness,
        blockers,
        commands: vec![command],
    })
}
