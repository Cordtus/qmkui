use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardProject {
    pub schema_version: String,
    pub id: String,
    pub name: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub target: ProjectTarget,
    pub layers: Vec<KeymapLayer>,
    #[serde(default)]
    pub macros: Vec<serde_json::Value>,
    #[serde(default)]
    pub combos: Vec<serde_json::Value>,
    #[serde(default)]
    pub tap_dances: Vec<serde_json::Value>,
    #[serde(default)]
    pub encoders: Vec<serde_json::Value>,
    #[serde(default)]
    pub lighting_profiles: Vec<serde_json::Value>,
    pub build: BuildSettings,
    #[serde(default)]
    pub live: Option<serde_json::Value>,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTarget {
    pub keyboard_id: String,
    pub qmk_keyboard: String,
    pub layout_id: String,
    pub qmk_layout_macro: String,
    #[serde(default)]
    pub catalog_version: Option<String>,
    #[serde(default)]
    pub qmk_commit: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeymapLayer {
    pub id: String,
    pub index: u8,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub assignments: Vec<KeyAssignment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyAssignment {
    pub id: String,
    pub visual_key_id: String,
    #[serde(default)]
    pub matrix: Option<MatrixPosition>,
    pub kind: AssignmentKind,
    pub qmk: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub params: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MatrixPosition {
    pub row: u8,
    pub col: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssignmentKind {
    Basic,
    Modifier,
    Media,
    Mouse,
    Layer,
    ModTap,
    LayerTap,
    Macro,
    TapDance,
    Lighting,
    Bootloader,
    Transparent,
    None,
    Raw,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildSettings {
    pub mode: BuildMode,
    pub keymap_name: String,
    pub output_preference: OutputPreference,
    #[serde(default)]
    pub feature_flags: BTreeMap<String, bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildMode {
    LocalCli,
    RemoteApi,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OutputPreference {
    Json,
    C,
    Auto,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LayoutContract {
    pub key_count: usize,
    pub keyboard_id: Option<String>,
    pub qmk_keyboard: Option<String>,
    pub layout_id: Option<String>,
    pub qmk_layout_macro: Option<String>,
    pub visual_key_order: Vec<String>,
}

impl LayoutContract {
    pub fn new(visual_key_order: Vec<String>) -> Self {
        Self {
            key_count: visual_key_order.len(),
            keyboard_id: None,
            qmk_keyboard: None,
            layout_id: None,
            qmk_layout_macro: None,
            visual_key_order,
        }
    }

    pub fn for_layout(
        layout_id: impl Into<String>,
        qmk_layout_macro: impl Into<String>,
        visual_key_order: Vec<String>,
    ) -> Self {
        Self {
            key_count: visual_key_order.len(),
            keyboard_id: None,
            qmk_keyboard: None,
            layout_id: Some(layout_id.into()),
            qmk_layout_macro: Some(qmk_layout_macro.into()),
            visual_key_order,
        }
    }

    pub fn for_keyboard_layout(
        keyboard_id: impl Into<String>,
        qmk_keyboard: impl Into<String>,
        layout_id: impl Into<String>,
        qmk_layout_macro: impl Into<String>,
        visual_key_order: Vec<String>,
    ) -> Self {
        Self {
            key_count: visual_key_order.len(),
            keyboard_id: Some(keyboard_id.into()),
            qmk_keyboard: Some(qmk_keyboard.into()),
            layout_id: Some(layout_id.into()),
            qmk_layout_macro: Some(qmk_layout_macro.into()),
            visual_key_order,
        }
    }
}

fn default_true() -> bool {
    true
}
