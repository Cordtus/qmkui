use crate::model::{KeyboardProject, LayoutContract};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QmkKeymapJson {
    pub keyboard: String,
    pub keymap: String,
    pub layout: String,
    pub layers: Vec<Vec<String>>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ExportError {
    #[error("layer {layer} has {actual} assignments, expected {expected}")]
    AssignmentCount {
        layer: u8,
        expected: usize,
        actual: usize,
    },
    #[error("layer {layer} is missing assignment for visual key {visual_key_id}")]
    MissingVisualKey { layer: u8, visual_key_id: String },
}

pub fn export_qmk_keymap(
    project: &KeyboardProject,
    layout: &LayoutContract,
) -> Result<QmkKeymapJson, ExportError> {
    let mut layers = project.layers.clone();
    layers.sort_by_key(|layer| layer.index);

    let mut exported_layers = Vec::with_capacity(layers.len());
    for layer in layers {
        if layer.assignments.len() != layout.key_count {
            return Err(ExportError::AssignmentCount {
                layer: layer.index,
                expected: layout.key_count,
                actual: layer.assignments.len(),
            });
        }

        let by_visual_key: BTreeMap<&str, &str> = layer
            .assignments
            .iter()
            .map(|assignment| (assignment.visual_key_id.as_str(), assignment.qmk.as_str()))
            .collect();

        let mut output_layer = Vec::with_capacity(layout.key_count);
        for visual_key_id in &layout.visual_key_order {
            let qmk = by_visual_key.get(visual_key_id.as_str()).ok_or_else(|| {
                ExportError::MissingVisualKey {
                    layer: layer.index,
                    visual_key_id: visual_key_id.clone(),
                }
            })?;
            output_layer.push((*qmk).to_owned());
        }

        exported_layers.push(output_layer);
    }

    Ok(QmkKeymapJson {
        keyboard: project.target.qmk_keyboard.clone(),
        keymap: project.build.keymap_name.clone(),
        layout: project.target.qmk_layout_macro.clone(),
        layers: exported_layers,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::KeyboardProject;

    #[test]
    fn exports_layers_in_layout_order() {
        let project: KeyboardProject =
            serde_json::from_str(include_str!("../../../fixtures/projects/example-60.json"))
                .expect("fixture parses");
        let layout = LayoutContract::new(vec!["k00".into(), "k01".into(), "k02".into()]);

        let exported = export_qmk_keymap(&project, &layout).expect("project exports");

        assert_eq!(exported.keyboard, "example/keyboard");
        assert_eq!(exported.keymap, "example_60");
        assert_eq!(exported.layout, "LAYOUT");
        assert_eq!(
            exported.layers,
            vec![
                vec!["KC_ESC", "KC_A", "MO(1)"],
                vec!["KC_TRNS", "KC_MUTE", "KC_TRNS"],
            ]
        );
    }
}
