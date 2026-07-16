use crate::model::{AssignmentKind, BuildMode, KeyboardProject, LayoutContract};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::time::{SystemTime, UNIX_EPOCH};

const SUPPORTED_SCHEMA_VERSIONS: &[&str] = &["0.1.0"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IssueSeverity {
    Info,
    Warning,
    Error,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub code: String,
    pub severity: IssueSeverity,
    pub title: String,
    pub message: String,
    pub path: String,
    #[serde(default)]
    pub remediation: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub checked_at: String,
    pub context: ValidationContext,
    pub status: ValidationStatus,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationContext {
    pub project_id: String,
    pub keyboard_target: String,
    pub layout_id: String,
    pub layout_macro: String,
    pub build_mode: BuildMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationStatus {
    Valid,
    Warnings,
    Errors,
    Critical,
}

pub fn validate_project(project: &KeyboardProject, layout: &LayoutContract) -> ValidationReport {
    let mut issues = Vec::new();

    if project.schema_version.trim().is_empty() {
        issues.push(issue(
            "project.schemaVersion.empty",
            IssueSeverity::Error,
            "Schema version is missing",
            "The project cannot be migrated or validated without a schema version.",
            "schemaVersion",
            &["Set schemaVersion to the current app schema version."],
        ));
    } else if !SUPPORTED_SCHEMA_VERSIONS.contains(&project.schema_version.as_str()) {
        issues.push(issue(
            "project.schemaVersion.unsupported",
            IssueSeverity::Error,
            "Schema version is not supported",
            &format!(
                "{} is not supported by this QMKUI build.",
                project.schema_version
            ),
            "schemaVersion",
            &["Migrate the project before exporting or building."],
        ));
    }

    if project.target.qmk_keyboard.trim().is_empty() {
        issues.push(issue(
            "target.qmkKeyboard.empty",
            IssueSeverity::Error,
            "QMK keyboard target is missing",
            "The build service needs a QMK keyboard target before it can generate firmware.",
            "target.qmkKeyboard",
            &["Select a keyboard from the catalog."],
        ));
    }

    if project.target.keyboard_id.trim().is_empty() {
        issues.push(issue(
            "target.keyboardId.empty",
            IssueSeverity::Error,
            "Keyboard id is missing",
            "The selected catalog keyboard must be identified before export.",
            "target.keyboardId",
            &["Select a keyboard from the catalog."],
        ));
    }

    if let Some(expected_keyboard_id) = &layout.keyboard_id {
        if project.target.keyboard_id != *expected_keyboard_id {
            issues.push(issue(
                "target.keyboardId.mismatch",
                IssueSeverity::Error,
                "Keyboard id does not match the selected keyboard",
                &format!(
                    "Project targets {}, but the active layout contract belongs to {}.",
                    project.target.keyboard_id, expected_keyboard_id
                ),
                "target.keyboardId",
                &["Re-select the intended keyboard before exporting or building."],
            ));
        }
    }

    if let Some(expected_qmk_keyboard) = &layout.qmk_keyboard {
        if project.target.qmk_keyboard != *expected_qmk_keyboard {
            issues.push(issue(
                "target.qmkKeyboard.mismatch",
                IssueSeverity::Error,
                "QMK keyboard target does not match the selected keyboard",
                &format!(
                    "Project exports for {}, but the active layout contract belongs to {}.",
                    project.target.qmk_keyboard, expected_qmk_keyboard
                ),
                "target.qmkKeyboard",
                &["Update the project target from the selected catalog keyboard."],
            ));
        }
    }

    if project.target.layout_id.trim().is_empty() {
        issues.push(issue(
            "target.layoutId.empty",
            IssueSeverity::Error,
            "Layout id is missing",
            "The selected keyboard layout must be identified before export.",
            "target.layoutId",
            &["Select a layout from the keyboard definition."],
        ));
    }

    if let Some(expected_layout_id) = &layout.layout_id {
        if project.target.layout_id != *expected_layout_id {
            issues.push(issue(
                "target.layoutId.mismatch",
                IssueSeverity::Error,
                "Layout id does not match the selected layout",
                &format!(
                    "Project targets {}, but the active layout contract is {}.",
                    project.target.layout_id, expected_layout_id
                ),
                "target.layoutId",
                &["Re-select the intended layout before exporting or building."],
            ));
        }
    }

    if project.target.qmk_layout_macro.trim().is_empty() {
        issues.push(issue(
            "target.qmkLayoutMacro.empty",
            IssueSeverity::Error,
            "QMK layout macro is missing",
            "QMK JSON export needs the selected layout macro name.",
            "target.qmkLayoutMacro",
            &["Select a layout that has a QMK layout macro."],
        ));
    }

    if let Some(expected_layout_macro) = &layout.qmk_layout_macro {
        if project.target.qmk_layout_macro != *expected_layout_macro {
            issues.push(issue(
                "target.qmkLayoutMacro.mismatch",
                IssueSeverity::Error,
                "QMK layout macro does not match the selected layout",
                &format!(
                    "Project exports through {}, but the active layout contract uses {}.",
                    project.target.qmk_layout_macro, expected_layout_macro
                ),
                "target.qmkLayoutMacro",
                &["Update the project target from the selected catalog layout."],
            ));
        }
    }

    if project.build.keymap_name.trim().is_empty() {
        issues.push(issue(
            "build.keymapName.empty",
            IssueSeverity::Error,
            "Keymap name is missing",
            "QMK needs a keymap name for generated build artifacts.",
            "build.keymapName",
            &["Choose a keymap name before exporting or building."],
        ));
    } else if !is_valid_keymap_name(&project.build.keymap_name) {
        issues.push(issue(
            "build.keymapName.invalid",
            IssueSeverity::Error,
            "Keymap name is not QMK-safe",
            "Use letters, numbers, underscores, and hyphens only.",
            "build.keymapName",
            &["Rename the keymap before exporting or building."],
        ));
    }

    if project.layers.is_empty() {
        issues.push(issue(
            "layers.empty",
            IssueSeverity::Error,
            "Project has no layers",
            "A QMK keymap needs at least a base layer.",
            "layers",
            &["Create Layer 0 before exporting or building."],
        ));
    }

    let expected_visual_keys: BTreeSet<&str> =
        layout.visual_key_order.iter().map(String::as_str).collect();
    let mut seen_indexes = BTreeSet::new();
    let layer_indexes: BTreeSet<u8> = project.layers.iter().map(|layer| layer.index).collect();

    if !layer_indexes.contains(&0) {
        issues.push(issue(
            "layer.base.missing",
            IssueSeverity::Error,
            "Base layer is missing",
            "A QMK keymap must include Layer 0 before it can be exported or built.",
            "layers",
            &["Create an enabled Layer 0."],
        ));
    }

    if let Some(max_layer_index) = layer_indexes.iter().next_back().copied() {
        for expected_index in 0..=max_layer_index {
            if !layer_indexes.contains(&expected_index) {
                issues.push(issue(
                    "layer.index.sparse",
                    IssueSeverity::Error,
                    "Layer indexes are not contiguous",
                    &format!(
                        "Layer {} is missing, but a higher layer index is present.",
                        expected_index
                    ),
                    "layers",
                    &["Use contiguous layer indexes from 0 through the highest exported layer."],
                ));
            }
        }
    }

    for (layer_position, layer) in project.layers.iter().enumerate() {
        let layer_path = format!("layers[{layer_position}]");
        if !seen_indexes.insert(layer.index) {
            issues.push(issue(
                "layer.index.duplicate",
                IssueSeverity::Error,
                "Layer index is duplicated",
                "Layer indexes must be unique so layer-switch keycodes target a single layer.",
                &format!("{layer_path}.index"),
                &["Rename or reorder layers so each index is unique."],
            ));
        }

        if layer.index > 31 {
            issues.push(issue(
                "layer.index.range",
                IssueSeverity::Error,
                "Layer index exceeds QMK limit",
                "QMK layer indexes must be between 0 and 31.",
                &format!("{layer_path}.index"),
                &["Move this layer inside the supported layer range."],
            ));
        }

        if layer.index == 0 && !layer.enabled {
            issues.push(issue(
                "layer.base.disabled",
                IssueSeverity::Error,
                "Base layer is disabled",
                "Layer 0 must be enabled because QMK uses it as the default keymap layer.",
                &format!("{layer_path}.enabled"),
                &["Enable Layer 0 before exporting or building."],
            ));
        }

        if layer.assignments.len() != layout.key_count {
            issues.push(issue(
                "layer.assignmentCount.mismatch",
                IssueSeverity::Error,
                "Layer assignment count does not match layout",
                &format!(
                    "The selected layout has {} assignable keys, but this layer has {} assignments.",
                    layout.key_count,
                    layer.assignments.len()
                ),
                &format!("{layer_path}.assignments"),
                &["Add or remove assignments so the layer matches the selected layout."],
            ));
        }

        let mut visual_keys = BTreeSet::new();
        for (assignment_position, assignment) in layer.assignments.iter().enumerate() {
            let assignment_path = format!("{layer_path}.assignments[{assignment_position}]");

            let visual_key_id = assignment.visual_key_id.as_str();
            if !visual_keys.insert(visual_key_id) {
                issues.push(issue(
                    "assignment.visualKey.duplicate",
                    IssueSeverity::Error,
                    "Visual key is assigned twice in the same layer",
                    "Each visual key can only have one assignment per layer.",
                    &format!("{assignment_path}.visualKeyId"),
                    &["Remove the duplicate assignment."],
                ));
            }

            if !expected_visual_keys.contains(visual_key_id) {
                issues.push(issue(
                    "assignment.visualKey.unknown",
                    IssueSeverity::Error,
                    "Visual key is not in the selected layout",
                    &format!(
                        "{} does not exist in layout {}.",
                        assignment.visual_key_id, project.target.layout_id
                    ),
                    &format!("{assignment_path}.visualKeyId"),
                    &["Choose a visual key that exists in the selected layout."],
                ));
            }

            if layer.index == 0 && assignment.kind == AssignmentKind::Transparent {
                issues.push(issue(
                    "assignment.baseLayer.transparent",
                    IssueSeverity::Warning,
                    "Base layer contains a transparent key",
                    "Transparent keys on Layer 0 usually do not produce useful output.",
                    &assignment_path,
                    &["Assign a concrete keycode or no-key on the base layer."],
                ));
            }

            let layer_references = scan_layer_references(&assignment.qmk);
            if layer_references.malformed {
                issues.push(issue(
                    "assignment.layerReference.malformed",
                    IssueSeverity::Error,
                    "Layer keycode is malformed",
                    &format!("{} looks like a QMK layer keycode but cannot be parsed.", assignment.qmk),
                    &format!("{assignment_path}.qmk"),
                    &["Use a valid QMK layer keycode such as MO(1), LT(1, KC_SPC), or LM(1, MOD_LSFT)."],
                ));
            }

            for referenced_layer in layer_references.layers {
                if !layer_indexes.contains(&referenced_layer) {
                    issues.push(issue(
                        "assignment.layerReference.missing",
                        IssueSeverity::Error,
                        "Layer reference is invalid",
                        &format!(
                            "{} references Layer {}, but that layer does not exist.",
                            assignment.qmk, referenced_layer
                        ),
                        &format!("{assignment_path}.qmk"),
                        &[
                            "Create the referenced layer.",
                            "Change the key to an existing layer.",
                            "Clear the key.",
                        ],
                    ));
                }
            }
        }

        for missing_visual_key in expected_visual_keys.difference(&visual_keys) {
            issues.push(issue(
                "assignment.visualKey.missing",
                IssueSeverity::Error,
                "Layout key has no assignment",
                &format!(
                    "{} is missing an assignment on Layer {}.",
                    missing_visual_key, layer.index
                ),
                &format!("{layer_path}.assignments"),
                &["Assign a QMK keycode to every visual key in the selected layout."],
            ));
        }
    }

    ValidationReport {
        checked_at: checked_at_now(),
        context: ValidationContext {
            project_id: project.id.clone(),
            keyboard_target: project.target.qmk_keyboard.clone(),
            layout_id: project.target.layout_id.clone(),
            layout_macro: project.target.qmk_layout_macro.clone(),
            build_mode: project.build.mode.clone(),
            device_id: None,
        },
        status: status_for(&issues),
        issues,
    }
}

fn checked_at_now() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms:{millis}")
}

fn is_valid_keymap_name(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn status_for(issues: &[ValidationIssue]) -> ValidationStatus {
    if issues
        .iter()
        .any(|issue| issue.severity == IssueSeverity::Critical)
    {
        ValidationStatus::Critical
    } else if issues
        .iter()
        .any(|issue| issue.severity == IssueSeverity::Error)
    {
        ValidationStatus::Errors
    } else if issues
        .iter()
        .any(|issue| issue.severity == IssueSeverity::Warning)
    {
        ValidationStatus::Warnings
    } else {
        ValidationStatus::Valid
    }
}

fn issue(
    code: &str,
    severity: IssueSeverity,
    title: &str,
    message: &str,
    path: &str,
    remediation: &[&str],
) -> ValidationIssue {
    ValidationIssue {
        code: code.to_owned(),
        severity,
        title: title.to_owned(),
        message: message.to_owned(),
        path: path.to_owned(),
        remediation: remediation.iter().map(|item| item.to_string()).collect(),
    }
}

pub fn referenced_layers(qmk: &str) -> Vec<u8> {
    scan_layer_references(qmk).layers
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct LayerReferenceScan {
    layers: Vec<u8>,
    malformed: bool,
}

fn scan_layer_references(qmk: &str) -> LayerReferenceScan {
    let qmk = qmk.trim();
    let Some((name, rest)) = qmk.split_once('(') else {
        return LayerReferenceScan::default();
    };

    let expects_additional_args = match name {
        "MO" | "TO" | "TG" | "DF" | "OSL" | "TT" => false,
        "LT" | "LM" => true,
        _ => return LayerReferenceScan::default(),
    };

    parse_layer_call(rest, expects_additional_args)
}

fn parse_layer_call(rest: &str, expects_additional_args: bool) -> LayerReferenceScan {
    let Some(inner) = rest.strip_suffix(')') else {
        return LayerReferenceScan {
            layers: Vec::new(),
            malformed: true,
        };
    };

    let args: Vec<&str> = inner.split(',').collect();
    let expected_arg_count = if expects_additional_args { 2 } else { 1 };
    if args.len() != expected_arg_count
        || args
            .iter()
            .skip(1)
            .any(|remaining_arg| remaining_arg.trim().is_empty())
    {
        return LayerReferenceScan {
            layers: Vec::new(),
            malformed: true,
        };
    }

    parse_layer_arg(args[0])
}

fn parse_layer_arg(value: &str) -> LayerReferenceScan {
    let value = value.trim();
    if value.is_empty() || !value.chars().all(|ch| ch.is_ascii_digit()) {
        return LayerReferenceScan {
            layers: Vec::new(),
            malformed: true,
        };
    }

    value
        .parse::<u8>()
        .map(|layer| LayerReferenceScan {
            layers: vec![layer],
            malformed: false,
        })
        .unwrap_or(LayerReferenceScan {
            layers: Vec::new(),
            malformed: true,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_layer_references() {
        assert_eq!(referenced_layers("MO(2)"), vec![2]);
        assert_eq!(referenced_layers("TT(2)"), vec![2]);
        assert_eq!(referenced_layers("OSL(2)"), vec![2]);
        assert_eq!(referenced_layers("LT(3, KC_SPC)"), vec![3]);
        assert_eq!(referenced_layers("LM(4, MOD_LSFT)"), vec![4]);
        assert_eq!(referenced_layers("KC_A"), Vec::<u8>::new());
    }

    #[test]
    fn marks_malformed_layer_wrappers() {
        assert!(scan_layer_references("MO(2").malformed);
        assert!(scan_layer_references("LT(3)").malformed);
        assert!(scan_layer_references("LT(3, KC_A, KC_B)").malformed);
        assert!(scan_layer_references("MO(2, KC_A)").malformed);
        assert!(scan_layer_references("MO(foo)").malformed);
    }
}
