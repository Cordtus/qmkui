use crate::{
    CatalogError, FeatureCapabilities, FeatureState, KeyboardDefinition, LayoutDefinition,
    MatrixSize, SupportState, UsbId, VisualKey,
};
use serde::Deserialize;
use std::collections::BTreeMap;

/// A subset of QMK `info.json` that the catalog ingestion understands. QMK
/// metadata uses snake_case field names (e.g. `keyboard_name`), unlike the
/// catalog's camelCase wire format.
#[derive(Debug, Deserialize)]
struct QmkInfo {
    keyboard_name: Option<String>,
    manufacturer: Option<String>,
    #[serde(default)]
    aliases: Vec<String>,
    usb: Option<QmkUsb>,
    bootloader: Option<String>,
    processor: Option<String>,
    matrix_size: Option<QmkMatrixSize>,
    #[serde(default)]
    features: BTreeMap<String, serde_json::Value>,
    layouts: BTreeMap<String, QmkLayout>,
}

#[derive(Debug, Deserialize)]
struct QmkUsb {
    vid: Option<String>,
    pid: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QmkMatrixSize {
    rows: u16,
    cols: u16,
}

#[derive(Debug, Deserialize)]
struct QmkLayout {
    #[serde(default)]
    layout: Vec<QmkLayoutKey>,
}

#[derive(Debug, Deserialize)]
struct QmkLayoutKey {
    matrix: Option<(u16, u16)>,
    #[serde(default)]
    x: f32,
    #[serde(default)]
    y: f32,
    #[serde(default = "default_one")]
    w: f32,
    #[serde(default = "default_one")]
    h: f32,
    label: Option<String>,
}

/// Turns a list of `(qmk_keyboard_path, info.json contents)` pairs into a
/// deterministic catalog. Output is stable: boards are sorted by id, aliases
/// and layout keys preserve order, and USB ids are normalized to lowercase
/// four-hex-digit form.
pub fn ingest_qmk_boards(
    boards: &[(String, &str)],
) -> Result<Vec<KeyboardDefinition>, CatalogError> {
    let mut catalog: Vec<KeyboardDefinition> = Vec::with_capacity(boards.len());
    for (qmk_keyboard, info_json) in boards {
        let info: QmkInfo = serde_json::from_str(info_json).map_err(|error| {
            CatalogError::Invalid(format!("{qmk_keyboard} info.json is invalid: {error}"))
        })?;
        let definition = definition_from_info(qmk_keyboard, info);
        if !definition.layouts.is_empty() {
            catalog.push(definition);
        }
    }
    catalog.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(catalog)
}

fn definition_from_info(qmk_keyboard: &str, info: QmkInfo) -> KeyboardDefinition {
    let mut aliases = info.aliases.clone();
    aliases.sort();
    aliases.dedup();

    KeyboardDefinition {
        id: qmk_keyboard.to_owned(),
        qmk_keyboard: qmk_keyboard.to_owned(),
        display_name: info
            .keyboard_name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| qmk_keyboard.to_owned()),
        manufacturer: info.manufacturer.filter(|name| !name.trim().is_empty()),
        aliases,
        usb: info.usb.and_then(normalize_usb),
        bootloader: info.bootloader.filter(|value| !value.trim().is_empty()),
        processor: info.processor.filter(|value| !value.trim().is_empty()),
        matrix: info.matrix_size.map(|size| MatrixSize {
            rows: size.rows,
            cols: size.cols,
        }),
        layouts: info
            .layouts
            .into_iter()
            .map(|(layout_id, layout)| LayoutDefinition {
                id: layout_id.clone(),
                qmk_layout_macro: layout_id.clone(),
                display_name: layout_id,
                keys: layout
                    .layout
                    .into_iter()
                    .enumerate()
                    .map(|(index, key)| VisualKey {
                        id: visual_key_id(key.matrix, index),
                        x: key.x,
                        y: key.y,
                        w: key.w,
                        h: key.h,
                        label: key.label,
                    })
                    .collect(),
            })
            .collect(),
        features: features_from(&info.features),
        source: crate::CatalogSource {
            kind: "qmk-info-json".to_owned(),
            version: "1".to_owned(),
        },
        qmk_commit: None,
    }
}

fn visual_key_id(matrix: Option<(u16, u16)>, index: usize) -> String {
    match matrix {
        Some((row, col)) => format!("k{row}{col}"),
        None => format!("kpos{index}"),
    }
}

fn normalize_usb(usb: QmkUsb) -> Option<UsbId> {
    let vid = usb.vid.as_deref().and_then(normalize_usb_id)?;
    let pid = usb.pid.as_deref().and_then(normalize_usb_id)?;
    Some(UsbId { vid, pid })
}

fn normalize_usb_id(value: &str) -> Option<String> {
    let stripped = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
        .unwrap_or(value);
    if stripped.len() == 4 && stripped.chars().all(|ch| ch.is_ascii_hexdigit()) {
        Some(stripped.to_ascii_lowercase())
    } else {
        None
    }
}

fn features_from(features: &BTreeMap<String, serde_json::Value>) -> FeatureCapabilities {
    FeatureCapabilities {
        backlight: feature_state(features, "backlight"),
        rgblight: feature_state(features, "rgblight"),
        led_matrix: feature_state(features, "led_matrix"),
        rgb_matrix: feature_state(features, "rgb_matrix"),
        encoder: feature_state(features, "encoder"),
        via: feature_state(features, "via"),
        dynamic_keymap: feature_state(features, "dynamic_keymap"),
        raw_hid: feature_state(features, "raw_hid"),
        macros: feature_state(features, "macro"),
        combos: feature_state(features, "combos"),
        tap_dance: feature_state(features, "tap_dance"),
    }
}

