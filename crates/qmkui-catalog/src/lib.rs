use qmkui_core::LayoutContract;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardDefinition {
    pub id: String,
    pub qmk_keyboard: String,
    pub display_name: String,
    #[serde(default)]
    pub manufacturer: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub usb: Option<UsbId>,
    pub layouts: Vec<LayoutDefinition>,
    pub features: FeatureCapabilities,
    pub source: CatalogSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbId {
    pub vid: String,
    pub pid: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutDefinition {
    pub id: String,
    pub qmk_layout_macro: String,
    pub display_name: String,
    pub keys: Vec<VisualKey>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualKey {
    pub id: String,
    pub x: f32,
    pub y: f32,
    #[serde(default = "one")]
    pub w: f32,
    #[serde(default = "one")]
    pub h: f32,
    #[serde(default)]
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureCapabilities {
    pub backlight: FeatureState,
    pub rgblight: FeatureState,
    pub led_matrix: FeatureState,
    pub rgb_matrix: FeatureState,
    pub encoder: FeatureState,
    pub via: FeatureState,
    pub dynamic_keymap: FeatureState,
    pub raw_hid: FeatureState,
    pub macros: FeatureState,
    pub combos: FeatureState,
    pub tap_dance: FeatureState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureState {
    pub support: SupportState,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SupportState {
    Supported,
    Unsupported,
    Unknown,
    RequiresBuild,
    RequiresCustomC,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSource {
    pub kind: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardSearchResult {
    pub id: String,
    pub qmk_keyboard: String,
    pub display_name: String,
    pub reason: SearchMatchReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchMatchReason {
    QmkKeyboard,
    DisplayName,
    Manufacturer,
    Alias,
    UsbId,
}

#[derive(Debug, Error)]
pub enum CatalogError {
    #[error("catalog JSON is invalid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("catalog data is invalid: {0}")]
    Invalid(String),
    #[error("layout {layout_id} was not found for keyboard {keyboard_id}")]
    LayoutMissing {
        keyboard_id: String,
        layout_id: String,
    },
}

pub fn load_catalog(json: &str) -> Result<Vec<KeyboardDefinition>, CatalogError> {
    let catalog: Vec<KeyboardDefinition> = serde_json::from_str(json)?;
    validate_catalog(&catalog)?;
    Ok(catalog)
}

pub fn validate_catalog(catalog: &[KeyboardDefinition]) -> Result<(), CatalogError> {
    let mut keyboard_ids = BTreeSet::new();
    for keyboard in catalog {
        if keyboard.id.trim().is_empty() {
            return Err(CatalogError::Invalid("keyboard id is empty".to_owned()));
        }
        if !keyboard_ids.insert(keyboard.id.as_str()) {
            return Err(CatalogError::Invalid(format!(
                "keyboard id {} is duplicated",
                keyboard.id
            )));
        }
        if keyboard.qmk_keyboard.trim().is_empty() {
            return Err(CatalogError::Invalid(format!(
                "keyboard {} has an empty qmkKeyboard",
                keyboard.id
            )));
        }
        if let Some(usb) = &keyboard.usb {
            validate_usb_id(&keyboard.id, "vid", &usb.vid)?;
            validate_usb_id(&keyboard.id, "pid", &usb.pid)?;
        }

        let mut layout_ids = BTreeSet::new();
        for layout in &keyboard.layouts {
            if layout.id.trim().is_empty() {
                return Err(CatalogError::Invalid(format!(
                    "keyboard {} has an empty layout id",
                    keyboard.id
                )));
            }
            if !layout_ids.insert(layout.id.as_str()) {
                return Err(CatalogError::Invalid(format!(
                    "keyboard {} has duplicate layout id {}",
                    keyboard.id, layout.id
                )));
            }
            if layout.qmk_layout_macro.trim().is_empty() {
                return Err(CatalogError::Invalid(format!(
                    "layout {} has an empty qmkLayoutMacro",
                    layout.id
                )));
            }

            let mut visual_key_ids = BTreeSet::new();
            for key in &layout.keys {
                if key.id.trim().is_empty() {
                    return Err(CatalogError::Invalid(format!(
                        "layout {} has an empty visual key id",
                        layout.id
                    )));
                }
                if !visual_key_ids.insert(key.id.as_str()) {
                    return Err(CatalogError::Invalid(format!(
                        "layout {} has duplicate visual key id {}",
                        layout.id, key.id
                    )));
                }
            }
        }
    }

    Ok(())
}

pub fn search(catalog: &[KeyboardDefinition], query: &str) -> Vec<KeyboardSearchResult> {
    let needle = query.trim().to_ascii_lowercase();
    if needle.is_empty() {
        return catalog
            .iter()
            .map(|keyboard| search_result(keyboard, SearchMatchReason::DisplayName))
            .collect();
    }

    catalog
        .iter()
        .filter_map(|keyboard| {
            if keyboard.qmk_keyboard.to_ascii_lowercase().contains(&needle) {
                Some(search_result(keyboard, SearchMatchReason::QmkKeyboard))
            } else if keyboard.display_name.to_ascii_lowercase().contains(&needle) {
                Some(search_result(keyboard, SearchMatchReason::DisplayName))
            } else if keyboard
                .manufacturer
                .as_ref()
                .is_some_and(|manufacturer| manufacturer.to_ascii_lowercase().contains(&needle))
            {
                Some(search_result(keyboard, SearchMatchReason::Manufacturer))
            } else if keyboard
                .aliases
                .iter()
                .any(|alias| alias.to_ascii_lowercase().contains(&needle))
            {
                Some(search_result(keyboard, SearchMatchReason::Alias))
            } else if keyboard.usb.as_ref().is_some_and(|usb| {
                usb.vid.to_ascii_lowercase().contains(&needle)
                    || usb.pid.to_ascii_lowercase().contains(&needle)
            }) {
                Some(search_result(keyboard, SearchMatchReason::UsbId))
            } else {
                None
            }
        })
        .collect()
}

pub fn layout_contract(
    keyboard: &KeyboardDefinition,
    layout_id: &str,
) -> Result<LayoutContract, CatalogError> {
    let layout = keyboard
        .layouts
        .iter()
        .find(|layout| layout.id == layout_id)
        .ok_or_else(|| CatalogError::LayoutMissing {
            keyboard_id: keyboard.id.clone(),
            layout_id: layout_id.to_owned(),
        })?;

    Ok(LayoutContract::for_keyboard_layout(
        keyboard.id.clone(),
        keyboard.qmk_keyboard.clone(),
        layout.id.clone(),
        layout.qmk_layout_macro.clone(),
        layout.keys.iter().map(|key| key.id.clone()).collect(),
    ))
}

fn validate_usb_id(keyboard_id: &str, field: &str, value: &str) -> Result<(), CatalogError> {
    if value.len() == 4 && value.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Ok(());
    }

    Err(CatalogError::Invalid(format!(
        "keyboard {keyboard_id} has invalid USB {field} {value}"
    )))
}

fn search_result(keyboard: &KeyboardDefinition, reason: SearchMatchReason) -> KeyboardSearchResult {
    KeyboardSearchResult {
        id: keyboard.id.clone(),
        qmk_keyboard: keyboard.qmk_keyboard.clone(),
        display_name: keyboard.display_name.clone(),
        reason,
    }
}

fn one() -> f32 {
    1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn searches_by_qmk_target_alias_and_usb_id() {
        let catalog = load_catalog(include_str!("../../../fixtures/catalog/keyboards.json"))
            .expect("catalog parses");

        assert_eq!(
            search(&catalog, "example/keyboard")[0].reason,
            SearchMatchReason::QmkKeyboard
        );
        assert_eq!(
            search(&catalog, "daily")[0].reason,
            SearchMatchReason::Alias
        );
        assert_eq!(search(&catalog, "FEED")[0].reason, SearchMatchReason::UsbId);
        assert_eq!(
            search(&catalog, "qmkui fixtures")[0].reason,
            SearchMatchReason::Manufacturer
        );
    }

    #[test]
    fn layout_contract_preserves_visual_key_order() {
        let catalog = load_catalog(include_str!("../../../fixtures/catalog/keyboards.json"))
            .expect("catalog parses");

        let contract = layout_contract(&catalog[0], "LAYOUT").expect("layout exists");

        assert_eq!(contract.visual_key_order, vec!["k00", "k01", "k02"]);
        assert_eq!(contract.keyboard_id.as_deref(), Some("example/keyboard"));
        assert_eq!(contract.qmk_keyboard.as_deref(), Some("example/keyboard"));
        assert_eq!(contract.layout_id.as_deref(), Some("LAYOUT"));
        assert_eq!(contract.qmk_layout_macro.as_deref(), Some("LAYOUT"));
    }

    #[test]
    fn rejects_duplicate_visual_key_ids() {
        let catalog = r#"
        [
          {
            "id": "bad",
            "qmkKeyboard": "bad/keyboard",
            "displayName": "Bad Keyboard",
            "layouts": [
              {
                "id": "LAYOUT",
                "qmkLayoutMacro": "LAYOUT",
                "displayName": "Bad Layout",
                "keys": [
                  { "id": "k00", "x": 0, "y": 0 },
                  { "id": "k00", "x": 1, "y": 0 }
                ]
              }
            ],
            "features": {
              "backlight": { "support": "unknown" },
              "rgblight": { "support": "unknown" },
              "ledMatrix": { "support": "unknown" },
              "rgbMatrix": { "support": "unknown" },
              "encoder": { "support": "unknown" },
              "via": { "support": "unknown" },
              "dynamicKeymap": { "support": "unknown" },
              "rawHid": { "support": "unknown" },
              "macros": { "support": "unknown" },
              "combos": { "support": "unknown" },
              "tapDance": { "support": "unknown" }
            },
            "source": { "kind": "fixture", "version": "bad" }
          }
        ]
        "#;

        assert!(matches!(
            load_catalog(catalog),
            Err(CatalogError::Invalid(message)) if message.contains("duplicate visual key id")
        ));
    }
}