fn feature_state(features: &BTreeMap<String, serde_json::Value>, name: &str) -> FeatureState {
    match features.get(name) {
        None => FeatureState {
            support: SupportState::Unknown,
            reason: None,
        },
        Some(serde_json::Value::Bool(true)) => FeatureState {
            support: SupportState::Supported,
            reason: None,
        },
        Some(serde_json::Value::Bool(false)) => FeatureState {
            support: SupportState::Unsupported,
            reason: None,
        },
        Some(_) => FeatureState {
            support: SupportState::Unknown,
            reason: Some("non-boolean feature value".to_owned()),
        },
    }
}

fn default_one() -> f32 {
    1.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{load_catalog, search};

    fn fixture_board(path: &str) -> (String, String) {
        let content = std::fs::read_to_string(format!(
            "{}/../../fixtures/qmk/keyboards/{path}/info.json",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("fixture info.json exists");
        (path.to_owned(), content)
    }

    fn as_boards(boards: &[(String, String)]) -> Vec<(String, &str)> {
        boards
            .iter()
            .map(|(path, content)| (path.clone(), content.as_str()))
            .collect()
    }

    #[test]
    fn ingests_fixture_boards_deterministically() {
        let one = fixture_board("example/one");
        let two = fixture_board("example/two");
        let first =
            ingest_qmk_boards(&as_boards(&[two.clone(), one.clone()])).expect("ingest succeeds");
        let second =
            ingest_qmk_boards(&as_boards(&[one.clone(), two.clone()])).expect("ingest succeeds");

        // Boards are sorted by id regardless of input order.
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].id, "example/one");
        assert_eq!(first[1].id, "example/two");

        // Serialization is byte-stable.
        let a = serde_json::to_vec(&first).expect("serializes");
        let b = serde_json::to_vec(&second).expect("serializes");
        assert_eq!(a, b);
    }

    #[test]
    fn ingests_identity_and_matrix_metadata() {
        let (path, info) = fixture_board("example/one");
        let catalog = ingest_qmk_boards(&[(path, info.as_str())]).expect("ingest succeeds");
        let board = &catalog[0];

        assert_eq!(board.id, "example/one");
        assert_eq!(board.display_name, "Fixture One");
        assert_eq!(board.manufacturer.as_deref(), Some("QMKUI Fixtures"));
        assert_eq!(board.usb.as_ref().map(|usb| usb.vid.as_str()), Some("feed"));
        assert_eq!(board.usb.as_ref().map(|usb| usb.pid.as_str()), Some("0001"));
        assert_eq!(board.bootloader.as_deref(), Some("atmel-dfu"));
        assert_eq!(board.processor.as_deref(), Some("RP2040"));
        assert_eq!(board.matrix, Some(MatrixSize { rows: 4, cols: 3 }));

        let layout = &board.layouts[0];
        assert_eq!(layout.id, "LAYOUT");
        assert_eq!(layout.qmk_layout_macro, "LAYOUT");
        assert_eq!(
            layout
                .keys
                .iter()
                .map(|key| key.id.as_str())
                .collect::<Vec<_>>(),
            vec!["k00", "k01", "k02", "k10"]
        );
        assert_eq!(layout.keys[0].label.as_deref(), Some("Esc"));
    }

    #[test]
    fn maps_boolean_features_to_support_states() {
        let (path, info) = fixture_board("example/one");
        let catalog = ingest_qmk_boards(&[(path, info.as_str())]).expect("ingest succeeds");
        let features = &catalog[0].features;

        assert_eq!(features.backlight.support, SupportState::Supported);
        assert_eq!(features.rgb_matrix.support, SupportState::Supported);
        assert_eq!(features.encoder.support, SupportState::Supported);
        assert_eq!(features.via.support, SupportState::Supported);
        assert_eq!(features.rgblight.support, SupportState::Unsupported);
        assert_eq!(features.combos.support, SupportState::Unknown);
    }

    #[test]
    fn normalizes_aliases_and_drops_missing_usb_ids() {
        let (path, info) = fixture_board("example/two");
        let catalog = ingest_qmk_boards(&[(path, info.as_str())]).expect("ingest succeeds");
        let board = &catalog[0];

        assert_eq!(board.aliases, vec!["two-a", "two-b"]);
        assert_eq!(board.usb, None);
    }

    #[test]
    fn generated_catalog_passes_validation_and_search() {
        let one = fixture_board("example/one");
        let two = fixture_board("example/two");
        let catalog = ingest_qmk_boards(&as_boards(&[one, two])).expect("ingest succeeds");
        let serialized = serde_json::to_string(&catalog).expect("serializes");

        let loaded = load_catalog(&serialized).expect("catalog validates");
        assert_eq!(loaded.len(), 2);
        assert_eq!(
            search(&loaded, "fixture one")[0].reason,
            crate::SearchMatchReason::DisplayName
        );
    }

    #[test]
    fn existing_fixture_still_loads_with_expanded_schema() {
        let catalog = load_catalog(include_str!("../../../fixtures/catalog/keyboards.json"))
            .expect("existing catalog still parses");
        assert_eq!(catalog[0].id, "example/keyboard");
    }
}
